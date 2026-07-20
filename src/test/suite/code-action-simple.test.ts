import * as assert from 'assert';
import * as vscode from 'vscode';
import { SecurityCodeActionProvider } from '../../providers/codeActionProvider';

suite('Code Action Provider Tests', () => {
    let provider: SecurityCodeActionProvider;

    setup(() => {
        provider = new SecurityCodeActionProvider();
    });

    // Helper to create mock document
    function createMockDocument(fileName: string, content: string): vscode.TextDocument {
        return {
            fileName,
            languageId: fileName.endsWith('.tf') ? 'terraform' :
                       fileName.endsWith('.yaml') || fileName.endsWith('.yml') ? 'yaml' :
                       fileName.endsWith('.json') ? 'json' : 'plaintext',
            lineAt: (line: number) => ({
                text: content,
                range: new vscode.Range(line, 0, line, content.length),
                rangeIncludingLineBreak: new vscode.Range(line, 0, line, content.length),
                firstNonWhitespace: 0,
                isEmptyOrWhitespace: false
            }),
            lineCount: 1,
            getText: () => content,
            uri: vscode.Uri.file(fileName),
            version: 1,
            isDirty: false,
            isUntitled: false,
            save: () => Promise.resolve(true),
            eol: vscode.EndOfLine.LF
        } as any;
    }

    // Helper to create mock diagnostic
    function createMockDiagnostic(message: string, range?: vscode.Range): vscode.Diagnostic {
        return {
            message,
            range: range || new vscode.Range(0, 0, 0, 10),
            severity: vscode.DiagnosticSeverity.Warning,
            source: 'CrowdStrike FCS'
        };
    }

    // Helper to get actions from provider
    async function getActions(document: vscode.TextDocument, diagnostic: vscode.Diagnostic): Promise<(vscode.CodeAction | vscode.Command)[]> {
        const range = new vscode.Range(0, 0, 0, 10);
        const context: vscode.CodeActionContext = {
            diagnostics: [diagnostic],
            only: undefined,
            triggerKind: vscode.CodeActionTriggerKind.Automatic
        };

        const result = provider.provideCodeActions(document, range, context, {} as vscode.CancellationToken);
        return Array.isArray(result) ? result : (await result) || [];
    }

    test('Should provide Terraform fixes for public bucket issues', async () => {
        const document = createMockDocument('main.tf', 'resource "aws_s3_bucket" "example" { ... }');
        const diagnostic = createMockDiagnostic('S3 bucket is public - security risk');

        const actions = await getActions(document, diagnostic);

        assert.ok(Array.isArray(actions), 'Should return an array of actions');
        assert.ok(actions.length > 0, 'Should provide at least one action for public bucket issue');

        // Check for specific Terraform fix
        const bucketFix = actions.filter(a => 'title' in a).find(action =>
            (action as vscode.CodeAction).title.includes('bucket') && (action as vscode.CodeAction).title.includes('private')
        );
        assert.ok(bucketFix, 'Should provide bucket privacy fix for Terraform');
    });

    test('Should provide YAML fixes for Kubernetes security context issues', async () => {
        const document = createMockDocument('deployment.yaml', 'apiVersion: apps/v1\nkind: Deployment');
        const diagnostic = createMockDiagnostic('Missing security context configuration');

        const actions = await getActions(document, diagnostic);

        assert.ok(Array.isArray(actions), 'Should return an array of actions');
        assert.ok(actions.length > 0, 'Should provide at least one action for security context issue');

        // Check for specific YAML fix
        const securityFix = actions.filter(a => 'title' in a).find(action =>
            (action as vscode.CodeAction).title.includes('security context')
        );
        assert.ok(securityFix, 'Should provide security context fix for YAML');
    });

    test('Should provide JSON fixes for encryption issues', async () => {
        const document = createMockDocument('template.json', '{ "Resources": { ... } }');
        const diagnostic = createMockDiagnostic('Missing encryption configuration');

        const actions = await getActions(document, diagnostic);

        assert.ok(Array.isArray(actions), 'Should return an array of actions');
        assert.ok(actions.length > 0, 'Should provide at least one action for encryption issue');
    });

    test('Should provide generic fixes for common security issues', async () => {
        const document = createMockDocument('config.txt', 'some configuration');
        const diagnostic = createMockDiagnostic('Hardcoded secret detected');

        const actions = await getActions(document, diagnostic);

        assert.ok(Array.isArray(actions), 'Should return an array of actions');
        // Generic fixes should be available for any file type
        assert.ok(actions.length > 0, 'Should provide generic security fixes');
    });

    test('Should handle non-FCS diagnostics correctly', async () => {
        const document = createMockDocument('test.js', 'var x = 1;');
        const diagnostic = createMockDiagnostic('Some other linter warning');
        diagnostic.source = 'eslint'; // Different source

        const actions = await getActions(document, diagnostic);

        // Should not provide FCS-specific actions for non-FCS diagnostics
        assert.ok(actions.length === 0, 'Should not provide actions for non-FCS diagnostics');
    });

    test('Should provide general actions when no specific fixes are available', async () => {
        const document = createMockDocument('unknown.config', 'some unknown config');
        const diagnostic = createMockDiagnostic('Unknown security issue type');

        const actions = await getActions(document, diagnostic);

        assert.ok(Array.isArray(actions), 'Should return an array of actions');
        // Should provide general actions even when specific fixes aren't available
        assert.ok(actions.length > 0, 'Should provide general actions as fallback');
    });

    test('Should handle multiple diagnostics correctly', async () => {
        const document = createMockDocument('main.tf', 'resource configuration');
        const diagnostic1 = createMockDiagnostic('Public bucket detected');
        const diagnostic2 = createMockDiagnostic('Missing encryption');

        const range = new vscode.Range(0, 0, 0, 10);
        const context: vscode.CodeActionContext = {
            diagnostics: [diagnostic1, diagnostic2],
            only: undefined,
            triggerKind: vscode.CodeActionTriggerKind.Automatic
        };

        const result = provider.provideCodeActions(document, range, context, {} as vscode.CancellationToken);
        const actions = Array.isArray(result) ? result : (await result) || [];

        assert.ok(Array.isArray(actions), 'Should return an array of actions');
        assert.ok(actions.length > 0, 'Should provide actions for multiple diagnostics');

        // Should have actions for both diagnostics
        const bucketActions = actions.filter(a => 'title' in a && (a as vscode.CodeAction).title.toLowerCase().includes('bucket'));
        const encryptActions = actions.filter(a => 'title' in a && (a as vscode.CodeAction).title.toLowerCase().includes('encrypt'));

        assert.ok(bucketActions.length > 0, 'Should provide bucket-related actions');
        assert.ok(encryptActions.length > 0, 'Should provide encryption-related actions');
    });

    // --- WorkspaceEdit content ---

    test('createTerraformBucketPrivateFix: replaces acl="public-read" with acl="private"', () => {
        const document = createMockDocument('main.tf', '  acl = "public-read"');
        const range = new vscode.Range(0, 0, 0, 20);
        const edit: vscode.WorkspaceEdit = (provider as any).createTerraformBucketPrivateFix(document, range);
        const edits = edit.get(document.uri);
        assert.ok(edits.length > 0, 'Should produce a replacement edit');
        assert.ok(edits[0].newText.includes('"private"'), `Expected "private" in: ${edits[0].newText}`);
        assert.ok(!edits[0].newText.includes('public-read'), 'Should remove public-read');
    });

    test('createTerraformBucketPrivateFix: produces empty edit when line has no acl attribute', () => {
        const document = createMockDocument('main.tf', '  bucket = "my-bucket"');
        const range = new vscode.Range(0, 0, 0, 20);
        const edit: vscode.WorkspaceEdit = (provider as any).createTerraformBucketPrivateFix(document, range);
        const edits = edit.get(document.uri);
        assert.strictEqual(edits.length, 0, 'Should not produce edits when acl is absent');
    });

    test('createSecurityCommentFix: inserts _fcs_security_issue field in JSON files', () => {
        const document = createMockDocument('template.json', '  "BucketName": "my-bucket"');
        const diagnostic = createMockDiagnostic('Unencrypted S3 bucket');
        const edit: vscode.WorkspaceEdit = (provider as any).createSecurityCommentFix(document, diagnostic);
        const edits = edit.get(document.uri);
        assert.ok(edits.length > 0, 'Should produce an insert edit');
        assert.ok(edits[0].newText.includes('_fcs_security_issue'), `Expected JSON field in: ${edits[0].newText}`);
        assert.ok(!edits[0].newText.startsWith('#'), 'Should not use a comment character in JSON');
    });

    test('createSecurityCommentFix: inserts comment line in Terraform files', () => {
        const document = createMockDocument('main.tf', '  acl = "public-read"');
        const diagnostic = createMockDiagnostic('S3 bucket is public');
        const edit: vscode.WorkspaceEdit = (provider as any).createSecurityCommentFix(document, diagnostic);
        const edits = edit.get(document.uri);
        assert.ok(edits.length > 0, 'Should produce an insert edit');
        assert.ok(edits[0].newText.includes('#'), `Expected comment character in: ${edits[0].newText}`);
        assert.ok(edits[0].newText.includes('Security Issue'), `Expected 'Security Issue' label in: ${edits[0].newText}`);
    });

    test('createSuppressCommentFix: inserts fcs:ignore comment in Terraform files', () => {
        const document = createMockDocument('main.tf', '  acl = "public-read"');
        const diagnostic = createMockDiagnostic('S3 bucket is public');
        diagnostic.code = 'rule-001';
        const edit: vscode.WorkspaceEdit = (provider as any).createSuppressCommentFix(document, diagnostic);
        const edits = edit.get(document.uri);
        assert.ok(edits.length > 0, 'Should produce an insert edit');
        assert.ok(edits[0].newText.includes('fcs:ignore'), `Expected fcs:ignore in: ${edits[0].newText}`);
        assert.ok(edits[0].newText.includes('rule-001'), `Expected rule id in: ${edits[0].newText}`);
    });

    test('createSuppressCommentFix: inserts _fcs_ignore field in JSON files', () => {
        const document = createMockDocument('template.json', '  "BucketName": "my-bucket"');
        const diagnostic = createMockDiagnostic('Unencrypted bucket');
        diagnostic.code = 'rule-002';
        const edit: vscode.WorkspaceEdit = (provider as any).createSuppressCommentFix(document, diagnostic);
        const edits = edit.get(document.uri);
        assert.ok(edits.length > 0, 'Should produce an insert edit');
        assert.ok(edits[0].newText.includes('_fcs_ignore'), `Expected _fcs_ignore in: ${edits[0].newText}`);
        assert.ok(edits[0].newText.includes('rule-002'), `Expected rule id in: ${edits[0].newText}`);
    });

    // --- File type isolation ---

    test('Should not offer Terraform bucket fix for YAML files', async () => {
        const document = createMockDocument('deployment.yaml', 'acl: public-read');
        const diagnostic = createMockDiagnostic('S3 bucket is public - bucket acl issue');
        const actions = await getActions(document, diagnostic);
        const bucketFix = actions.filter(a => 'title' in a).find(a =>
            (a as vscode.CodeAction).title.toLowerCase().includes('bucket') &&
            (a as vscode.CodeAction).title.toLowerCase().includes('private')
        );
        assert.strictEqual(bucketFix, undefined, 'Terraform bucket fix should not appear for YAML files');
    });

    test('Should not offer YAML security context fix for Terraform files', async () => {
        const document = createMockDocument('main.tf', 'resource "kubernetes_pod" "example" {}');
        const diagnostic = createMockDiagnostic('Missing security context privileged setting');
        const actions = await getActions(document, diagnostic);
        const contextFix = actions.filter(a => 'title' in a).find(a =>
            (a as vscode.CodeAction).title.toLowerCase().includes('security context')
        );
        assert.strictEqual(contextFix, undefined, 'YAML security context fix should not appear for Terraform files');
    });

    // --- Multi-word keyword matching ---

    test('configMatches: multi-word keyword requires all words present in diagnostic message', () => {
        const document = createMockDocument('deployment.yaml', 'containers:');
        // 'security context' keyword requires both words — 'security' alone should not match
        const diagnosticMissingWord = createMockDiagnostic('missing security configuration');
        const diagnosticBothWords = createMockDiagnostic('missing security context');
        const configEntry = { fileTypes: ['yaml'], keywords: ['security context'] };

        const noMatch = (provider as any).configMatches(document, diagnosticMissingWord.message.toLowerCase(), configEntry);
        const match = (provider as any).configMatches(document, diagnosticBothWords.message.toLowerCase(), configEntry);

        assert.strictEqual(noMatch, false, 'Should not match when only one word of multi-word keyword is present');
        assert.strictEqual(match, true, 'Should match when all words of multi-word keyword are present');
    });
});