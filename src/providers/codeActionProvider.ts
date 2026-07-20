/**
 * Code Action Provider for security issue quick fixes
 */

import * as vscode from 'vscode';
import { FileTypeDetector } from '../utils/fileTypeDetector';

export class SecurityCodeActionProvider implements vscode.CodeActionProvider {
    public static readonly providedCodeActionKinds = [
        vscode.CodeActionKind.QuickFix,
        vscode.CodeActionKind.SourceFixAll
    ];

    public provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<(vscode.CodeAction | vscode.Command)[]> {
        const actions: vscode.CodeAction[] = [];

        // Process FCS diagnostics only
        const fcsdiagnostics = context.diagnostics.filter(
            diagnostic => diagnostic.source === 'CrowdStrike FCS'
        );

        for (const diagnostic of fcsdiagnostics) {
            const quickFixes = this.createQuickFixActions(document, diagnostic, range);
            actions.push(...quickFixes);
        }

        // Add general actions if no specific fixes available
        if (actions.length === 0 && fcsdiagnostics.length > 0) {
            actions.push(...this.createGeneralActions(document, range));
        }

        return actions;
    }

    private createQuickFixActions(
        document: vscode.TextDocument,
        diagnostic: vscode.Diagnostic,
        range: vscode.Range
    ): vscode.CodeAction[] {
        const actions: vscode.CodeAction[] = [];
        const lineText = document.lineAt(diagnostic.range.start.line).text;
        const diagnosticText = diagnostic.message.toLowerCase();

        // KISS: Single method with configuration-driven fixes
        actions.push(...this.createConfiguredFixes(document, diagnostic, lineText, diagnosticText));

        return actions;
    }

    /**
     * Creates fixes using configuration-driven approach
     * KISS principle: One method with data-driven configuration instead of 4 separate methods
     */
    private createConfiguredFixes(
        document: vscode.TextDocument,
        diagnostic: vscode.Diagnostic,
        lineText: string,
        diagnosticText: string
    ): vscode.CodeAction[] {
        const actions: vscode.CodeAction[] = [];

        // Configuration for all fix types
        const fixConfigs = [
            // Terraform fixes
            {
                fileTypes: ['terraform'],
                keywords: ['public', 'bucket'],
                title: 'Make S3 bucket private',
                createFix: () => this.createTerraformBucketPrivateFix(document, diagnostic.range)
            },
            {
                fileTypes: ['terraform'],
                keywords: ['encrypt', 'kms'],
                title: 'Add encryption configuration',
                createFix: () => this.createEncryptionFix(document, diagnostic.range, lineText)
            },
            // YAML/Kubernetes fixes
            {
                fileTypes: ['yaml'],
                keywords: ['security context', 'privileged'],
                title: 'Add security context',
                createFix: () => this.createSecurityContextFix(document, diagnostic.range)
            },
            {
                fileTypes: ['yaml'],
                keywords: ['resource', 'limit'],
                title: 'Add resource limits',
                createFix: () => this.createResourceLimitsFix(document, diagnostic.range)
            },
            // JSON fixes
            {
                fileTypes: ['json'],
                keywords: ['encrypt'],
                title: 'Add encryption configuration',
                createFix: () => this.createEncryptionFix(document, diagnostic.range, lineText)
            },
            // Generic fixes (apply to all file types)
            {
                fileTypes: ['*'],
                keywords: ['secret', 'password', 'key'],
                title: 'Replace hardcoded value with environment variable',
                createFix: () => this.createEnvironmentVariableFix(document, diagnostic.range, lineText)
            },
            {
                fileTypes: ['*'],
                keywords: ['comment', 'add comment', 'todo'],
                title: 'Add security comment',
                createFix: () => this.createSecurityCommentFix(document, diagnostic)
            }
        ];

        // Apply matching configurations
        for (const config of fixConfigs) {
            if (this.configMatches(document, diagnosticText, config)) {
                const action = new vscode.CodeAction(config.title, vscode.CodeActionKind.QuickFix);
                action.edit = config.createFix();
                action.diagnostics = [diagnostic];
                actions.push(action);
            }
        }

        return actions;
    }

