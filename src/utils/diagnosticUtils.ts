/**
 * Diagnostic utilities using VS Code native APIs for simple, consistent range detection
 */

import * as vscode from 'vscode';
import { SecurityFinding } from '../types';

export class DiagnosticUtils {
    private static readonly SOURCE = 'CrowdStrike FCS';

    /**
     * Create a VS Code diagnostic from a security finding
     */
    public static createDiagnostic(
        document: vscode.TextDocument,
        finding: SecurityFinding
    ): vscode.Diagnostic {
        const range = this.createRange(document, finding);
        const severity = this.mapSeverity(finding.severity);

        const diagnostic = new vscode.Diagnostic(
            range,
            finding.rule_name || finding.title || finding.reason || 'Security Issue',
            severity
        );

        diagnostic.source = this.SOURCE;

        // Add detailed message with description and remediation
        const detailMessage = this.formatDiagnosticMessage(finding);
        if (detailMessage !== finding.title) {
            diagnostic.message = detailMessage;
        }

        // Add related information if available
        if (finding.category) {
            const tag = this.getCategoryTag(finding.category);
            if (tag !== undefined) {
                diagnostic.tags = [tag];
            }
        }

        return diagnostic;
    }

    /**
     * Create a simple range from first non-whitespace character to end of line
     */
    public static createRange(
        document: vscode.TextDocument,
        finding: SecurityFinding
    ): vscode.Range {
        // Ensure line numbers are within document bounds
        const maxLine = document.lineCount - 1;
        const startLine = Math.max(0, Math.min(finding.line - 1, maxLine)); // Convert to 0-based

        const lineText = document.lineAt(startLine).text;

        // Find first non-whitespace character
        const firstNonWhitespace = lineText.length - lineText.trimStart().length;

        // Create range from first non-whitespace to end of line
        return new vscode.Range(startLine, firstNonWhitespace, startLine, lineText.length);
    }

    /**
     * Map security finding severity to VS Code diagnostic severity
     */
    private static mapSeverity(severity: string): vscode.DiagnosticSeverity {
        switch (severity.toUpperCase()) {
            case 'CRITICAL':
                return vscode.DiagnosticSeverity.Error;
            case 'HIGH':
                return vscode.DiagnosticSeverity.Error;
            case 'MEDIUM':
                return vscode.DiagnosticSeverity.Warning;
            case 'INFORMATIONAL':
            case 'LOW':
                return vscode.DiagnosticSeverity.Information;
            default:
                return vscode.DiagnosticSeverity.Warning;
        }
    }

    /**
     * Get diagnostic tag for security category - use tags appropriately for VS Code
     */
    private static getCategoryTag(category: string): vscode.DiagnosticTag | undefined {
        const categoryLower = category.toLowerCase();

        // Only use Deprecated tag for actually deprecated/legacy issues
        if (categoryLower.includes('deprecated') ||
            categoryLower.includes('legacy') ||
            categoryLower.includes('obsolete')) {
            return vscode.DiagnosticTag.Deprecated;
        }

        // Only use Unnecessary tag for truly unnecessary code (not security issues)
        if (categoryLower.includes('unused') ||
            categoryLower.includes('redundant') ||
            categoryLower.includes('unnecessary')) {
            return vscode.DiagnosticTag.Unnecessary;
        }

        // For most security issues, don't use any tag to maintain their visibility
        return undefined;
    }

    /**
     * Format diagnostic message with description and remediation
     */
    private static formatDiagnosticMessage(finding: SecurityFinding): string {
        // Grab severity - better visibility when hovering
        const severity = finding.severity;
        // Use rule_name or fallback to title
        const title = finding.rule_name || finding.title || 'Security Issue';

        let message = `${title} (${severity})`;

        // Use reason or fallback to description
        const description = finding.reason || finding.description;
        if (description && description !== message) {
            message += `\n\nReason: ${description}`;
        }

        // Add recommendation/remediation
        const remediation = finding.recommendation || finding.remediation;
        if (remediation) {
            message += `\n\nRecommendation: ${remediation}`;
        }

        return message;
    }

    /**
     * Create diagnostic collection for the extension
     */
    public static createDiagnosticCollection(): vscode.DiagnosticCollection {
        return vscode.languages.createDiagnosticCollection(this.SOURCE);
    }

    /**
     * Update diagnostics for a document
     */
    public static updateDocumentDiagnostics(
        collection: vscode.DiagnosticCollection,
        document: vscode.TextDocument,
        findings: SecurityFinding[]
    ): void {
        const diagnostics = findings.map(finding =>
            this.createDiagnostic(document, finding)
        );

        collection.set(document.uri, diagnostics);
    }

    /**
     * Clear diagnostics for a document
     */
    public static clearDocumentDiagnostics(
        collection: vscode.DiagnosticCollection,
        document: vscode.TextDocument
    ): void {
        collection.delete(document.uri);
    }

    /**
     * Clear all diagnostics
     */
    public static clearAllDiagnostics(collection: vscode.DiagnosticCollection): void {
        collection.clear();
    }

    /**
     * Get diagnostics for a document
     */
    public static getDocumentDiagnostics(
        collection: vscode.DiagnosticCollection,
        document: vscode.TextDocument
    ): readonly vscode.Diagnostic[] | undefined {
        return collection.get(document.uri);
    }
}

export default DiagnosticUtils;
