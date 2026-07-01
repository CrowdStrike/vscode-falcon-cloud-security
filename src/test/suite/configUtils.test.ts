import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';

import { ConfigurationManager } from '../../utils/configUtils';

function makeVsCodeConfig(overrides: Record<string, any> = {}) {
    const defaults: Record<string, any> = {
        enabled: true,
        severity: 'all',
        filePatterns: ['*.tf', '*.yaml', '*.yml', '*.json', 'Dockerfile'],
        scanPaths: [],
        scanOnSave: true,
        scanTimeout: 300,
        platforms: []
    };
    const values = { ...defaults, ...overrides };
    return {
        get: (key: string, defaultValue?: any) =>
            values[key] !== undefined ? values[key] : defaultValue,
        has: () => false,
        inspect: () => undefined,
        update: async () => {}
    } as any;
}

suite('ConfigurationManager Tests', () => {
    let sandbox: sinon.SinonSandbox;

    setup(() => {
        sandbox = sinon.createSandbox();
    });

    teardown(() => {
        sandbox.restore();
    });

    // --- validateConfig ---

    test('validateConfig: returns no errors for valid default configuration', () => {
        sandbox.stub(vscode.workspace, 'getConfiguration').returns(makeVsCodeConfig());
        const errors = ConfigurationManager.validateConfig();
        assert.deepStrictEqual(errors, []);
    });

    test('validateConfig: returns error for unrecognized severity value', () => {
        sandbox.stub(vscode.workspace, 'getConfiguration').returns(
            makeVsCodeConfig({ severity: 'extreme' })
        );
        const errors = ConfigurationManager.validateConfig();
        assert.ok(errors.length > 0);
        assert.ok(errors[0].includes('Invalid severity level'));
        assert.ok(errors[0].includes('extreme'));
    });

    test('validateConfig: accepts all four valid severity values', () => {
        for (const severity of ['all', 'critical', 'high', 'medium', 'informational']) {
            sandbox.restore();
            sandbox = sinon.createSandbox();
            sandbox.stub(vscode.workspace, 'getConfiguration').returns(
                makeVsCodeConfig({ severity })
            );
            const errors = ConfigurationManager.validateConfig();
            assert.deepStrictEqual(errors, [], `expected no errors for severity="${severity}"`);
        }
    });

    test('validateConfig: returns error for empty filePatterns', () => {
        sandbox.stub(vscode.workspace, 'getConfiguration').returns(
            makeVsCodeConfig({ filePatterns: [] })
        );
        const errors = ConfigurationManager.validateConfig();
        assert.ok(errors.some(e => e.includes('file pattern')));
    });

    test('validateConfig: skips all validation when extension is disabled', () => {
        sandbox.stub(vscode.workspace, 'getConfiguration').returns(
            makeVsCodeConfig({ enabled: false, severity: 'invalid', filePatterns: [] })
        );
        const errors = ConfigurationManager.validateConfig();
        assert.deepStrictEqual(errors, []);
    });

    // --- shouldScanFile ---

    test('shouldScanFile: returns false when extension is disabled', () => {
        sandbox.stub(vscode.workspace, 'getConfiguration').returns(
            makeVsCodeConfig({ enabled: false })
        );
        assert.strictEqual(ConfigurationManager.shouldScanFile('/workspace/main.tf'), false);
    });

    test('shouldScanFile: returns true for .tf files with default patterns', () => {
        sandbox.stub(vscode.workspace, 'getConfiguration').returns(makeVsCodeConfig());
        assert.strictEqual(ConfigurationManager.shouldScanFile('/workspace/main.tf'), true);
    });

    test('shouldScanFile: returns true for .yaml files with default patterns', () => {
        sandbox.stub(vscode.workspace, 'getConfiguration').returns(makeVsCodeConfig());
        assert.strictEqual(ConfigurationManager.shouldScanFile('/workspace/k8s/deployment.yaml'), true);
    });

    test('shouldScanFile: returns true for Dockerfile with default patterns', () => {
        sandbox.stub(vscode.workspace, 'getConfiguration').returns(makeVsCodeConfig());
        assert.strictEqual(ConfigurationManager.shouldScanFile('/workspace/Dockerfile'), true);
    });

    test('shouldScanFile: returns false for unsupported file types', () => {
        sandbox.stub(vscode.workspace, 'getConfiguration').returns(makeVsCodeConfig());
        assert.strictEqual(ConfigurationManager.shouldScanFile('/workspace/README.md'), false);
        assert.strictEqual(ConfigurationManager.shouldScanFile('/workspace/app.ts'), false);
        assert.strictEqual(ConfigurationManager.shouldScanFile('/workspace/image.png'), false);
    });

    test('shouldScanFile: returns false for settings.json (always excluded)', () => {
        sandbox.stub(vscode.workspace, 'getConfiguration').returns(makeVsCodeConfig());
        assert.strictEqual(ConfigurationManager.shouldScanFile('/workspace/.vscode/settings.json'), false);
        assert.strictEqual(ConfigurationManager.shouldScanFile('/workspace/settings.json'), false);
    });

    test('shouldScanFile: returns false for launch.json (always excluded)', () => {
        sandbox.stub(vscode.workspace, 'getConfiguration').returns(makeVsCodeConfig());
        assert.strictEqual(ConfigurationManager.shouldScanFile('/workspace/.vscode/launch.json'), false);
    });

    test('shouldScanFile: returns false for tasks.json (always excluded)', () => {
        sandbox.stub(vscode.workspace, 'getConfiguration').returns(makeVsCodeConfig());
        assert.strictEqual(ConfigurationManager.shouldScanFile('/workspace/.vscode/tasks.json'), false);
    });

    // --- scanTimeout ---

    test('getConfig: returns default scanTimeout of 300', () => {
        sandbox.stub(vscode.workspace, 'getConfiguration').returns(makeVsCodeConfig());
        const config = ConfigurationManager.getConfig();
        assert.strictEqual(config.scanTimeout, 300);
    });

    test('getConfig: returns custom scanTimeout when configured', () => {
        sandbox.stub(vscode.workspace, 'getConfiguration').returns(
            makeVsCodeConfig({ scanTimeout: 600 })
        );
        const config = ConfigurationManager.getConfig();
        assert.strictEqual(config.scanTimeout, 600);
    });

    test('getScanConfig: propagates scanTimeout from config', () => {
        sandbox.stub(vscode.workspace, 'getConfiguration').returns(
            makeVsCodeConfig({ scanTimeout: 120 })
        );
        sandbox.stub(vscode.workspace, 'workspaceFolders').get(() => undefined);
        const config = ConfigurationManager.getScanConfig();
        assert.strictEqual(config.scanTimeout, 120);
    });

    // --- platforms ---

    test('getConfig: returns empty platforms array by default', () => {
        sandbox.stub(vscode.workspace, 'getConfiguration').returns(makeVsCodeConfig());
        const config = ConfigurationManager.getConfig();
        assert.deepStrictEqual(config.platforms, []);
    });

    test('getConfig: returns configured platforms array', () => {
        sandbox.stub(vscode.workspace, 'getConfiguration').returns(
            makeVsCodeConfig({ platforms: ['Terraform', 'Kubernetes'] })
        );
        const config = ConfigurationManager.getConfig();
        assert.deepStrictEqual(config.platforms, ['Terraform', 'Kubernetes']);
    });

    test('getScanConfig: propagates platforms from config', () => {
        sandbox.stub(vscode.workspace, 'getConfiguration').returns(
            makeVsCodeConfig({ platforms: ['CloudFormation'] })
        );
        sandbox.stub(vscode.workspace, 'workspaceFolders').get(() => undefined);
        const config = ConfigurationManager.getScanConfig();
        assert.deepStrictEqual(config.platforms, ['CloudFormation']);
    });
});