    /**
     * Checks if a fix configuration matches the current context
     */
    private configMatches(
        document: vscode.TextDocument,
        diagnosticText: string,
        config: { fileTypes: string[]; keywords: string[] }
    ): boolean {
        // Check file type match
        const fileTypeMatches = config.fileTypes.includes('*') ||
            (config.fileTypes.includes('terraform') && this.isTerraformFile(document)) ||
            (config.fileTypes.includes('yaml') && this.isYamlFile(document)) ||
            (config.fileTypes.includes('json') && this.isJsonFile(document));

        if (!fileTypeMatches) {
            return false;
        }

        // Check keyword match
        return config.keywords.some(keyword =>
            keyword.split(' ').every(word => diagnosticText.includes(word))
        );
    }

    private createGeneralActions(
        document: vscode.TextDocument,
        range: vscode.Range
    ): vscode.CodeAction[] {
        const actions: vscode.CodeAction[] = [];

        // Scan file again
        const rescanAction = new vscode.CodeAction(
            'Rescan file for security issues',
            vscode.CodeActionKind.Source
        );
        rescanAction.command = {
            command: 'fcs.scanFile',
            title: 'Rescan file'
        };
        actions.push(rescanAction);

        // Open FCS documentation
        const docsAction = new vscode.CodeAction(
            'View FCS security documentation',
            vscode.CodeActionKind.Source
        );
        docsAction.command = {
            command: 'vscode.open',
            title: 'Open documentation',
            arguments: [vscode.Uri.parse('https://falcon.crowdstrike.com/documentation')]
        };
        actions.push(docsAction);

        return actions;
    }

    // Helper methods for creating specific fixes

