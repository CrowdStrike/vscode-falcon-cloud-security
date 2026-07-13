import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { FcsLinter } from '../../core/linter';
import { ConfigurationManager } from '../../utils/configUtils';
import { SecurityFinding, ScanConfig } from '../../types';

function makeScanConfig(overrides: Partial<ScanConfig> = {}): ScanConfig {
    return {
        scanPaths: [],
        filePatterns: ['*.tf'],
        severity: 'all',
        scanOnSave: true,
        enabled: true,
        scanTimeout: 300,
        platforms: [],
        uploadResults: false,
        ...overrides
    };
}

function makeMockDocument(filePath: string, lineText = 'resource "example" {}'): vscode.TextDocument {
    return {
        uri: vscode.Uri.file(filePath),
        lineCount: 1,
        lineAt: (_line: number) => ({
            text: lineText,
            range: new vscode.Range(0, 0, 0, lineText.length)
        }),
    } as any;
}

function makeFinding(severity: string, file = 'main.tf'): SecurityFinding {
    return {
        file,
        line: 1,
        severity: severity as SecurityFinding['severity'],
        reason: 'test finding',
        rule_name: 'test-rule',
        rule_uuid: 'uuid-001',
        rule_category: 'Security',
        platform: 'terraform',
        id: 'uuid-001',
        title: 'test-rule',
        ruleId: 'uuid-001',
        category: 'Security'
    };
}

suite('FcsLinter Tests', () => {
    let linter: FcsLinter;
    let sandbox: sinon.SinonSandbox;

    setup(() => {
        sandbox = sinon.createSandbox();
        linter = new FcsLinter({} as any);
    });

    teardown(() => {
        sandbox.restore();
    });

    // --- filterFindingsBySeverity ---

    test('filterFindingsBySeverity: "all" returns every finding regardless of severity', () => {
        const findings = [
            makeFinding('Critical'),
            makeFinding('High'),
            makeFinding('Medium'),
            makeFinding('Low'),
            makeFinding('Informational')
        ];
        const result = (linter as any).filterFindingsBySeverity(findings, 'all');
        assert.strictEqual(result.length, 5);
    });

    test('filterFindingsBySeverity: "critical" returns only critical findings', () => {
        const findings = [
            makeFinding('Critical'),
            makeFinding('High'),
            makeFinding('Medium'),
            makeFinding('Informational')
        ];
        const result = (linter as any).filterFindingsBySeverity(findings, 'critical');
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].severity, 'Critical');
    });

    test('filterFindingsBySeverity: "high" returns critical and high only', () => {
        const findings = [
            makeFinding('Critical'),
            makeFinding('High'),
            makeFinding('Medium'),
            makeFinding('Informational')
        ];
        const result = (linter as any).filterFindingsBySeverity(findings, 'high');
        assert.strictEqual(result.length, 2);
        assert.ok(result.every((f: SecurityFinding) =>
            f.severity === 'Critical' || f.severity === 'High'
        ));
    });

    test('filterFindingsBySeverity: "medium" returns critical, high, and medium', () => {
        const findings = [
            makeFinding('Critical'),
            makeFinding('High'),
            makeFinding('Medium'),
            makeFinding('Low'),
            makeFinding('Informational')
        ];
        const result = (linter as any).filterFindingsBySeverity(findings, 'medium');
        assert.strictEqual(result.length, 3);
        assert.ok(!result.some((f: SecurityFinding) => f.severity === 'Low' || f.severity === 'Informational'));
    });

    test('filterFindingsBySeverity: "low" returns critical, high, medium, and low', () => {
        const findings = [
            makeFinding('Critical'),
            makeFinding('High'),
            makeFinding('Medium'),
            makeFinding('Low'),
            makeFinding('Informational')
        ];
        const result = (linter as any).filterFindingsBySeverity(findings, 'low');
        assert.strictEqual(result.length, 4);
        assert.ok(!result.some((f: SecurityFinding) => f.severity === 'Informational'));
    });

    test('filterFindingsBySeverity: "informational" returns all findings including low', () => {
        const findings = [
            makeFinding('Critical'),
            makeFinding('High'),
            makeFinding('Medium'),
            makeFinding('Low'),
            makeFinding('Informational')
        ];
        const result = (linter as any).filterFindingsBySeverity(findings, 'informational');
        assert.strictEqual(result.length, 5);
    });

    test('filterFindingsBySeverity: filter comparison is case-insensitive', () => {
        const findings = [makeFinding('Critical'), makeFinding('Medium')];
        const result = (linter as any).filterFindingsBySeverity(findings, 'HIGH');
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].severity, 'Critical');
    });

    test('filterFindingsBySeverity: finding with unknown severity is excluded by non-all filter', () => {
        const findings = [makeFinding('Critical'), makeFinding('UNKNOWN' as any)];
        const result = (linter as any).filterFindingsBySeverity(findings, 'high');
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].severity, 'Critical');
    });

    test('filterFindingsBySeverity: invalid filter value returns all findings', () => {
        const findings = [makeFinding('Critical'), makeFinding('Medium')];
        const result = (linter as any).filterFindingsBySeverity(findings, 'invalid-level');
        assert.strictEqual(result.length, 2);
    });

    test('filterFindingsBySeverity: empty findings array returns empty array', () => {
        const result = (linter as any).filterFindingsBySeverity([], 'high');
        assert.deepStrictEqual(result, []);
    });

    // --- showScanSummary ---

    test('showScanSummary: no findings shows information message with "no security issues found"', () => {
        const spy = sandbox.stub(vscode.window, 'showInformationMessage');
        (linter as any).showScanSummary([]);
        assert.ok(spy.calledOnce);
        assert.ok(spy.firstCall.args[0].includes('no security issues found'));
    });

    test('showScanSummary: critical findings triggers error message', () => {
        const spy = sandbox.stub(vscode.window, 'showErrorMessage');
        (linter as any).showScanSummary([makeFinding('Critical')]);
        assert.ok(spy.calledOnce);
        assert.ok(spy.firstCall.args[0].includes('1 critical'));
    });

    test('showScanSummary: high findings triggers error message', () => {
        const spy = sandbox.stub(vscode.window, 'showErrorMessage');
        (linter as any).showScanSummary([makeFinding('High')]);
        assert.ok(spy.calledOnce);
        assert.ok(spy.firstCall.args[0].includes('1 high'));
    });

    test('showScanSummary: medium-only findings triggers warning message', () => {
        const spy = sandbox.stub(vscode.window, 'showWarningMessage');
        (linter as any).showScanSummary([makeFinding('Medium'), makeFinding('Medium')]);
        assert.ok(spy.calledOnce);
        assert.ok(spy.firstCall.args[0].includes('2 medium'));
    });

    test('showScanSummary: informational-only findings triggers information message', () => {
        const spy = sandbox.stub(vscode.window, 'showInformationMessage');
        (linter as any).showScanSummary([makeFinding('Informational')]);
        assert.ok(spy.calledOnce);
        assert.ok(spy.firstCall.args[0].includes('1 informational'));
    });

    test('showScanSummary: low-only findings triggers information message', () => {
        const spy = sandbox.stub(vscode.window, 'showInformationMessage');
        (linter as any).showScanSummary([makeFinding('Low'), makeFinding('Low')]);
        assert.ok(spy.calledOnce);
        assert.ok(spy.firstCall.args[0].includes('2 low'));
    });

    test('showScanSummary: mixed findings counts all severities correctly', () => {
        const spy = sandbox.stub(vscode.window, 'showErrorMessage');
        const findings = [
            makeFinding('Critical'),
            makeFinding('High'),
            makeFinding('High'),
            makeFinding('Medium'),
            makeFinding('Informational'),
            makeFinding('Informational'),
            makeFinding('Informational')
        ];
        (linter as any).showScanSummary(findings);
        const msg: string = spy.firstCall.args[0];
        assert.ok(msg.includes('1 critical'), `expected '1 critical' in: ${msg}`);
        assert.ok(msg.includes('2 high'), `expected '2 high' in: ${msg}`);
        assert.ok(msg.includes('1 medium'), `expected '1 medium' in: ${msg}`);
        assert.ok(msg.includes('3 informational'), `expected '3 informational' in: ${msg}`);
    });
});

