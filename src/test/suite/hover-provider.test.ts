import * as assert from 'assert';
import * as vscode from 'vscode';
import { SecurityHoverProvider } from '../../providers/hoverProvider';

suite('SecurityHoverProvider Tests', () => {
    let provider: SecurityHoverProvider;

    setup(() => {
        provider = new SecurityHoverProvider();
    });

    function createMockDiagnostic(message: string): vscode.Diagnostic {
        return {
            message,
            range: new vscode.Range(0, 0, 0, 10),
            severity: vscode.DiagnosticSeverity.Warning,
            source: 'CrowdStrike FCS'
        } as vscode.Diagnostic;
    }

    function createMockDocument(fileName: string, content: string = ''): vscode.TextDocument {
        return {
            fileName,
            languageId: fileName.endsWith('.tf') ? 'terraform' :
                        fileName.endsWith('.yaml') || fileName.endsWith('.yml') ? 'yaml' :
                        fileName.endsWith('.json') ? 'json' : 'plaintext',
            getText: () => content,
            uri: vscode.Uri.file(fileName)
        } as any;
    }

    function getContextualInfo(diagnostic: vscode.Diagnostic, document: vscode.TextDocument): string | null {
        return (provider as any).getContextualSecurityInfo(diagnostic, document);
    }

    // --- Regression: no infinite recursion for yaml/json ---

    test('getContextualSecurityInfo: returns content for generic YAML (non-Kubernetes) without recursing', () => {
        const diagnostic = createMockDiagnostic('insecure configuration detected');
        const document = createMockDocument('playbook.yml', '- name: install packages');
        const result = getContextualInfo(diagnostic, document);
        assert.ok(result !== null, 'Should return context info for YAML files');
        assert.ok(result!.length > 0);
    });

    test('getContextualSecurityInfo: returns content for generic JSON (non-CloudFormation) without recursing', () => {
        const diagnostic = createMockDiagnostic('insecure configuration detected');
        const document = createMockDocument('config.json', '{"setting": "value"}');
        const result = getContextualInfo(diagnostic, document);
        assert.ok(result !== null, 'Should return context info for JSON files');
        assert.ok(result!.length > 0);
    });

    test('getContextualSecurityInfo: returns null for unknown file types without recursing', () => {
        const diagnostic = createMockDiagnostic('insecure configuration detected');
        const document = createMockDocument('config.toml', '[settings]');
        const result = getContextualInfo(diagnostic, document);
        assert.strictEqual(result, null, 'Should return null for unknown file types');
    });

    // --- Platform cases ---

    test('getContextualSecurityInfo: returns content for Terraform files', () => {
        const diagnostic = createMockDiagnostic('insecure configuration');
        const document = createMockDocument('main.tf');
        const result = getContextualInfo(diagnostic, document);
        assert.ok(result !== null && result.length > 0);
    });

    test('getContextualSecurityInfo: returns content for Kubernetes YAML (apiVersion present)', () => {
        const diagnostic = createMockDiagnostic('insecure configuration');
        const document = createMockDocument('deployment.yaml', 'apiVersion: apps/v1\nkind: Deployment');
        const result = getContextualInfo(diagnostic, document);
        assert.ok(result !== null && result.length > 0);
    });

    test('getContextualSecurityInfo: returns content for CloudFormation JSON (AWSTemplateFormatVersion present)', () => {
        const diagnostic = createMockDiagnostic('insecure configuration');
        const document = createMockDocument('template.json', '{"AWSTemplateFormatVersion": "2010-09-09"}');
        const result = getContextualInfo(diagnostic, document);
        assert.ok(result !== null && result.length > 0);
    });

    test('getContextualSecurityInfo: returns content for Dockerfile', () => {
        const diagnostic = createMockDiagnostic('insecure configuration');
        const document = createMockDocument('Dockerfile', 'FROM ubuntu:latest');
        const result = getContextualInfo(diagnostic, document);
        assert.ok(result !== null && result.length > 0);
    });

    test('getContextualSecurityInfo: uses platform from diagnostic message over file type', () => {
        // Diagnostic explicitly mentions terraform even though file is YAML
        const diagnostic = createMockDiagnostic('terraform resource has insecure configuration');
        const document = createMockDocument('playbook.yml', '- name: install');
        const result = getContextualInfo(diagnostic, document);
        assert.ok(result !== null && result.length > 0);
        assert.ok(result!.toLowerCase().includes('terraform') || result!.toLowerCase().includes('infrastructure'));
    });

    // --- Ansible/Azure via diagnostic platform detection ---

    test('getContextualSecurityInfo: returns content when diagnostic identifies ansible platform', () => {
        const diagnostic = createMockDiagnostic('ansible task uses insecure module');
        const document = createMockDocument('playbook.yml', '- name: install');
        const result = getContextualInfo(diagnostic, document);
        assert.ok(result !== null && result.length > 0);
    });

    test('getContextualSecurityInfo: returns content when diagnostic identifies azure platform', () => {
        const diagnostic = createMockDiagnostic('azure resource has public access');
        const document = createMockDocument('template.json', '{"setting": "value"}');
        const result = getContextualInfo(diagnostic, document);
        assert.ok(result !== null && result.length > 0);
    });

    test('getContextualSecurityInfo: returns content for Bicep files', () => {
        const diagnostic = createMockDiagnostic('insecure configuration');
        const document = {
            fileName: 'main.bicep',
            languageId: 'bicep',
            getText: () => '',
            uri: vscode.Uri.file('main.bicep')
        } as any;
        const result = getContextualInfo(diagnostic, document);
        assert.ok(result !== null && result.length > 0);
        assert.ok(result!.toLowerCase().includes('azure') || result!.toLowerCase().includes('bicep'));
    });

    test('getContextualSecurityInfo: returns content when diagnostic identifies bicep via message', () => {
        const diagnostic = {
            message: 'bicep resource has insecure configuration',
            range: new vscode.Range(0, 0, 0, 10),
            severity: vscode.DiagnosticSeverity.Warning,
            source: 'CrowdStrike FCS'
        } as vscode.Diagnostic;
        const document = createMockDocument('template.json', '{"setting": "value"}');
        const result = getContextualInfo(diagnostic, document);
        assert.ok(result !== null && result.length > 0);
        assert.ok(result!.toLowerCase().includes('azure') || result!.toLowerCase().includes('bicep'));
    });
});
