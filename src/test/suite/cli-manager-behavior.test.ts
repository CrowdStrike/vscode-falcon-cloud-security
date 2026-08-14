import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import { FcsCliManager } from '../../core/cliManager';

// The compiled cliManager uses require('child_process').spawn via CommonJS property access,
// so patching this shared module object affects the spawn reference in the loaded module.
const childProcess = require('child_process') as typeof import('child_process');

function makeVsCodeConfig(overrides: Record<string, any> = {}) {
    return {
        get: (key: string) => {
            if (key in overrides) { return overrides[key]; }
            if (key === 'scanTimeout') { return 300; }
            if (key === 'platforms') { return []; }
            return undefined;
        },
        has: () => false,
        inspect: () => undefined,
        update: async () => {}
    } as any;
}

// Creates a fake child_process spawn return value that closes with the given exit code.
function makeFakeChild(exitCode: number | null, stdout = '', stderr = '') {
    const emitter = new EventEmitter() as any;
    emitter.stdout = new EventEmitter();
    emitter.stderr = new EventEmitter();
    emitter.killed = false;
    emitter.kill = () => { emitter.killed = true; };
    setImmediate(() => {
        if (stdout) { emitter.stdout.emit('data', Buffer.from(stdout)); }
        if (stderr) { emitter.stderr.emit('data', Buffer.from(stderr)); }
        emitter.emit('close', exitCode);
    });
    return emitter;
}