// --- getAbsoluteScanPaths ---

suite('ConfigurationManager getAbsoluteScanPaths Tests', () => {
    let sandbox: sinon.SinonSandbox;

    const WORKSPACE_ROOT = '/workspace';

    function stubWorkspace(scanPaths: string[]) {
        sandbox.stub(vscode.workspace, 'getConfiguration').returns(
            makeVsCodeConfig({ scanPaths })
        );
        sandbox.stub(vscode.workspace, 'workspaceFolders').get(() => [{
            uri: vscode.Uri.file(WORKSPACE_ROOT),
            name: 'workspace',
            index: 0
        }]);
    }

    setup(() => {
        sandbox = sinon.createSandbox();
    });

    teardown(() => {
        sandbox.restore();
    });

    test('getAbsoluteScanPaths: throws ConfigurationError when no workspace folders', () => {
        sandbox.stub(vscode.workspace, 'getConfiguration').returns(makeVsCodeConfig({ scanPaths: ['infra'] }));
        sandbox.stub(vscode.workspace, 'workspaceFolders').get(() => undefined);
        assert.throws(
            () => ConfigurationManager.getAbsoluteScanPaths(),
            /No workspace folder/
        );
    });

    test('getAbsoluteScanPaths: resolves valid relative path to absolute within workspace', () => {
        stubWorkspace(['infra']);
        const result = ConfigurationManager.getAbsoluteScanPaths();
        assert.strictEqual(result.length, 1);
        assert.ok(result[0].startsWith(WORKSPACE_ROOT), `expected path inside workspace, got: ${result[0]}`);
        assert.ok(result[0].endsWith('infra'));
    });

    test('getAbsoluteScanPaths: rejects path traversal (../outside) and returns empty array', () => {
        stubWorkspace(['../outside']);
        const result = ConfigurationManager.getAbsoluteScanPaths();
        assert.deepStrictEqual(result, []);
    });

    test('getAbsoluteScanPaths: rejects absolute path outside workspace', () => {
        stubWorkspace(['/etc/passwd']);
        const result = ConfigurationManager.getAbsoluteScanPaths();
        assert.deepStrictEqual(result, []);
    });

    test('getAbsoluteScanPaths: returns only valid paths from a mix of valid and traversal paths', () => {
        stubWorkspace(['infra', '../outside', 'modules']);
        const result = ConfigurationManager.getAbsoluteScanPaths();
        assert.strictEqual(result.length, 2);
        assert.ok(result.every(p => p.startsWith(WORKSPACE_ROOT)));
    });
});
