import * as assert from 'assert';
import * as vscode from 'vscode';
import { DiagnosticUtils } from '../../utils/diagnosticUtils';
import { SecurityFinding } from '../../types';

function makeFinding(overrides: Partial<SecurityFinding> = {}): SecurityFinding {
    return {
        file: '/project/main.tf',
        line: 1,
        reason: 'S3 bucket has public access enabled',
        severity: 'High',
        rule_name: 'S3 Bucket ACL Too Permissive',
        rule_uuid: 'rule-001',
        rule_category: 'Access Control',
        recommendation: 'Set bucket ACL to private',
        ...overrides
    };
}

suite('DiagnosticUtils Tests', () => {
    let collection: vscode.DiagnosticCollection;
    let doc: vscode.TextDocument;

    suiteSetup(async () => {
        // Line 0: 'resource "aws_s3_bucket" "example" {'  — no leading whitespace
        // Line 1: '  acl = "public-read"'                — 2 leading spaces
        // Line 2: '}'                                     — no leading whitespace
        doc = await vscode.workspace.openTextDocument({
            content: 'resource "aws_s3_bucket" "example" {\n  acl = "public-read"\n}\n',
            language: 'terraform'
        });
        collection = vscode.languages.createDiagnosticCollection('fcs-test');
    });

    suiteTeardown(() => {
        collection.dispose();
    });

    teardown(() => {
        collection.clear();
    });

    // --- mapSeverity() ---

    test('mapSeverity: Critical and High map to Error severity', () => {
        const mapSeverity = (DiagnosticUtils as any).mapSeverity.bind(DiagnosticUtils);
        assert.strictEqual(mapSeverity('CRITICAL'), vscode.DiagnosticSeverity.Error);
        assert.strictEqual(mapSeverity('HIGH'), vscode.DiagnosticSeverity.Error);
        assert.strictEqual(mapSeverity('critical'), vscode.DiagnosticSeverity.Error);
    });

    test('mapSeverity: Medium maps to Warning severity', () => {
        const mapSeverity = (DiagnosticUtils as any).mapSeverity.bind(DiagnosticUtils);
        assert.strictEqual(mapSeverity('MEDIUM'), vscode.DiagnosticSeverity.Warning);
        assert.strictEqual(mapSeverity('medium'), vscode.DiagnosticSeverity.Warning);
    });

    test('mapSeverity: Low and Informational map to Information severity', () => {
        const mapSeverity = (DiagnosticUtils as any).mapSeverity.bind(DiagnosticUtils);
        assert.strictEqual(mapSeverity('LOW'), vscode.DiagnosticSeverity.Information);
        assert.strictEqual(mapSeverity('INFORMATIONAL'), vscode.DiagnosticSeverity.Information);
    });

    test('mapSeverity: unrecognized severity defaults to Warning', () => {
        const mapSeverity = (DiagnosticUtils as any).mapSeverity.bind(DiagnosticUtils);
        assert.strictEqual(mapSeverity('UNKNOWN'), vscode.DiagnosticSeverity.Warning);
        assert.strictEqual(mapSeverity(''), vscode.DiagnosticSeverity.Warning);
    });

    // --- getCategoryTag() ---

    test('getCategoryTag: deprecated/legacy/obsolete categories return Deprecated tag', () => {
        const getCategoryTag = (DiagnosticUtils as any).getCategoryTag.bind(DiagnosticUtils);
        assert.strictEqual(getCategoryTag('Deprecated API'), vscode.DiagnosticTag.Deprecated);
        assert.strictEqual(getCategoryTag('legacy configuration'), vscode.DiagnosticTag.Deprecated);
        assert.strictEqual(getCategoryTag('obsolete setting'), vscode.DiagnosticTag.Deprecated);
    });

    test('getCategoryTag: unused/redundant/unnecessary categories return Unnecessary tag', () => {
        const getCategoryTag = (DiagnosticUtils as any).getCategoryTag.bind(DiagnosticUtils);
        assert.strictEqual(getCategoryTag('unused resource'), vscode.DiagnosticTag.Unnecessary);
        assert.strictEqual(getCategoryTag('redundant rule'), vscode.DiagnosticTag.Unnecessary);
        assert.strictEqual(getCategoryTag('unnecessary permission'), vscode.DiagnosticTag.Unnecessary);
    });

    test('getCategoryTag: standard security categories return undefined to preserve visibility', () => {
        const getCategoryTag = (DiagnosticUtils as any).getCategoryTag.bind(DiagnosticUtils);
        assert.strictEqual(getCategoryTag('Access Control'), undefined);
        assert.strictEqual(getCategoryTag('Encryption'), undefined);
        assert.strictEqual(getCategoryTag('Network Security'), undefined);
    });

    // --- formatDiagnosticMessage() ---

    test('formatDiagnosticMessage: includes severity, rule name, reason, and recommendation', () => {
        const format = (DiagnosticUtils as any).formatDiagnosticMessage.bind(DiagnosticUtils);
        const msg = format(makeFinding());
        assert.ok(msg.includes('High'), 'Should include severity');
        assert.ok(msg.includes('S3 Bucket ACL Too Permissive'), 'Should include rule name');
        assert.ok(msg.includes('public access enabled'), 'Should include reason');
        assert.ok(msg.includes('Set bucket ACL to private'), 'Should include recommendation');
    });

    test('formatDiagnosticMessage: falls back to title when rule_name is absent', () => {
        const format = (DiagnosticUtils as any).formatDiagnosticMessage.bind(DiagnosticUtils);
        const msg = format(makeFinding({ rule_name: undefined, title: 'Fallback Title' }));
        assert.ok(msg.includes('Fallback Title'));
    });

    test('formatDiagnosticMessage: omits Recommendation section when field is absent', () => {
        const format = (DiagnosticUtils as any).formatDiagnosticMessage.bind(DiagnosticUtils);
        const msg = format(makeFinding({ recommendation: undefined, remediation: undefined }));
        assert.ok(!msg.includes('Recommendation:'));
    });

    test('formatDiagnosticMessage: uses remediation as fallback when recommendation is absent', () => {
        const format = (DiagnosticUtils as any).formatDiagnosticMessage.bind(DiagnosticUtils);
        const msg = format(makeFinding({ recommendation: undefined, remediation: 'Use private ACL' }));
        assert.ok(msg.includes('Use private ACL'));
    });

    // --- createDiagnostic() ---

    test('createDiagnostic: severity is mapped and source is set to CrowdStrike FCS', () => {
        const diag = DiagnosticUtils.createDiagnostic(doc, makeFinding({ severity: 'High' }));
        assert.strictEqual(diag.severity, vscode.DiagnosticSeverity.Error);
        assert.strictEqual(diag.source, 'CrowdStrike FCS');
    });

    test('createDiagnostic: diagnostic code is not set', () => {
        const diag = DiagnosticUtils.createDiagnostic(doc, makeFinding({ rule_uuid: 'uuid-999' }));
        assert.strictEqual(diag.code, undefined);
    });

    test('createDiagnostic: range is clamped when line number exceeds document length', () => {
        const diag = DiagnosticUtils.createDiagnostic(doc, makeFinding({ line: 9999 }));
        assert.ok(diag.range.start.line <= doc.lineCount - 1);
    });

    test('createDiagnostic: range start character is at first non-whitespace on the line', () => {
        // Line 2 (1-based) = index 1 = '  acl = "public-read"' → 2 leading spaces
        const diag = DiagnosticUtils.createDiagnostic(doc, makeFinding({ line: 2 }));
        assert.strictEqual(diag.range.start.character, 2);
    });

    test('createDiagnostic: attaches Deprecated tag for deprecated-category findings', () => {
        const finding = makeFinding({ category: 'deprecated feature', rule_category: 'deprecated feature' });
        const diag = DiagnosticUtils.createDiagnostic(doc, finding);
        assert.ok(diag.tags?.includes(vscode.DiagnosticTag.Deprecated));
    });

    test('createDiagnostic: no diagnostic tags for standard security categories', () => {
        const diag = DiagnosticUtils.createDiagnostic(doc, makeFinding({ category: 'Access Control' }));
        assert.ok(!diag.tags || diag.tags.length === 0);
    });

    test('createDiagnostic: finding with Informational severity maps to Information', () => {
        const diag = DiagnosticUtils.createDiagnostic(doc, makeFinding({ severity: 'Informational' }));
        assert.strictEqual(diag.severity, vscode.DiagnosticSeverity.Information);
    });

    // --- collection management ---

    test('updateDocumentDiagnostics: sets the expected number of diagnostics', () => {
        const findings = [makeFinding({ line: 1 }), makeFinding({ line: 2 })];
        DiagnosticUtils.updateDocumentDiagnostics(collection, doc, findings);
        assert.strictEqual(DiagnosticUtils.getDocumentDiagnostics(collection, doc)?.length, 2);
    });

    test('clearDocumentDiagnostics: removes diagnostics for the document', () => {
        DiagnosticUtils.updateDocumentDiagnostics(collection, doc, [makeFinding()]);
        DiagnosticUtils.clearDocumentDiagnostics(collection, doc);
        const diags = DiagnosticUtils.getDocumentDiagnostics(collection, doc);
        assert.ok(!diags || diags.length === 0);
    });

    test('clearAllDiagnostics: clears every entry from the collection', () => {
        DiagnosticUtils.updateDocumentDiagnostics(collection, doc, [makeFinding()]);
        DiagnosticUtils.clearAllDiagnostics(collection);
        const diags = DiagnosticUtils.getDocumentDiagnostics(collection, doc);
        assert.ok(!diags || diags.length === 0);
    });

    test('getDocumentDiagnostics: returns undefined for a document with no diagnostics', () => {
        const diags = DiagnosticUtils.getDocumentDiagnostics(collection, doc);
        assert.ok(diags === undefined || diags.length === 0);
    });
});