suite('FcsCliManager Behavior Tests', () => {
    let manager: FcsCliManager;
    let sandbox: sinon.SinonSandbox;

    setup(() => {
        sandbox = sinon.createSandbox();
        manager = new FcsCliManager({} as vscode.ExtensionContext);
    });

    teardown(() => {
        sandbox.restore();
    });

    // --- parseVersionOutput ---

    test('parseVersionOutput: extracts version from "version X.Y.Z" format', () => {
        assert.strictEqual((manager as any).parseVersionOutput('fcs version 1.2.3\n'), '1.2.3');
    });

    test('parseVersionOutput: extracts version from "version: X.Y.Z" colon format', () => {
        assert.strictEqual((manager as any).parseVersionOutput('fcs version: 2.0.1'), '2.0.1');
    });

    test('parseVersionOutput: match is case-insensitive for Version keyword', () => {
        assert.strictEqual((manager as any).parseVersionOutput('FCS Version 0.9.5'), '0.9.5');
    });

    test('parseVersionOutput: returns "unknown" for output with no version pattern', () => {
        assert.strictEqual((manager as any).parseVersionOutput('usage: fcs [command]'), 'unknown');
    });

    test('parseVersionOutput: returns "unknown" for empty output', () => {
        assert.strictEqual((manager as any).parseVersionOutput(''), 'unknown');
    });

    // --- isVersionCompatible ---

    test('isVersionCompatible: returns true for version within range', () => {
        assert.strictEqual((manager as any).isVersionCompatible('3.0.0'), true);
        assert.strictEqual((manager as any).isVersionCompatible('3.1.0'), true);
        assert.strictEqual((manager as any).isVersionCompatible('4.0.0'), true);
        assert.strictEqual((manager as any).isVersionCompatible('4.0.1'), true);
    });

    test('isVersionCompatible: returns false for version above maximum', () => {
        assert.strictEqual((manager as any).isVersionCompatible('999.0.0'), false);
    });

    test('isVersionCompatible: returns false for version < minimum', () => {
        assert.strictEqual((manager as any).isVersionCompatible('2.0.2'), false);
        assert.strictEqual((manager as any).isVersionCompatible('2.9.9'), false);
    });

    test('isVersionCompatible: returns false for "unknown" version', () => {
        assert.strictEqual((manager as any).isVersionCompatible('unknown'), false);
    });

    // --- validateProxyInput ---

    test('validateProxyInput: returns null for undefined', () => {
        sandbox.stub(vscode.window, 'showWarningMessage');
        assert.strictEqual((manager as any).validateProxyInput(undefined), null);
    });

    test('validateProxyInput: returns null for empty string', () => {
        sandbox.stub(vscode.window, 'showWarningMessage');
        assert.strictEqual((manager as any).validateProxyInput(''), null);
    });

    test('validateProxyInput: returns null for whitespace-only string', () => {
        sandbox.stub(vscode.window, 'showWarningMessage');
        assert.strictEqual((manager as any).validateProxyInput('   '), null);
    });

    test('validateProxyInput: returns URL for valid http:// proxy', () => {
        assert.strictEqual((manager as any).validateProxyInput('http://proxy.example.com:8080'), 'http://proxy.example.com:8080');
    });

    test('validateProxyInput: returns URL for valid https:// proxy', () => {
        assert.strictEqual((manager as any).validateProxyInput('https://proxy.example.com:3128'), 'https://proxy.example.com:3128');
    });

    test('validateProxyInput: returns null for ftp:// scheme', () => {
        sandbox.stub(vscode.window, 'showWarningMessage');
        assert.strictEqual((manager as any).validateProxyInput('ftp://proxy.example.com'), null);
    });

    test('validateProxyInput: returns null for localhost proxy', () => {
        sandbox.stub(vscode.window, 'showWarningMessage');
        assert.strictEqual((manager as any).validateProxyInput('http://localhost:8080'), null);
    });

    test('validateProxyInput: returns null for 127.0.0.1 loopback proxy', () => {
        sandbox.stub(vscode.window, 'showWarningMessage');
        assert.strictEqual((manager as any).validateProxyInput('http://127.0.0.1:8080'), null);
    });

    test('validateProxyInput: returns null for malformed proxy URL', () => {
        sandbox.stub(vscode.window, 'showWarningMessage');
        assert.strictEqual((manager as any).validateProxyInput('not-a-url'), null);
    });

    // --- getValidatedProxyConfig ---

    test('getValidatedProxyConfig: returns null when no session proxy is set', () => {
        assert.strictEqual((manager as any).getValidatedProxyConfig(), null);
    });

    test('getValidatedProxyConfig: returns sessionProxyUrl when set', () => {
        (manager as any).sessionProxyUrl = 'http://proxy.example.com:8080';
        assert.strictEqual((manager as any).getValidatedProxyConfig(), 'http://proxy.example.com:8080');
    });

    // --- runCliCommand exit code handling ---

    test('runCliCommand: exit code 0 resolves with success=true', async () => {
        sandbox.stub(vscode.workspace, 'getConfiguration').returns(makeVsCodeConfig());
        const result = await (manager as any).runCliCommand(
            process.execPath, ['-e', 'process.exit(0)'], {}
        );
        assert.strictEqual(result.exitCode, 0);
        assert.strictEqual(result.success, true);
    });

    test('runCliCommand: exit code 40 (scan with findings) resolves with success=true', async () => {
        sandbox.stub(vscode.workspace, 'getConfiguration').returns(makeVsCodeConfig());
        const result = await (manager as any).runCliCommand(
            process.execPath, ['-e', 'process.exit(40)'], {}
        );
        assert.strictEqual(result.exitCode, 40);
        assert.strictEqual(result.success, true);
    });

    test('runCliCommand: exit code 1 (scan warning) resolves with success=true', async () => {
        sandbox.stub(vscode.workspace, 'getConfiguration').returns(makeVsCodeConfig());
        const result = await (manager as any).runCliCommand(
            process.execPath, ['-e', 'process.exit(1)'], {}
        );
        assert.strictEqual(result.exitCode, 1);
        assert.strictEqual(result.success, true);
    });

    test('runCliCommand: exit code 30 (high findings) resolves with success=true', async () => {
        sandbox.stub(vscode.workspace, 'getConfiguration').returns(makeVsCodeConfig());
        const result = await (manager as any).runCliCommand(
            process.execPath, ['-e', 'process.exit(30)'], {}
        );
        assert.strictEqual(result.exitCode, 30);
        assert.strictEqual(result.success, true);
    });

    test('runCliCommand: exit code 20 (medium findings) resolves with success=true', async () => {
        sandbox.stub(vscode.workspace, 'getConfiguration').returns(makeVsCodeConfig());
        const result = await (manager as any).runCliCommand(
            process.execPath, ['-e', 'process.exit(20)'], {}
        );
        assert.strictEqual(result.exitCode, 20);
        assert.strictEqual(result.success, true);
    });

    test('runCliCommand: exit code 10 (informational findings) resolves with success=true', async () => {
        sandbox.stub(vscode.workspace, 'getConfiguration').returns(makeVsCodeConfig());
        const result = await (manager as any).runCliCommand(
            process.execPath, ['-e', 'process.exit(10)'], {}
        );
        assert.strictEqual(result.exitCode, 10);
        assert.strictEqual(result.success, true);
    });

    test('runCliCommand: non-standard exit code resolves in non-strict mode', async () => {
        sandbox.stub(vscode.workspace, 'getConfiguration').returns(makeVsCodeConfig());
        const result = await (manager as any).runCliCommand(
            process.execPath, ['-e', 'process.exit(201)'], { strictMode: false }
        );
        assert.strictEqual(result.exitCode, 201);
        assert.strictEqual(result.success, true);
    });

    test('runCliCommand: non-standard exit code rejects in strict mode', async () => {
        sandbox.stub(vscode.workspace, 'getConfiguration').returns(makeVsCodeConfig());
        await assert.rejects(
            () => (manager as any).runCliCommand(
                process.execPath, ['-e', 'process.exit(201)'], { strictMode: true }
            ),
            (err: any) => err.message.includes('201')
        );
    });

    test('runCliCommand: null exit code (killed process) rejects with killed/crashed message', async () => {
        sandbox.stub(vscode.workspace, 'getConfiguration').returns(makeVsCodeConfig());
        sandbox.stub(childProcess, 'spawn').callsFake(() => makeFakeChild(null));
        await assert.rejects(
            () => (manager as any).runCliCommand('/fake/fcs', ['scan'], {}),
            /terminated unexpectedly/
        );
    });

    test('runCliCommand: spawn error event rejects with execution error message', async () => {
        sandbox.stub(vscode.workspace, 'getConfiguration').returns(makeVsCodeConfig());
        await assert.rejects(
            () => (manager as any).runCliCommand('/no/such/cli-binary', ['version'], {}),
            /Failed to execute FCS CLI/
        );
    });

    test('runCliCommand: credentials in stderr are redacted in the returned result', async () => {
        sandbox.stub(vscode.workspace, 'getConfiguration').returns(makeVsCodeConfig());
        const result = await (manager as any).runCliCommand(
            process.execPath,
            ['-e', 'process.stderr.write("via https://user:secret@proxy.corp.com"); process.exit(0)'],
            {}
        );
        assert.ok(!result.stderr.includes('secret'), 'credential should be redacted');
        assert.ok(result.stderr.includes('proxy.corp.com'), 'host should be preserved');
    });

    test('runCliCommand: stdout is captured and returned in the result', async () => {
        sandbox.stub(vscode.workspace, 'getConfiguration').returns(makeVsCodeConfig());
        const result = await (manager as any).runCliCommand(
            process.execPath,
            ['-e', 'process.stdout.write("scan-output-line"); process.exit(0)'],
            {}
        );
        assert.ok(result.stdout.includes('scan-output-line'));
    });

    // --- scanFiles: no-report handling ---

    test('scanFiles: returns empty array when CLI exits 0 but generates no JSON report', async () => {
        sandbox.stub(vscode.workspace, 'getConfiguration').returns(makeVsCodeConfig());
        (manager as any).getAvailableCliPath = async () => process.execPath;
        (manager as any).checkCliStatus = async () => ({ isInstalled: true, version: '3.0.0', isCompatible: true });
        // Simulate CLI exiting 0 without writing any report file
        sandbox.stub(childProcess, 'spawn').callsFake(() =>
            makeFakeChild(0, '', '')
        );
        const findings = await manager.scanFiles(['/workspace/settings.json']);
        assert.deepStrictEqual(findings, []);
    });

    test('scanFiles: throws when CLI exits non-zero and generates no JSON report', async () => {
        sandbox.stub(vscode.workspace, 'getConfiguration').returns(makeVsCodeConfig());
        (manager as any).getAvailableCliPath = async () => process.execPath;
        (manager as any).checkCliStatus = async () => ({ isInstalled: true, version: '3.0.0', isCompatible: true });
        sandbox.stub(childProcess, 'spawn').callsFake(() =>
            makeFakeChild(203, '', 'scan processing error')
        );
        await assert.rejects(
            () => manager.scanFiles(['/workspace/main.tf']),
            /Scan failed with exit code/
        );
    });

    test('scanFiles: passes default --timeout 300 to CLI args', async () => {
        sandbox.stub(vscode.workspace, 'getConfiguration').returns(makeVsCodeConfig());
        (manager as any).getAvailableCliPath = async () => process.execPath;
        (manager as any).checkCliStatus = async () => ({ isInstalled: true, version: '3.0.0', isCompatible: true });
        let capturedArgs: string[] = [];
        sandbox.stub(childProcess, 'spawn').callsFake((_cmd: string, args: readonly string[]) => {
            capturedArgs = [...args];
            return makeFakeChild(0, '', '');
        });
        await manager.scanFiles(['/workspace/main.tf']).catch(() => {});
        assert.ok(capturedArgs.includes('--timeout'), 'args should include --timeout flag');
        const idx = capturedArgs.indexOf('--timeout');
        assert.strictEqual(capturedArgs[idx + 1], '300', 'default timeout value should be 300');
    });

    test('scanFiles: passes custom --timeout value to CLI args', async () => {
        sandbox.stub(vscode.workspace, 'getConfiguration').returns(makeVsCodeConfig({ scanTimeout: 600 }));
        (manager as any).getAvailableCliPath = async () => process.execPath;
        (manager as any).checkCliStatus = async () => ({ isInstalled: true, version: '3.0.0', isCompatible: true });
        let capturedArgs: string[] = [];
        sandbox.stub(childProcess, 'spawn').callsFake((_cmd: string, args: readonly string[]) => {
            capturedArgs = [...args];
            return makeFakeChild(0, '', '');
        });
        await manager.scanFiles(['/workspace/main.tf']).catch(() => {});
        const idx = capturedArgs.indexOf('--timeout');
        assert.ok(idx !== -1, 'args should include --timeout flag');
        assert.strictEqual(capturedArgs[idx + 1], '600', 'custom timeout value should be 600');
    });

    test('scanFiles: always passes --policy-rule local to CLI args', async () => {
        sandbox.stub(vscode.workspace, 'getConfiguration').returns(makeVsCodeConfig());
        (manager as any).getAvailableCliPath = async () => process.execPath;
        (manager as any).checkCliStatus = async () => ({ isInstalled: true, version: '3.0.0', isCompatible: true });
        let capturedArgs: string[] = [];
        sandbox.stub(childProcess, 'spawn').callsFake((_cmd: string, args: readonly string[]) => {
            capturedArgs = [...args];
            return makeFakeChild(0, '', '');
        });
        await manager.scanFiles(['/workspace/main.tf']).catch(() => {});
        const idx = capturedArgs.indexOf('--policy-rule');
        assert.ok(idx !== -1, 'args should include --policy-rule flag');
        assert.strictEqual(capturedArgs[idx + 1], 'local', '--policy-rule value should always be local');
    });

    test('scanFiles: does not pass --upload when uploadResults is false (default)', async () => {
        sandbox.stub(vscode.workspace, 'getConfiguration').returns(makeVsCodeConfig());
        (manager as any).getAvailableCliPath = async () => process.execPath;
        (manager as any).checkCliStatus = async () => ({ isInstalled: true, version: '3.0.0', isCompatible: true });
        let capturedArgs: string[] = [];
        sandbox.stub(childProcess, 'spawn').callsFake((_cmd: string, args: readonly string[]) => {
            capturedArgs = [...args];
            return makeFakeChild(0, '', '');
        });
        await manager.scanFiles(['/workspace/main.tf']).catch(() => {});
        assert.ok(!capturedArgs.includes('--upload'), 'args should not include --upload when uploadResults is false');
    });

    test('scanFiles: passes --upload when uploadResults is true', async () => {
        sandbox.stub(vscode.workspace, 'getConfiguration').returns(makeVsCodeConfig({ uploadResults: true }));
        (manager as any).getAvailableCliPath = async () => process.execPath;
        (manager as any).checkCliStatus = async () => ({ isInstalled: true, version: '3.0.0', isCompatible: true });
        let capturedArgs: string[] = [];
        sandbox.stub(childProcess, 'spawn').callsFake((_cmd: string, args: readonly string[]) => {
            capturedArgs = [...args];
            return makeFakeChild(0, '', '');
        });
        await manager.scanFiles(['/workspace/main.tf']).catch(() => {});
        assert.ok(capturedArgs.includes('--upload'), 'args should include --upload when uploadResults is true');
    });

    test('scanFiles: does not pass --platforms when platforms array is empty', async () => {
        sandbox.stub(vscode.workspace, 'getConfiguration').returns(makeVsCodeConfig());
        (manager as any).getAvailableCliPath = async () => process.execPath;
        (manager as any).checkCliStatus = async () => ({ isInstalled: true, version: '3.0.0', isCompatible: true });
        let capturedArgs: string[] = [];
        sandbox.stub(childProcess, 'spawn').callsFake((_cmd: string, args: readonly string[]) => {
            capturedArgs = [...args];
            return makeFakeChild(0, '', '');
        });
        await manager.scanFiles(['/workspace/main.tf']).catch(() => {});
        assert.ok(!capturedArgs.includes('--platforms'), 'args should not include --platforms when empty');
    });

    test('scanFiles: passes --platforms with comma-separated values when configured', async () => {
        sandbox.stub(vscode.workspace, 'getConfiguration').returns(
            makeVsCodeConfig({ platforms: ['Terraform', 'Kubernetes'] })
        );
        (manager as any).getAvailableCliPath = async () => process.execPath;
        (manager as any).checkCliStatus = async () => ({ isInstalled: true, version: '3.0.0', isCompatible: true });
        let capturedArgs: string[] = [];
        sandbox.stub(childProcess, 'spawn').callsFake((_cmd: string, args: readonly string[]) => {
            capturedArgs = [...args];
            return makeFakeChild(0, '', '');
        });
        await manager.scanFiles(['/workspace/main.tf']).catch(() => {});
        const idx = capturedArgs.indexOf('--platforms');
        assert.ok(idx !== -1, 'args should include --platforms flag');
        assert.strictEqual(capturedArgs[idx + 1], 'Terraform,Kubernetes', '--platforms value should be comma-separated');
    });

    test('scanFiles: throws descriptive error when CLI version is incompatible', async () => {
        sandbox.stub(vscode.workspace, 'getConfiguration').returns(makeVsCodeConfig());
        (manager as any).getAvailableCliPath = async () => process.execPath;
        (manager as any).checkCliStatus = async () => ({ isInstalled: true, version: '2.0.2', isCompatible: false });
        await assert.rejects(
            () => manager.scanFiles(['/workspace/main.tf']),
            /FCS CLI v2\.0\.2 is below the minimum required version/
        );
    });

    test('scanFiles: proceeds without version error when CLI version is above maximum', async () => {
        sandbox.stub(vscode.workspace, 'getConfiguration').returns(makeVsCodeConfig());
        (manager as any).getAvailableCliPath = async () => process.execPath;
        (manager as any).checkCliStatus = async () => ({ isInstalled: true, version: '999.0.0', isCompatible: false });
        // Should NOT throw a version error — may throw a different error (e.g. no report file)
        // but must not throw the "above maximum" / version-related error
        try {
            await manager.scanFiles(['/workspace/main.tf']);
        } catch (e: any) {
            assert.ok(
                !e.message?.includes('above the maximum') && !e.message?.includes('compatibility'),
                `Expected no version compatibility error, but got: ${e.message}`
            );
        }
    });

    // --- checkCliStatus decision tree ---

    test('checkCliStatus: falls through to downloaded CLI when PATH lookup returns null', async () => {
        (manager as any).resolveCliPath = async () => null;
        const checkDownloaded = sandbox.stub(manager as any, 'checkDownloadedCli').resolves({
            isInstalled: false, path: '/storage/fcs-cli/fcs'
        });
        const status = await manager.checkCliStatus();
        assert.ok(checkDownloaded.calledOnce, 'checkDownloadedCli should be called');
        assert.strictEqual(status.isInstalled, false);
    });

    test('checkCliStatus: rejects workspace-shadowed CLI and falls through to downloaded', async () => {
        (manager as any).resolveCliPath = async () => '/workspace/bin/fcs';
        (manager as any).isWorkspacePath = () => true;
        const checkDownloaded = sandbox.stub(manager as any, 'checkDownloadedCli').resolves({
            isInstalled: true, version: '1.0.0', path: '/storage/fcs-cli/fcs'
        });
        await manager.checkCliStatus();
        assert.ok(checkDownloaded.calledOnce, 'should fall through after rejecting workspace-shadowed CLI');
    });

    test('checkCliStatus: returns installed status when PATH CLI is outside workspace and executes', async () => {
        (manager as any).resolveCliPath = async () => '/usr/local/bin/fcs';
        (manager as any).isWorkspacePath = () => false;
        (manager as any).executeCli = async () => ({ stdout: 'fcs version 1.5.0', stderr: '', exitCode: 0 });
        sandbox.stub(manager as any, 'checkDownloadedCli').resolves({ isInstalled: false, path: '/storage/fcs-cli/fcs' });
        const status = await manager.checkCliStatus();
        assert.strictEqual(status.isInstalled, true);
        assert.strictEqual(status.version, '1.5.0');
        assert.strictEqual(status.path, '/usr/local/bin/fcs');
        assert.strictEqual(status.isCompatible, false);
    });

    test('checkCliStatus: marks compatible version (3.0.0+) as isCompatible=true', async () => {
        (manager as any).resolveCliPath = async () => '/usr/local/bin/fcs';
        (manager as any).isWorkspacePath = () => false;
        (manager as any).executeCli = async () => ({ stdout: 'fcs version 3.0.0', stderr: '', exitCode: 0 });
        sandbox.stub(manager as any, 'checkDownloadedCli').resolves({ isInstalled: false, path: '/storage/fcs-cli/fcs' });
        const status = await manager.checkCliStatus();
        assert.strictEqual(status.isInstalled, true);
        assert.strictEqual(status.version, '3.0.0');
        assert.strictEqual(status.isCompatible, true);
    });

    test('checkCliStatus: marks incompatible version (< 3.0.0) as isCompatible=false', async () => {
        (manager as any).resolveCliPath = async () => '/usr/local/bin/fcs';
        (manager as any).isWorkspacePath = () => false;
        (manager as any).executeCli = async () => ({ stdout: 'fcs version 2.0.2', stderr: '', exitCode: 0 });
        sandbox.stub(manager as any, 'checkDownloadedCli').resolves({ isInstalled: false, path: '/storage/fcs-cli/fcs' });
        const status = await manager.checkCliStatus();
        assert.strictEqual(status.isInstalled, true);
        assert.strictEqual(status.version, '2.0.2');
        assert.strictEqual(status.isCompatible, false);
    });

    test('checkCliStatus: falls through to downloaded CLI when PATH CLI execution fails', async () => {
        (manager as any).resolveCliPath = async () => '/usr/local/bin/fcs';
        (manager as any).isWorkspacePath = () => false;
        (manager as any).executeCli = async () => { throw new Error('binary not executable'); };
        const checkDownloaded = sandbox.stub(manager as any, 'checkDownloadedCli').resolves({
            isInstalled: true, version: '1.3.0', path: '/storage/fcs-cli/fcs', isCompatible: false
        });
        const status = await manager.checkCliStatus();
        assert.ok(checkDownloaded.calledOnce);
        assert.strictEqual(status.version, '1.3.0');
    });

    // --- getAvailableCliPath decision tree ---

    test('getAvailableCliPath: returns null when neither PATH CLI nor downloaded CLI exists', async () => {
        (manager as any).resolveCliPath = async () => null;
        (manager as any).getDownloadedCliPath = () => '/storage/fcs-cli/fcs';
        (manager as any).pathExists = async () => false;
        assert.strictEqual(await (manager as any).getAvailableCliPath(), null);
    });

    test('getAvailableCliPath: returns PATH CLI path when outside workspace and executes successfully', async () => {
        (manager as any).resolveCliPath = async () => '/usr/local/bin/fcs';
        (manager as any).isWorkspacePath = () => false;
        (manager as any).getDownloadedCliPath = () => '/storage/fcs-cli/fcs';
        (manager as any).pathExists = async () => false;
        (manager as any).executeCli = async () => ({ stdout: '', stderr: '', exitCode: 0 });
        assert.strictEqual(await (manager as any).getAvailableCliPath(), '/usr/local/bin/fcs');
    });

    test('getAvailableCliPath: skips workspace-shadowed PATH CLI and returns downloaded path', async () => {
        (manager as any).resolveCliPath = async () => '/workspace/tools/fcs';
        (manager as any).isWorkspacePath = () => true;
        (manager as any).getDownloadedCliPath = () => '/storage/fcs-cli/fcs';
        (manager as any).pathExists = async () => true;
        assert.strictEqual(await (manager as any).getAvailableCliPath(), '/storage/fcs-cli/fcs');
    });

    test('getAvailableCliPath: falls back to downloaded CLI when PATH CLI execution fails', async () => {
        (manager as any).resolveCliPath = async () => '/usr/local/bin/fcs';
        (manager as any).isWorkspacePath = () => false;
        (manager as any).executeCli = async () => { throw new Error('exec failed'); };
        (manager as any).getDownloadedCliPath = () => '/storage/fcs-cli/fcs';
        (manager as any).pathExists = async () => true;
        assert.strictEqual(await (manager as any).getAvailableCliPath(), '/storage/fcs-cli/fcs');
    });

    test('getAvailableCliPath: prefers downloaded CLI over system CLI regardless of version', async () => {
        (manager as any).resolveCliPath = async () => '/usr/local/bin/fcs';
        (manager as any).isWorkspacePath = () => false;
        (manager as any).getDownloadedCliPath = () => '/storage/fcs-cli/fcs';
        (manager as any).pathExists = async () => true;
        (manager as any).executeCli = async () => ({ stdout: 'fcs version: 3.0.0', stderr: '', exitCode: 0 });
        assert.strictEqual(await (manager as any).getAvailableCliPath(), '/storage/fcs-cli/fcs');
    });

    test('getAvailableCliPath: uses system CLI when no downloaded CLI exists', async () => {
        (manager as any).resolveCliPath = async () => '/usr/local/bin/fcs';
        (manager as any).isWorkspacePath = () => false;
        (manager as any).getDownloadedCliPath = () => '/storage/fcs-cli/fcs';
        (manager as any).pathExists = async () => false;
        (manager as any).executeCli = async () => ({ stdout: 'fcs version: 3.2.0', stderr: '', exitCode: 0 });
        assert.strictEqual(await (manager as any).getAvailableCliPath(), '/usr/local/bin/fcs');
    });

    test('checkCliStatus: prefers downloaded CLI over system CLI regardless of version', async () => {
        (manager as any).resolveCliPath = async () => '/usr/local/bin/fcs';
        (manager as any).isWorkspacePath = () => false;
        (manager as any).executeCli = async () => ({ stdout: 'fcs version: 3.2.0', stderr: '', exitCode: 0 });
        sandbox.stub(manager as any, 'checkDownloadedCli').resolves({
            isInstalled: true, version: '3.0.0', path: '/storage/fcs-cli/fcs', isCompatible: true
        });
        const status = await manager.checkCliStatus();
        assert.strictEqual(status.version, '3.0.0');
        assert.strictEqual(status.path, '/storage/fcs-cli/fcs');
    });

    test('checkCliStatus: uses system CLI when no downloaded CLI exists', async () => {
        (manager as any).resolveCliPath = async () => '/usr/local/bin/fcs';
        (manager as any).isWorkspacePath = () => false;
        (manager as any).executeCli = async () => ({ stdout: 'fcs version: 3.2.0', stderr: '', exitCode: 0 });
        sandbox.stub(manager as any, 'checkDownloadedCli').resolves({
            isInstalled: false, path: '/storage/fcs-cli/fcs'
        });
        const status = await manager.checkCliStatus();
        assert.strictEqual(status.version, '3.2.0');
        assert.strictEqual(status.path, '/usr/local/bin/fcs');
    });

    // --- migrate-config ---

    test('runMigrateConfig: returns false without running when fcs_profiles.json does not exist', async () => {
        (manager as any).pathExists = async () => false;
        const execStub = sandbox.stub(manager as any, 'executeCommand');
        const result = await manager.runMigrateConfig();
        assert.strictEqual(result, false);
        assert.ok(!execStub.called, 'executeCommand should not be called when no legacy file exists');
    });

    test('runMigrateConfig: returns true when legacy file exists and executeCommand exits 0', async () => {
        (manager as any).pathExists = async () => true;
        sandbox.stub(manager as any, 'executeCommand').resolves({ success: true, exitCode: 0, stdout: '', stderr: '' });
        const result = await manager.runMigrateConfig();
        assert.strictEqual(result, true);
    });

    test('runMigrateConfig: returns false when legacy file exists but executeCommand exits non-zero', async () => {
        (manager as any).pathExists = async () => true;
        sandbox.stub(manager as any, 'executeCommand').resolves({ success: false, exitCode: 1, stdout: '', stderr: 'error' });
        const result = await manager.runMigrateConfig();
        assert.strictEqual(result, false);
    });

    test('runMigrateConfig: returns false when legacy file exists but executeCommand throws', async () => {
        (manager as any).pathExists = async () => true;
        sandbox.stub(manager as any, 'executeCommand').rejects(new Error('execution failed'));
        const result = await manager.runMigrateConfig();
        assert.strictEqual(result, false);
    });

    test('getLastKnownVersion: returns undefined before any version is stored', () => {
        sandbox.stub(manager as any, 'context').value({ globalState: { get: () => undefined } });
        const version = manager.getLastKnownVersion();
        assert.strictEqual(version, undefined);
    });

    test('setLastKnownVersion + getLastKnownVersion: round-trip correctly', async () => {
        const mockGlobalState = {
            data: new Map<string, string>(),
            get: function(key: string) { return this.data.get(key); },
            update: async function(key: string, value: string) { this.data.set(key, value); }
        };
        sandbox.stub(manager as any, 'context').value({ globalState: mockGlobalState });
        await manager.setLastKnownVersion('3.0.0');
        const retrieved = manager.getLastKnownVersion();
        assert.strictEqual(retrieved, '3.0.0');
    });
});