// --- processFindings: severity filter wiring ---

suite('FcsLinter processFindings severity wiring', () => {
    const FILE = '/workspace/main.tf';
    let linter: FcsLinter;
    let sandbox: sinon.SinonSandbox;

    setup(() => {
        sandbox = sinon.createSandbox();
        linter = new FcsLinter({} as any);
    });

    teardown(() => {
        sandbox.restore();
        linter.dispose();
    });

    async function runProcessFindings(severity: ScanConfig['severity']): Promise<vscode.Diagnostic[]> {
        const findings = [
            makeFinding('Critical', FILE),
            makeFinding('High', FILE),
            makeFinding('Medium', FILE),
            makeFinding('Low', FILE),
            makeFinding('Informational', FILE),
        ];
        sandbox.stub(vscode.workspace, 'openTextDocument').resolves(makeMockDocument(FILE));
        const setSpy = sandbox.spy((linter as any).diagnosticCollection, 'set');
        await (linter as any).processFindings([FILE], findings, makeScanConfig({ severity }));
        const updates = setSpy.firstCall.args[0] as [vscode.Uri, vscode.Diagnostic[]][];
        return updates[0][1];
    }

    test('processFindings: severity "all" passes every finding through to diagnostics', async () => {
        const diagnostics = await runProcessFindings('all');
        assert.strictEqual(diagnostics.length, 5);
    });

    test('processFindings: severity "high" excludes medium, low, and informational from diagnostics', async () => {
        const diagnostics = await runProcessFindings('high');
        assert.strictEqual(diagnostics.length, 2);
    });

    test('processFindings: severity "critical" excludes high, medium, low, and informational from diagnostics', async () => {
        const diagnostics = await runProcessFindings('critical');
        assert.strictEqual(diagnostics.length, 1);
    });

    test('processFindings: severity "medium" excludes low and informational from diagnostics', async () => {
        const diagnostics = await runProcessFindings('medium');
        assert.strictEqual(diagnostics.length, 3);
    });

    test('processFindings: severity "low" excludes only informational from diagnostics', async () => {
        const diagnostics = await runProcessFindings('low');
        assert.strictEqual(diagnostics.length, 4);
    });
});

