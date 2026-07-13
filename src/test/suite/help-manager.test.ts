import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { FcsHelpManager } from '../../core/helpManager';

suite('FcsHelpManager Tests', () => {
    let manager: FcsHelpManager;
    let sandbox: sinon.SinonSandbox;
    let fakePanel: any;
    let fakeWebview: any;
    let disposeCallback: (() => void) | undefined;
    let messageCallback: ((msg: any) => void) | undefined;

    function buildFakePanel() {
        disposeCallback = undefined;
        messageCallback = undefined;
        fakeWebview = {
            html: '',
            postMessage: sinon.stub().returns(Promise.resolve(true)),
            onDidReceiveMessage: sinon.stub().callsFake((cb: any) => {
                messageCallback = cb;
                return { dispose: () => {} };
            })
        };
        fakePanel = {
            webview: fakeWebview,
            reveal: sinon.stub(),
            onDidDispose: sinon.stub().callsFake((cb: any) => {
                disposeCallback = cb;
                return { dispose: () => {} };
            })
        };
        return fakePanel;
    }

    setup(() => {
        sandbox = sinon.createSandbox();
        manager = new FcsHelpManager();
        sandbox.stub(vscode.window, 'createWebviewPanel').callsFake(() => buildFakePanel());
    });

    teardown(() => {
        sandbox.restore();
    });

    // --- Pure content methods: no mocks, just call and verify HTML structure ---

    test('getCliSetupContent: returns HTML with system and extension install sections', () => {
        const html = (manager as any).getCliSetupContent() as string;
        assert.ok(html.includes('CLI Setup Guide'));
        assert.ok(html.includes('system-install'));
        assert.ok(html.includes('extension-install'));
        assert.ok(html.includes('showInstallMethod'));
    });

    test('getCredentialsContent: returns HTML with API credentials steps', () => {
        const html = (manager as any).getCredentialsContent() as string;
        assert.ok(html.includes('API Credentials'));
        assert.ok(html.includes('client ID'));
        assert.ok(html.includes('secret'));
    });

    test('getConfigurationContent: returns HTML with settings reference', () => {
        const html = (manager as any).getConfigurationContent() as string;
        assert.ok(html.includes('Configuration'));
        assert.ok(html.includes('fcs.enabled'));
        assert.ok(html.includes('fcs.scanOnSave'));
    });

    test('getTroubleshootingContent: returns HTML with common issue guidance', () => {
        const html = (manager as any).getTroubleshootingContent() as string;
        assert.ok(html.includes('Troubleshooting'));
        assert.ok(html.includes('CLI not found'));
        assert.ok(html.includes('scanOnSave'));
    });

    test('getDocumentationContent: returns HTML listing available commands', () => {
        const html = (manager as any).getDocumentationContent() as string;
        assert.ok(html.includes('Documentation'));
        assert.ok(html.includes('Scan Current File'));
        assert.ok(html.includes('Scan Workspace'));
    });

    test('getCSSStyles: returns CSS with VS Code theme variable references', () => {
        const css = (manager as any).getCSSStyles() as string;
        assert.ok(css.length > 100);
        assert.ok(css.includes('vscode-editor-background'));
        assert.ok(css.includes('nav-link'));
        assert.ok(css.includes('option-btn'));
    });

    test('getJavaScript: returns JS with postMessage API and interaction handlers', () => {
        const js = (manager as any).getJavaScript() as string;
        assert.ok(js.length > 100);
        assert.ok(js.includes('acquireVsCodeApi'));
        assert.ok(js.includes('vscode.postMessage'));
        assert.ok(js.includes('navigateToSection'));
        assert.ok(js.includes('copyToClipboard'));
    });

    // --- getCurrentSectionContent: each branch ---

    test('getCurrentSectionContent: returns cli-setup content for default section', () => {
        const html = (manager as any).getCurrentSectionContent() as string;
        assert.ok(html.includes('CLI Setup Guide'));
    });

    test('getCurrentSectionContent: returns credentials content for credentials section', () => {
        (manager as any).currentSection = 'credentials';
        assert.ok(((manager as any).getCurrentSectionContent() as string).includes('API Credentials'));
    });

    test('getCurrentSectionContent: returns configuration content for configuration section', () => {
        (manager as any).currentSection = 'configuration';
        assert.ok(((manager as any).getCurrentSectionContent() as string).includes('fcs.enabled'));
    });

    test('getCurrentSectionContent: returns troubleshooting content for troubleshooting section', () => {
        (manager as any).currentSection = 'troubleshooting';
        assert.ok(((manager as any).getCurrentSectionContent() as string).includes('Troubleshooting'));
    });

    test('getCurrentSectionContent: returns documentation content for documentation section', () => {
        (manager as any).currentSection = 'documentation';
        assert.ok(((manager as any).getCurrentSectionContent() as string).includes('Documentation'));
    });

    test('getCurrentSectionContent: falls back to cli-setup for an unrecognised section key', () => {
        (manager as any).currentSection = 'unknown-section';
        assert.ok(((manager as any).getCurrentSectionContent() as string).includes('CLI Setup Guide'));
    });

    // --- generateWebviewContent ---

    test('generateWebviewContent: returns a complete HTML document with CSP and navigation', () => {
        const html = (manager as any).generateWebviewContent() as string;
        assert.ok(html.startsWith('<!DOCTYPE html>') || html.includes('<!DOCTYPE html>'));
        assert.ok(html.includes('Content-Security-Policy'));
        assert.ok(html.includes('nav-menu'));
        assert.ok(html.includes('content-area'));
        assert.ok(html.includes('acquireVsCodeApi'));
    });

    // --- updateSectionContent: panel absent (early return) ---

    test('updateSectionContent: returns silently when panel is null', () => {
        (manager as any).panel = null;
        assert.doesNotThrow(() => (manager as any).updateSectionContent('credentials'));
    });

    // --- showHelpWebview via public entry points: panel creation ---

    test('showSetupHelp: creates a webview panel with the correct view type and title', async () => {
        await manager.showSetupHelp();
        const stub = vscode.window.createWebviewPanel as sinon.SinonStub;
        assert.ok(stub.calledOnce);
        assert.strictEqual(stub.firstCall.args[0], 'fcsDocumentation');
        assert.strictEqual(stub.firstCall.args[1], 'FCS Documentation');
    });

    test('showSetupHelp: sets webview HTML to a full document with cli-setup content', async () => {
        await manager.showSetupHelp();
        assert.ok(fakeWebview.html.includes('<!DOCTYPE html>'));
        assert.ok(fakeWebview.html.includes('CLI Setup Guide'));
    });

    test('showCliSetupGuide: renders cli-setup content', async () => {
        await manager.showCliSetupGuide();
        assert.ok(fakeWebview.html.includes('CLI Setup Guide'));
    });

    test('showCredentialHelp: renders credentials content', async () => {
        await manager.showCredentialHelp();
        assert.ok(fakeWebview.html.includes('API Credentials'));
    });

    test('showConfigurationInstructions: renders configuration content', async () => {
        await manager.showConfigurationInstructions();
        assert.ok(fakeWebview.html.includes('fcs.enabled'));
    });

    test('showTroubleshootingGuide: renders troubleshooting content', async () => {
        await manager.showTroubleshootingGuide();
        assert.ok(fakeWebview.html.includes('Troubleshooting'));
    });

    test('showFullDocumentation: renders documentation content', async () => {
        await manager.showFullDocumentation();
        assert.ok(fakeWebview.html.includes('Documentation'));
    });

    // --- Panel reuse on second call ---

    test('second show call reuses the existing panel instead of creating a new one', async () => {
        await manager.showSetupHelp();
        await manager.showCredentialHelp();
        const stub = vscode.window.createWebviewPanel as sinon.SinonStub;
        assert.strictEqual(stub.callCount, 1);
        assert.ok(fakePanel.reveal.calledOnce);
    });

    test('second show call posts updateContent message with the new section HTML', async () => {
        await manager.showSetupHelp();
        await manager.showCredentialHelp();
        assert.ok(fakeWebview.postMessage.calledOnce);
        const msg = fakeWebview.postMessage.firstCall.args[0];
        assert.strictEqual(msg.command, 'updateContent');
        assert.ok(msg.content.includes('API Credentials'));
    });

    // --- Panel dispose lifecycle ---

    test('dispose callback sets panel to null so the next call creates a fresh panel', async () => {
        await manager.showSetupHelp();
        assert.ok(disposeCallback, 'onDidDispose callback must be registered');
        disposeCallback!();
        await manager.showSetupHelp();
        const stub = vscode.window.createWebviewPanel as sinon.SinonStub;
        assert.strictEqual(stub.callCount, 2);
    });

    // --- setupWebviewMessageHandling: message dispatch ---

    test('openExternal message executes vscode.open with the supplied URL', async () => {
        await manager.showSetupHelp();
        const execStub = sandbox.stub(vscode.commands, 'executeCommand').resolves();
        messageCallback!({ command: 'openExternal', url: 'https://docs.crowdstrike.com' });
        assert.ok(execStub.calledWith('vscode.open', sinon.match.any));
    });

    test('navigateToSection message updates content to the requested section', async () => {
        await manager.showSetupHelp();
        fakeWebview.postMessage.resetHistory();
        messageCallback!({ command: 'navigateToSection', section: 'troubleshooting' });
        assert.ok(fakeWebview.postMessage.called);
        const msg = fakeWebview.postMessage.firstCall.args[0];
        assert.strictEqual(msg.command, 'updateContent');
        assert.ok(msg.content.includes('Troubleshooting'));
    });

    test('updateContent message updates the displayed section', async () => {
        await manager.showSetupHelp();
        fakeWebview.postMessage.resetHistory();
        messageCallback!({ command: 'updateContent', section: 'configuration' });
        assert.ok(fakeWebview.postMessage.called);
        const msg = fakeWebview.postMessage.firstCall.args[0];
        assert.ok(msg.content.includes('fcs.enabled'));
    });

    test('showNotification message calls showInformationMessage with the supplied text', async () => {
        await manager.showSetupHelp();
        const infoStub = sandbox.stub(vscode.window, 'showInformationMessage').resolves(undefined);
        messageCallback!({ command: 'showNotification', text: 'Copied to clipboard!' });
        assert.ok(infoStub.calledWith('Copied to clipboard!'));
    });

    test('runCommand: executes all eight allowlisted fcs.* commands', async () => {
        await manager.showSetupHelp();
        const execStub = sandbox.stub(vscode.commands, 'executeCommand').resolves();
        const allowed = [
            'fcs.scanFile', 'fcs.scanWorkspace', 'fcs.checkCliStatus', 'fcs.installCli',
            'fcs.configure', 'fcs.clearDiagnostics', 'fcs.showHelp', 'fcs.openSettings'
        ];
        for (const cmd of allowed) {
            messageCallback!({ command: 'runCommand', commandId: cmd });
        }
        assert.strictEqual(execStub.callCount, 8);
    });

    test('runCommand: blocks commands outside the allowlist', async () => {
        await manager.showSetupHelp();
        const execStub = sandbox.stub(vscode.commands, 'executeCommand').resolves();
        messageCallback!({ command: 'runCommand', commandId: 'evil.injectPayload' });
        messageCallback!({ command: 'runCommand', commandId: 'workbench.action.openSettings' });
        assert.strictEqual(execStub.callCount, 0);
    });
});