    private createTerraformBucketPrivateFix(
        document: vscode.TextDocument,
        range: vscode.Range
    ): vscode.WorkspaceEdit {
        const edit = new vscode.WorkspaceEdit();
        const line = document.lineAt(range.start.line);

        if (line.text.includes('acl')) {
            // Replace public ACL with private
            const newText = line.text.replace(/acl\s*=\s*["']public-read["']/, 'acl = "private"');
            edit.replace(document.uri, line.range, newText);
        }

        return edit;
    }

    private createEncryptionFix(
        document: vscode.TextDocument,
        range: vscode.Range,
        lineText: string
    ): vscode.WorkspaceEdit {
        const edit = new vscode.WorkspaceEdit();
        const insertPosition = new vscode.Position(range.end.line + 1, 0);
        const indent = this.getIndentation(lineText);

        const encryptionConfig = `${indent}server_side_encryption_configuration {\n${indent}  rule {\n${indent}    apply_server_side_encryption_by_default {\n${indent}      sse_algorithm = "AES256"\n${indent}    }\n${indent}  }\n${indent}}\n`;

        edit.insert(document.uri, insertPosition, encryptionConfig);
        return edit;
    }

    private createSecurityGroupFix(
        document: vscode.TextDocument,
        range: vscode.Range
    ): vscode.WorkspaceEdit {
        const edit = new vscode.WorkspaceEdit();
        const line = document.lineAt(range.start.line);

        // Replace 0.0.0.0/0 with a more restrictive CIDR
        const newText = line.text.replace('0.0.0.0/0', '10.0.0.0/8  # TODO: Replace with specific CIDR');
        edit.replace(document.uri, line.range, newText);

        return edit;
    }

    private createSecurityContextFix(
        document: vscode.TextDocument,
        range: vscode.Range
    ): vscode.WorkspaceEdit {
        const edit = new vscode.WorkspaceEdit();
        const line = document.lineAt(range.start.line);
        const indent = this.getIndentation(line.text);
        const insertPosition = new vscode.Position(range.end.line + 1, 0);

        const securityContext = `${indent}securityContext:\n${indent}  runAsNonRoot: true\n${indent}  runAsUser: 1000\n${indent}  readOnlyRootFilesystem: true\n${indent}  allowPrivilegeEscalation: false\n${indent}  capabilities:\n${indent}    drop:\n${indent}    - ALL\n`;

        edit.insert(document.uri, insertPosition, securityContext);
        return edit;
    }

    private createResourceLimitsFix(
        document: vscode.TextDocument,
        range: vscode.Range
    ): vscode.WorkspaceEdit {
        const edit = new vscode.WorkspaceEdit();
        const line = document.lineAt(range.start.line);
        const indent = this.getIndentation(line.text);
        const insertPosition = new vscode.Position(range.end.line + 1, 0);

        const resourceLimits = `${indent}resources:\n${indent}  limits:\n${indent}    cpu: "500m"\n${indent}    memory: "128Mi"\n${indent}  requests:\n${indent}    cpu: "100m"\n${indent}    memory: "64Mi"\n`;

        edit.insert(document.uri, insertPosition, resourceLimits);
        return edit;
    }

    private createCloudFormationFix(
        document: vscode.TextDocument,
        range: vscode.Range
    ): vscode.WorkspaceEdit {
        const edit = new vscode.WorkspaceEdit();
        // CloudFormation-specific fixes would go here
        // For now, just add a comment
        return this.createSecurityCommentFix(document, { range } as vscode.Diagnostic);
    }

    private createEnvironmentVariableFix(
        document: vscode.TextDocument,
        range: vscode.Range,
        lineText: string
    ): vscode.WorkspaceEdit {
        const edit = new vscode.WorkspaceEdit();
        const line = document.lineAt(range.start.line);

        // Find hardcoded values in quotes and suggest environment variable replacement
        const quotedValueRegex = /["']([^"']+)["']/;
        const match = line.text.match(quotedValueRegex);

        if (match) {
            const envVarName = 'ENV_VAR_NAME'; // Placeholder - could be made smarter
            const newText = line.text.replace(quotedValueRegex, `process.env.${envVarName} || "${match[1]}"`);
            const comment = ` ${this.getCommentChar(document)} TODO: Set ${envVarName} environment variable`;

            edit.replace(document.uri, line.range, newText + comment);
        }

        return edit;
    }

    private createSecurityCommentFix(
        document: vscode.TextDocument,
        diagnostic: vscode.Diagnostic
    ): vscode.WorkspaceEdit {
        const edit = new vscode.WorkspaceEdit();
        const line = document.lineAt(diagnostic.range.start.line);
        const indent = this.getIndentation(line.text);
        const insertPosition = new vscode.Position(diagnostic.range.start.line, 0);

        // Handle JSON files differently since they don't support comments
        if (this.isJsonFile(document)) {
            // For JSON, add a "_comment" field instead of a comment line
            const commentField = `${indent}"_fcs_security_issue": "${diagnostic.message.replace(/"/g, '\\"')}",\n`;
            edit.insert(document.uri, insertPosition, commentField);
        } else {
            const commentChar = this.getCommentChar(document);
            const comment = `${indent}${commentChar} Security Issue: ${diagnostic.message}\n`;
            edit.insert(document.uri, insertPosition, comment);
        }

        return edit;
    }

    private createSuppressCommentFix(
        document: vscode.TextDocument,
        diagnostic: vscode.Diagnostic
    ): vscode.WorkspaceEdit {
        const edit = new vscode.WorkspaceEdit();
        const line = document.lineAt(diagnostic.range.start.line);
        const indent = this.getIndentation(line.text);
        const insertPosition = new vscode.Position(diagnostic.range.start.line, 0);
        const ruleId = diagnostic.code || 'unknown';

        // Handle JSON files differently since they don't support comments
        if (this.isJsonFile(document)) {
            // For JSON, add a "_fcs_ignore" field instead of a comment line
            const suppressField = `${indent}"_fcs_ignore": "${ruleId}",\n`;
            edit.insert(document.uri, insertPosition, suppressField);
        } else {
            const commentChar = this.getCommentChar(document);
            const comment = `${indent}${commentChar} fcs:ignore ${ruleId} - Accepted risk\n`;
            edit.insert(document.uri, insertPosition, comment);
        }

        return edit;
    }

    // Utility methods

    private isTerraformFile(document: vscode.TextDocument): boolean {
        return FileTypeDetector.isTerraformFile(document);
    }

    private isYamlFile(document: vscode.TextDocument): boolean {
        return FileTypeDetector.isYamlFile(document);
    }

    private isJsonFile(document: vscode.TextDocument): boolean {
        return FileTypeDetector.isJsonFile(document);
    }

    private getIndentation(lineText: string): string {
        const match = lineText.match(/^(\s*)/);
        return match ? match[1] : '';
    }

    private getCommentChar(document: vscode.TextDocument): string {
        if (this.isTerraformFile(document)) return '#';
        if (this.isYamlFile(document)) return '#';
        if (FileTypeDetector.isBicepFile(document)) return '//';
        // Note: JSON case is handled separately in the comment methods above
        return '#';
    }
}

export default SecurityCodeActionProvider;