// --- processFindings: platform coverage ---

suite('FcsLinter processFindings platform coverage', () => {
    let linter: FcsLinter;
    let sandbox: sinon.SinonSandbox;

    setup(() => {
        sandbox = sinon.createSandbox();
        linter = new FcsLinter({} as any);
    });

    teardown(() => {
        sandbox.restore();
        linter.dispose();
    });

    async function runForFile(absolutePath: string, findingPath: string): Promise<vscode.Diagnostic[]> {
        const finding = makeFinding('High', findingPath);
        sandbox.stub(vscode.workspace, 'openTextDocument').resolves(makeMockDocument(absolutePath));
        const setSpy = sandbox.spy((linter as any).diagnosticCollection, 'set');
        await (linter as any).processFindings(
            [absolutePath], [finding], makeScanConfig({ severity: 'all' })
        );
        const updates = setSpy.firstCall.args[0] as [vscode.Uri, vscode.Diagnostic[]][];
        return updates[0][1];
    }

    test('processFindings: CloudFormation finding (absolute path) produces a diagnostic', async () => {
        const diagnostics = await runForFile('/workspace/cfn/template.yaml', '/workspace/cfn/template.yaml');
        assert.strictEqual(diagnostics.length, 1);
    });

    test('processFindings: CloudFormation finding (relative path) matches absolute scanned file', async () => {
        const diagnostics = await runForFile('/workspace/cfn/template.yaml', 'cfn/template.yaml');
        assert.strictEqual(diagnostics.length, 1);
    });

    test('processFindings: Kubernetes finding (relative path) matches absolute scanned file', async () => {
        const diagnostics = await runForFile('/workspace/k8s/deployment.yaml', 'k8s/deployment.yaml');
        assert.strictEqual(diagnostics.length, 1);
    });

    test('processFindings: Dockerfile finding matches by filename suffix', async () => {
        const diagnostics = await runForFile('/workspace/Dockerfile', 'Dockerfile');
        assert.strictEqual(diagnostics.length, 1);
    });

    test('processFindings: finding for unscanned file produces no diagnostics', async () => {
        const finding = makeFinding('High', '/other/project/main.tf');
        sandbox.stub(vscode.workspace, 'openTextDocument').resolves(makeMockDocument('/workspace/main.tf'));
        const setSpy = sandbox.spy((linter as any).diagnosticCollection, 'set');
        await (linter as any).processFindings(
            ['/workspace/main.tf'], [finding], makeScanConfig({ severity: 'all' })
        );
        const updates = setSpy.firstCall.args[0] as [vscode.Uri, vscode.Diagnostic[]][];
        assert.strictEqual(updates[0][1].length, 0);
    });
});

// --- scan(): guard conditions ---

suite('FcsLinter scan() guard conditions', () => {
    let linter: FcsLinter;
    let sandbox: sinon.SinonSandbox;
    let scanFilesSpy: sinon.SinonSpy;

    setup(() => {
        sandbox = sinon.createSandbox();
        scanFilesSpy = sandbox.spy();
        linter = new FcsLinter({ scanFiles: scanFilesSpy } as any);
    });

    teardown(() => {
        sandbox.restore();
        linter.dispose();
    });

    test('scan(): returns immediately when extension is disabled', async () => {
        sandbox.stub(ConfigurationManager, 'getScanConfig').returns(
            makeScanConfig({ enabled: false })
        );
        await linter.scan();
        assert.ok(scanFilesSpy.notCalled, 'scanFiles should not be called when disabled');
    });

    test('scan(): shows error and returns when config validation fails', async () => {
        sandbox.stub(ConfigurationManager, 'getScanConfig').returns(makeScanConfig({ enabled: true }));
        sandbox.stub(ConfigurationManager, 'validateConfig').returns(['Invalid severity level: bogus']);
        const errorSpy = sandbox.stub(vscode.window, 'showErrorMessage');
        await linter.scan();
        assert.ok(errorSpy.calledOnce, 'Should show error message for config errors');
        assert.ok(scanFilesSpy.notCalled, 'scanFiles should not be called when config is invalid');
    });

    test('scan(): prompts for installation and returns when CLI is not installed', async () => {
        sandbox.stub(ConfigurationManager, 'getScanConfig').returns(makeScanConfig({ enabled: true }));
        sandbox.stub(ConfigurationManager, 'validateConfig').returns([]);
        const mockCli = {
            checkCliStatus: async () => ({ isInstalled: false, version: 'N/A' }),
            scanFiles: scanFilesSpy,
            showCliStatus: async () => {}
        };
        linter = new FcsLinter(mockCli as any);
        sandbox.stub(vscode.window, 'showWarningMessage').resolves(undefined);
        await linter.scan();
        assert.ok(scanFilesSpy.notCalled, 'scanFiles should not be called when CLI is missing');
    });
});
