/**
 * Help manager for extension documentation and user guidance
 * Provides professional webview-based setup assistance, troubleshooting, and documentation
 */

import * as vscode from 'vscode';

export class FcsHelpManager {
    private panel: vscode.WebviewPanel | null = null;
    private currentSection: string = 'cli-setup';

    /**
     * Show focused setup help menu (main entry point)
     */
    public async showSetupHelp(): Promise<void> {
        await this.showHelpWebview('cli-setup');
    }

    /**
     * Show CLI setup decision tree and installation guide
     */
    public async showCliSetupGuide(): Promise<void> {
        await this.showHelpWebview('cli-setup');
    }

    /**
     * Show credential configuration help
     */
    public async showCredentialHelp(): Promise<void> {
        await this.showHelpWebview('credentials');
    }

    /**
     * Show configuration instructions
     */
    public async showConfigurationInstructions(): Promise<void> {
        await this.showHelpWebview('configuration');
    }

    /**
     * Show troubleshooting guide for common issues
     */
    public async showTroubleshootingGuide(): Promise<void> {
        await this.showHelpWebview('troubleshooting');
    }

    /**
     * Show links to full documentation
     */
    public async showFullDocumentation(): Promise<void> {
        await this.showHelpWebview('documentation');
    }

    /**
     * Core webview management - creates or updates the help panel
     */
    private async showHelpWebview(section: string): Promise<void> {
        this.currentSection = section;

        if (this.panel) {
            // Panel exists - just update content without regenerating HTML
            this.updateSectionContent(section);
            this.panel.reveal(vscode.ViewColumn.Beside);
            return;
        }

        // Create new webview panel
        this.panel = vscode.window.createWebviewPanel(
            'fcsDocumentation',
            'FCS Documentation',
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: []
            }
        );

        this.panel.webview.html = this.generateWebviewContent();
        this.setupWebviewMessageHandling();

        this.panel.onDidDispose(() => {
            this.panel = null;
        });
    }

    /**
     * Generate complete HTML content for the webview
     */
    private generateWebviewContent(): string {
        return `<!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
            <title>FCS Documentation</title>
            <style>${this.getCSSStyles()}</style>
        </head>
        <body>
            <div class="container">
                <nav class="sidebar">
                    <div class="nav-header">
                        <h2>FCS Help</h2>
                    </div>
                    <ul class="nav-menu">
                        <li><a href="#cli-setup" class="nav-link ${this.currentSection === 'cli-setup' ? 'active' : ''}" onclick="navigateToSection('cli-setup')">CLI Setup Guide</a></li>
                        <li><a href="#credentials" class="nav-link ${this.currentSection === 'credentials' ? 'active' : ''}" onclick="navigateToSection('credentials')">API Credentials</a></li>
                        <li><a href="#configuration" class="nav-link ${this.currentSection === 'configuration' ? 'active' : ''}" onclick="navigateToSection('configuration')">Configuration</a></li>
                        <li><a href="#troubleshooting" class="nav-link ${this.currentSection === 'troubleshooting' ? 'active' : ''}" onclick="navigateToSection('troubleshooting')">Troubleshooting</a></li>
                        <li><a href="#documentation" class="nav-link ${this.currentSection === 'documentation' ? 'active' : ''}" onclick="navigateToSection('documentation')">Documentation</a></li>
                    </ul>
                </nav>
                <main class="content">
                    <div id="content-area">
                        ${this.getCurrentSectionContent()}
                    </div>
                </main>
            </div>
            <script>${this.getJavaScript()}</script>
        </body>
        </html>`;
    }

    /**
     * Get content for the current section
     */
    private getCurrentSectionContent(): string {
        switch (this.currentSection) {
            case 'cli-setup': return this.getCliSetupContent();
            case 'credentials': return this.getCredentialsContent();
            case 'configuration': return this.getConfigurationContent();
            case 'troubleshooting': return this.getTroubleshootingContent();
            case 'documentation': return this.getDocumentationContent();
            default: return this.getCliSetupContent();
        }
    }

    /**
     * Update only the content section without regenerating entire HTML
     */
    private updateSectionContent(section: string): void {
        if (!this.panel) {
            return;
        }

        this.currentSection = section;
        const newContent = this.getCurrentSectionContent();

        this.panel.webview.postMessage({
            command: 'updateContent',
            content: newContent
        });
    }

    /**
     * Setup message handling between webview and extension
     */
    private setupWebviewMessageHandling(): void {
        this.panel?.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'openExternal':
                        vscode.commands.executeCommand('vscode.open',
                            vscode.Uri.parse(message.url));
                        break;
                    case 'navigateToSection':
                        this.showHelpWebview(message.section);
                        break;
                    case 'updateContent':
                        this.updateSectionContent(message.section);
                        break;
                    case 'runCommand': {
                        // Derive allowlist from the extension's own package.json contributes.commands
                        // so adding a new FCS command there automatically permits it here.
                        const pkg = vscode.extensions.getExtension('CrowdStrike.fcs-vscode')?.packageJSON;
                        const allowedCommands: string[] = pkg?.contributes?.commands?.map(
                            (cmd: { command: string }) => cmd.command
                        ) ?? [
                            'fcs.scanFile',
                            'fcs.scanWorkspace',
                            'fcs.checkCliStatus',
                            'fcs.installCli',
                            'fcs.configure',
                            'fcs.clearDiagnostics',
                            'fcs.showHelp',
                            'fcs.openSettings'
                        ];
                        if (allowedCommands.includes(message.commandId)) {
                            vscode.commands.executeCommand(message.commandId);
                        } else {
                            console.warn(`Blocked attempt to execute non-allowlisted command: ${message.commandId}`);
                        }
                        break;
                    }
                    case 'showNotification':
                        vscode.window.showInformationMessage(message.text);
                        break;
                }
            },
            undefined,
            []
        );
    }

    /**
     * Get professional CSS styles with VS Code theme integration
     */
    private getCSSStyles(): string {
        return `
            :root {
                --vscode-font-family: var(--vscode-font-family);
                --vscode-editor-background: var(--vscode-editor-background);
                --vscode-editor-foreground: var(--vscode-editor-foreground);
                --vscode-panel-background: var(--vscode-panel-background);
                --vscode-panel-border: var(--vscode-panel-border);
                --vscode-input-background: var(--vscode-input-background);
                --vscode-input-foreground: var(--vscode-input-foreground);
                --vscode-list-hoverBackground: var(--vscode-list-hoverBackground);
                --vscode-list-activeSelectionBackground: var(--vscode-list-activeSelectionBackground);
                --vscode-list-activeSelectionForeground: var(--vscode-list-activeSelectionForeground);
                --vscode-button-background: var(--vscode-button-background);
                --vscode-button-foreground: var(--vscode-button-foreground);
                --vscode-button-hoverBackground: var(--vscode-button-hoverBackground);
            }

            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }

            body {
                font-family: var(--vscode-font-family);
                background-color: var(--vscode-editor-background);
                color: var(--vscode-editor-foreground);
                overflow: auto;
            }

            .container {
                display: flex;
                min-height: 100vh;
                width: 100%;
            }

            .sidebar {
                width: 280px;
                background-color: var(--vscode-panel-background);
                border-right: 1px solid var(--vscode-panel-border);
                padding: 16px;
                overflow-y: auto;
            }

            .nav-header {
                margin-bottom: 20px;
            }

            .nav-header h2 {
                margin-bottom: 12px;
                font-size: 18px;
                font-weight: 600;
            }

            .nav-menu {
                list-style: none;
            }

            .nav-menu li {
                margin-bottom: 2px;
            }

            .nav-link {
                display: block;
                padding: 10px 12px;
                text-decoration: none;
                color: inherit;
                border-radius: 4px;
                transition: background-color 0.2s;
                cursor: pointer;
            }

            .nav-link:hover {
                background-color: var(--vscode-list-hoverBackground);
            }

            .nav-link.active {
                background-color: var(--vscode-list-activeSelectionBackground);
                color: var(--vscode-list-activeSelectionForeground);
            }

            .content {
                flex: 1;
                padding: 24px 32px;
                overflow-y: auto;
            }

            .breadcrumb {
                font-size: 13px;
                opacity: 0.8;
                margin-bottom: 16px;
            }

            .breadcrumb span {
                margin-right: 8px;
            }

            h1 {
                font-size: 28px;
                font-weight: 600;
                margin-bottom: 24px;
            }

            h2 {
                font-size: 22px;
                font-weight: 600;
                margin: 24px 0 16px 0;
            }

            h3 {
                font-size: 18px;
                font-weight: 600;
                margin: 20px 0 12px 0;
            }

            h4 {
                font-size: 16px;
                font-weight: 600;
                margin: 16px 0 8px 0;
            }

            p {
                margin-bottom: 16px;
                line-height: 1.6;
            }

            ul, ol {
                margin-bottom: 16px;
                padding-left: 24px;
            }

            li {
                margin-bottom: 4px;
                line-height: 1.5;
            }

            .decision-tree {
                background-color: var(--vscode-panel-background);
                border: 1px solid var(--vscode-panel-border);
                border-radius: 8px;
                padding: 20px;
                margin: 24px 0;
            }

            .decision-card h3 {
                margin-top: 0;
            }

            .options {
                display: flex;
                gap: 12px;
                margin-top: 16px;
                flex-wrap: wrap;
                align-items: stretch;
            }

            .option-btn {
                background-color: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: none;
                padding: 12px 20px;
                border-radius: 4px;
                cursor: pointer;
                font-family: inherit;
                font-size: 14px;
                transition: background-color 0.2s;
                width: 320px;
                text-align: center;
                white-space: nowrap;
            }

            .option-btn:hover {
                background-color: var(--vscode-button-hoverBackground);
            }

            .install-method, .content-section {
                margin-top: 24px;
            }

            .hidden {
                display: none;
            }

            .benefits-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                gap: 8px;
                margin: 16px 0;
            }

            .benefit-item {
                padding: 8px;
                background-color: var(--vscode-panel-background);
                border-radius: 4px;
                font-size: 14px;
            }

            .installation-steps {
                margin-top: 20px;
            }

            .step {
                display: flex;
                margin-bottom: 24px;
                align-items: flex-start;
            }

            .step-number {
                display: flex;
                align-items: center;
                justify-content: center;
                width: 32px;
                height: 32px;
                background-color: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border-radius: 50%;
                font-weight: 600;
                margin-right: 16px;
                flex-shrink: 0;
            }

            .step-content {
                flex: 1;
            }

            .platform-tabs {
                display: flex;
                gap: 4px;
                margin: 12px 0;
            }

            .tab-btn {
                background-color: var(--vscode-panel-background);
                border: 1px solid var(--vscode-panel-border);
                color: inherit;
                padding: 8px 16px;
                border-radius: 4px 4px 0 0;
                cursor: pointer;
                font-family: inherit;
                font-size: 14px;
            }

            .tab-btn.active {
                background-color: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
            }

            .platform-content {
                background-color: var(--vscode-panel-background);
                border: 1px solid var(--vscode-panel-border);
                border-radius: 0 4px 4px 4px;
                padding: 16px;
            }

            .code-block {
                position: relative;
                margin: 12px 0;
            }

            .copy-btn {
                position: absolute;
                top: 8px;
                right: 8px;
                background-color: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: none;
                padding: 4px 8px;
                border-radius: 3px;
                cursor: pointer;
                font-size: 12px;
            }

            pre {
                background-color: var(--vscode-editor-background);
                border: 1px solid var(--vscode-panel-border);
                border-radius: 4px;
                padding: 16px;
                overflow-x: auto;
                font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
                font-size: 13px;
                line-height: 1.4;
            }

            code {
                font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
                font-size: 13px;
            }

            a {
                color: var(--vscode-textLink-foreground);
                text-decoration: none;
            }

            a:hover {
                text-decoration: underline;
            }
        `;
    }

    /**
     * Get interactive JavaScript for webview functionality
     */
    private getJavaScript(): string {
        return `
            const vscode = acquireVsCodeApi();

            // Listen for messages from the extension
            window.addEventListener('message', event => {
                const message = event.data;
                if (message.command === 'updateContent') {
                    updateContentArea(message.content);
                }
            });

            function navigateToSection(section) {
                // Update active navigation link
                document.querySelectorAll('.nav-link').forEach(link => {
                    link.classList.remove('active');
                });
                document.querySelector(\`a[onclick="navigateToSection('\${section}')"]\`)?.classList.add('active');

                // Request new content for the section
                vscode.postMessage({
                    command: 'updateContent',
                    section: section
                });
            }

            function showInstallMethod(method) {
                // Hide all install methods
                document.querySelectorAll('.install-method').forEach(el => {
                    el.classList.add('hidden');
                });

                // Show selected method
                const targetId = method === 'system' ? 'system-install' : 'extension-install';
                const targetEl = document.getElementById(targetId);
                if (targetEl) {
                    targetEl.classList.remove('hidden');
                }
            }

            function showPlatform(platform) {
                // Update tab buttons
                document.querySelectorAll('.tab-btn').forEach(btn => {
                    btn.classList.remove('active');
                });
                event.target.classList.add('active');

                // Show platform content
                document.querySelectorAll('.platform-content').forEach(content => {
                    content.classList.add('hidden');
                });
                const targetContent = document.getElementById(platform + '-content');
                if (targetContent) {
                    targetContent.classList.remove('hidden');
                }
            }

            function copyToClipboard(elementId) {
                const element = document.getElementById(elementId);
                if (element) {
                    const text = element.textContent || element.innerText;
                    navigator.clipboard.writeText(text).then(() => {
                        vscode.postMessage({
                            command: 'showNotification',
                            text: 'Copied to clipboard!'
                        });
                    });
                }
            }

            function openExternal(url) {
                vscode.postMessage({
                    command: 'openExternal',
                    url: url
                });
            }

            function runCommand(commandId) {
                vscode.postMessage({
                    command: 'runCommand',
                    commandId: commandId
                });
            }

            function updateContentArea(content) {
                const contentArea = document.getElementById('content-area');
                if (contentArea) {
                    contentArea.innerHTML = content;
                }
            }

        `;
    }

    /**
     * Generate CLI Setup content as interactive HTML
     */
    private getCliSetupContent(): string {
        return `
        <div class="help-section" id="cli-setup">
            <div class="breadcrumb">
                <span>FCS Help</span> › <span>CLI Setup Guide</span>
            </div>

            <h1>FCS CLI Setup Guide</h1>

            <div class="decision-tree">
                <div class="decision-card">
                    <h3>🎯 Choose Your Installation Method</h3>
                    <p>Do you have admin/sudo access on this machine?</p>
                    <div class="options">
                        <button class="option-btn" onclick="showInstallMethod('system')">
                            ✅ YES - System Installation
                        </button>
                        <button class="option-btn" onclick="showInstallMethod('extension')">
                            📦 NO - Extension Download
                        </button>
                    </div>
                </div>
            </div>

            <div id="system-install" class="install-method hidden">
                <h2>System Installation</h2>
                <div class="benefits-grid">
                    <div class="benefit-item">✅ Available to all VS Code instances</div>
                    <div class="benefit-item">✅ Works with other tools and scripts</div>
                    <div class="benefit-item">✅ No credential setup required</div>
                    <div class="benefit-item">✅ Easier to update and manage</div>
                </div>

                <div class="installation-steps">
                    <div class="step">
                        <div class="step-number">1</div>
                        <div class="step-content">
                            <h4>Download FCS CLI</h4>
                            <p>Get the CLI from the 
                            <a href="#" onclick="openExternal('https://falcon.crowdstrike.com/login/?unilogin=true&next=/support/tool-downloads')"><strong>Tool Downloads</strong> page in the Falcon console</a></p>
                        </div>
                    </div>

                    <div class="step">
                        <div class="step-number">2</div>
                        <div class="step-content">
                            <h4>Install to PATH</h4>
                            <div class="platform-tabs">
                                <button class="tab-btn active" onclick="showPlatform('macos')">macOS/Linux</button>
                                <button class="tab-btn" onclick="showPlatform('windows')">Windows</button>
                            </div>
                            <div id="macos-content" class="platform-content">
                                <div class="code-block">
                                    <button class="copy-btn" onclick="copyToClipboard('macos-commands')">Copy</button>
                                    <pre id="macos-commands"><code>tar -xvzf fcs*.tar.gz
sudo mv fcs /usr/local/bin/
sudo chmod +x /usr/local/bin/fcs</code></pre>
                                </div>
                            </div>
                            <div id="windows-content" class="platform-content hidden">
                                <ol>
                                    <li>Extract fcs.exe to C:\\Tools\\FCS</li>
                                    <li>Add C:\\Tools\\FCS to your PATH</li>
                                </ol>
                            </div>
                        </div>
                    </div>

                    <div class="step">
                        <div class="step-number">3</div>
                        <div class="step-content">
                            <h4>Verify Installation</h4>
                            <div class="code-block">
                                <button class="copy-btn" onclick="copyToClipboard('verify-command')">Copy</button>
                                <pre id="verify-command"><code>fcs version</code></pre>
                            </div>
                            <p>You should see version information displayed.</p>
                        </div>
                    </div>
                </div>
            </div>

            <div id="extension-install" class="install-method hidden">
                <h2>Extension Download</h2>
                <div class="benefits-grid">
                    <div class="benefit-item">✅ No admin access required</div>
                    <div class="benefit-item">✅ Automatic installation</div>
                    <div class="benefit-item">✅ Isolated to VS Code</div>
                    <div class="benefit-item">✅ Easy credential setup</div>
                </div>
                <p class="note"><strong>Note:</strong> This option requires CrowdStrike client API credentials. For more info, including the required scopes, see <a href="#" onclick="navigateToSection('credentials')">API Credentials</a>.</p>
                <div class="installation-steps">
                    <div class="step">
                        <div class="step-number">1</div>
                        <div class="step-content">
                            <h4>Run the "FCS: Download CLI" command</h4>
                            <p>From the VS Code Command Palette, use <strong>FCS: Download CLI</strong>.</p>
                        </div>
                    </div>

                    <div class="step">
                        <div class="step-number">2</div>
                        <div class="step-content">
                            <h4>Enter API Credentials</h4>
                            <p>Enter your Falcon Client ID and Secret</p>
                        </div>
                    </div>

                    <div class="step">
                        <div class="step-number">3</div>
                        <div class="step-content">
                            <h4>Select your CrowdStrike cloud:</h4>
                            <ul>
                                <li>US-1 (Commercial)</li>
                                <li>US-2 (Commercial)</li>
                                <li>EU-1 (Commercial)</li>
                                <li>US-GOV-1 (GovCloud)</li>
                                <li>US-GOV-2 (GovCloud)</li>
                            </ul>
                        </div>
                    </div>

                    <div class="step">
                        <div class="step-number">4</div>
                        <div class="step-content">
                            <h4>Download</h4>
                            <p>Click <strong>Download</strong>.</p>
                        </div>
                    </div>

                    <div class="step">
                        <div class="step-number">5</div>
                        <div class="step-content">
                            <h4>Already have the FCS CLI installed?</h4>
                            <p>If you have an existing FCS CLI installation, the extension will use that binary and its associated configuration in <code>~/.crowdstrike/fcs.json</code>. If you experience scan failures after upgrading the CLI, run <code>fcs migrate-config</code> in a terminal to update your configuration to the latest format. See <a href="#" onclick="navigateToSection('troubleshooting')">Troubleshooting</a> for more detail.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
    }

    /**
     * Generate Credentials content as interactive HTML
     */
    private getCredentialsContent(): string {
        return `
        <div class="help-section" id="credentials">
            <div class="breadcrumb">
                <span>FCS Help</span> › <span>API Credentials</span>
            </div>

            <h1>CrowdStrike API Credentials</h1>

            <p>CrowdStrike API credentials are only needed if you're using the extension's CLI download feature. If you installed the FCS CLI manually, you can skip this section.</p>

            <p>Follow these steps to obtain your CrowdStrike API client and secret. Only a Falcon Admin can create new API Client keys.</p>
            <div class="decision-tree">
                <div class="decision-card">
                    <h3>🔑 Getting API Credentials</h3>
                    <p>See these instructions in the Falcon documentation</p>
                    <div class="options">
                        <button class="option-btn" onclick="openExternal('https://docs.crowdstrike.com/access?ft:originId=ufcd2496')">
                            📖 Open CrowdStrike Documentation
                        </button>
                    </div>
                </div>
            </div>

            <div class="installation-steps">
                <div class="step">
                    <div class="step-number">1</div>
                    <div class="step-content">
                        <h4>Access the Falcon Console</h4>
                        <p>Log into the Falcon console.</p>
                    </div>
                </div>

                <div class="step">
                    <div class="step-number">2</div>
                    <div class="step-content">
                        <h4>Navigate to the API Section</h4>
                        <p>Go to <strong>Support</strong> → <strong>API Clients & Keys</strong></p>
                    </div>
                </div>

                <div class="step">
                    <div class="step-number">3</div>
                    <div class="step-content">
                        <h4>Create API Client</h4>
                        <ul>
                            <li>Create a new API client</li>
                            <li>Grant the following scopes:</li>
                            <ul>
                            <li><strong>Falcon Container CLI</strong> : Read / Write</li>
                            <li><strong>Falcon Container Image</strong> : Read / Write</li>
                            <li><strong>Infrastructure as Code</strong> : Read / Write</li>
                            </ul>
                            <li>Note your region</li>
                        </ul>
                    </div>
                </div>

                <div class="step">
                    <div class="step-number">4</div>
                    <div class="step-content">
                        <h4>Save Credentials</h4>
                        <p>Copy your <strong>client ID</strong> and <strong>secret</strong> and note your CrowdStrike cloud by looking at the provided <strong>base API url</strong>. The extension prompts for these when downloading the CLI.</p>
                        <p><strong>Note:</strong> Your CrowdStrike API client keys are only used for downloading and are not stored by the extension.</p>
                    </div>
                </div>
            </div>
        </div>`;
    }

    /**
     * Generate Configuration content as interactive HTML
     */
    private getConfigurationContent(): string {
        return `
        <div class="help-section" id="configuration">
            <div class="breadcrumb">
                <span>FCS Help</span> › <span>Configuration</span>
            </div>

            <h1>FCS Extension Configuration</h1>

            <h2>Supported File Types</h2>
            <ul>
                <li><strong>Terraform:</strong> .tf, .tfvars</li>
                <li><strong>YAML/YML:</strong> Kubernetes, Docker Compose, etc.</li>
                <li><strong>JSON:</strong> CloudFormation templates</li>
                <li><strong>Dockerfiles:</strong> Container configurations</li>
                <li><strong>Azure Bicep:</strong> .bicep</li>
            </ul>

            <h2>Basic Settings</h2>

            <div class="installation-steps">
                <div class="step">
                    <div class="step-number">✓</div>
                    <div class="step-content">
                        <h4>enabled</h4>
                        <p>Enable or disable the extension globally.</p>
                    </div>
                </div>

                <div class="step">
                    <div class="step-number">✓</div>
                    <div class="step-content">
                        <h4>scanOnSave</h4>
                        <p>Automatically scan files when they are saved.</p>
                    </div>
                </div>

                <div class="step">
                    <div class="step-number">✓</div>
                    <div class="step-content">
                        <h4>severity</h4>
                        <p>Minimum severity level to show: "all", "critical", "high", "medium", "low", or "informational"</p>
                    </div>
                </div>

                <div class="step">
                    <div class="step-number">✓</div>
                    <div class="step-content">
                        <h4>scanPaths</h4>
                        <p>Directories to scan during workspace scanning (relative to workspace root). Leave empty to scan the entire workspace.</p>
                    </div>
                </div>

                <div class="step">
                    <div class="step-number">✓</div>
                    <div class="step-content">
                        <h4>filePatterns</h4>
                        <p>File patterns to include in scans (e.g. "*.tf", "*.yaml", "Dockerfile")</p>
                    </div>
                </div>

                <div class="step">
                    <div class="step-number">✓</div>
                    <div class="step-content">
                        <h4>platforms</h4>
                        <p>Restrict scans to specific IaC platforms (e.g. "Terraform", "Kubernetes", "CloudFormation"). Leave empty to scan all platforms. Useful in mixed-platform repositories where multiple platforms share the same file format.</p>
                    </div>
                </div>

                <div class="step">
                    <div class="step-number">✓</div>
                    <div class="step-content">
                        <h4>scanTimeout</h4>
                        <p>Timeout for CLI scans in seconds (default: 300). Increase for large workspaces or slow machines.</p>
                    </div>
                </div>
            </div>

            <h2>JSON Settings</h2>
            <p>Available settings to add to your VS Code settings.json:</p>

            <div class="code-block">
                <button class="copy-btn" onclick="copyToClipboard('config-example')">Copy</button>
                <pre id="config-example"><code>{
    "fcs.enabled": true,
    "fcs.scanOnSave": true,
    "fcs.severity": "all",
    "fcs.scanPaths": ["./iac", "./infrastructure"],
    "fcs.filePatterns": ["*.tf", "*.yaml", "*.json"],
    "fcs.proxyUrl": "",
    "fcs.platforms": ["Terraform", "Kubernetes"],
    "fcs.scanTimeout": 300
}</code></pre>
            </div>
        </div>`;
    }

    /**
     * Generate Troubleshooting content as interactive HTML
     */
    private getTroubleshootingContent(): string {
        return `
        <div class="help-section" id="troubleshooting">
            <div class="breadcrumb">
                <span>FCS Help</span> › <span>Troubleshooting</span>
            </div>

            <h1>FCS Extension Troubleshooting</h1>

            <h2>❌ CLI Installation Issues</h2>

            <h3>"FCS CLI not found" or "CLI not detected"</h3>
            <ul>
                <li><strong>CLI not in PATH:</strong> Add fcs to your system PATH or use "FCS: Download CLI"</li>
                <li><strong>Wrong binary name:</strong> Ensure the executable is named exactly "fcs"</li>
                <li><strong>Permission issues:</strong> Make sure fcs has execute permissions (<code>chmod +x fcs</code>)</li>
                <li><strong>VS Code restart needed:</strong> Restart VS Code after installing CLI to PATH</li>
            </ul>

            <h3>CLI download fails with authentication errors</h3>
            <ul>
                <li><strong>Wrong region selected:</strong> Verify your CrowdStrike region</li>
                <li><strong>Invalid credentials:</strong> Check Client ID and Secret are correct</li>
                <li><strong>Insufficient permissions:</strong> Ensure your CrowdStrike API client has proper scopes. Go to <a href="#" onclick="navigateToSection('credentials')">API Credentials</a> to validate.</li>
                <li><strong>Expired credentials:</strong> Regenerate API credentials if old</li>
            </ul>

            <h2>❌ Scanning Issues</h2>

            <h3>"Scan failed" or no results shown</h3>
            <ul>
                <li><strong>CLI version incompatible:</strong> Update CLI or use "FCS: Download CLI"</li>
                <li><strong>File type not supported:</strong> Check if file extension is supported</li>
                <li><strong>CLI exit code issues:</strong> Check VS Code output panel for errors</li>
                <li><strong>Workspace path problems:</strong> Ensure scan paths exist and are accessible</li>
            </ul>

            <h3>Scan fails after upgrading the FCS CLI</h3>
            <p>Upgrading the CLI binary without migrating your configuration can cause unexpected failures. Run the following in a terminal to migrate your config to the latest format:</p>
            <div class="code-block">
                <button class="copy-btn" onclick="copyToClipboard('migrate-config-cmd')">Copy</button>
                <pre id="migrate-config-cmd"><code>fcs migrate-config</code></pre>
            </div>
            <p>If you are upgrading from FCS CLI v2, the extension's "FCS: Download CLI" command will run this migration automatically.</p>

            <h3>Version or compatibility issues</h3>
            <p>If you suspect a version mismatch or compatibility problem, run <strong>FCS: Check CLI Status</strong> from the Command Palette. This shows the CLI version currently in use, whether it falls within the supported range, and the latest compatible version if you are not on it.</p>
            <p>Common scenarios:</p>
            <ul>
                <li><strong>CLI below minimum version:</strong> Download a compatible version using "FCS: Download CLI"</li>
                <li><strong>CLI above maximum validated version:</strong> Update the extension to get support for the newer CLI</li>
                <li><strong>Not on latest compatible:</strong> FCS: Check CLI Status will show the latest compatible version — use "FCS: Download CLI" to update</li>
            </ul>

            <h3>Scan-on-save not working</h3>
            <ul>
                <li><strong>Setting disabled:</strong> Check <code>"fcs.scanOnSave": true</code> in settings</li>
                <li><strong>CLI not available:</strong> Verify CLI installation with "FCS: Check CLI Status"</li>
                <li><strong>File type excluded:</strong> Check file patterns include your file type</li>
                <li><strong>Extension disabled:</strong> Check <code>"fcs.enabled": true</code> in settings</li>
            </ul>

            <h2>🔧 Getting Help</h2>

            <div class="installation-steps">
                <div class="step">
                    <div class="step-number">1</div>
                    <div class="step-content">
                        <h4>Check CLI Status</h4>
                        <p>Run <strong>FCS: Check CLI Status</strong> to see version and configuration</p>
                    </div>
                </div>

                <div class="step">
                    <div class="step-number">2</div>
                    <div class="step-content">
                        <h4>Check Extension Logs</h4>
                        <p>Open VS Code Developer Tools (Help → Toggle Developer Tools)</p>
                    </div>
                </div>

                <div class="step">
                    <div class="step-number">3</div>
                    <div class="step-content">
                        <h4>Review Configuration</h4>
                        <p>Use <strong>FCS: Show Configuration Instructions</strong> for setup guidance</p>
                    </div>
                </div>
            </div>
        </div>`;
    }

    /**
     * Generate Documentation content as interactive HTML
     */
    private getDocumentationContent(): string {
        return `
        <div class="help-section" id="documentation">
            <div class="breadcrumb">
                <span>FCS Help</span> › <span>Documentation</span>
            </div>

            <h1>Extension Documentation</h1>

            <p>The FCS extension is available on the VS Code Marketplace:</p>

            <div class="decision-tree">
                <div class="decision-card">
                    <h3>📚 Documentation Resources</h3>
                    <div class="options">
                        <button class="option-btn" onclick="openExternal('https://marketplace.visualstudio.com/')">
                            🏪 VS Code Marketplace
                        </button>
                    </div>
                </div>
            </div>

            <h2>Available Commands</h2>
            <ul>
                <li><strong>FCS: Scan Current File</strong> - Scan active file for security issues</li>
                <li><strong>FCS: Scan Workspace</strong> - Scan entire workspace or configured paths</li>
                <li><strong>FCS: Check CLI Status</strong> - View CLI installation status</li>
                <li><strong>FCS: Download CLI</strong> - Download CLI with credentials</li>
                <li><strong>FCS: Show Configuration Instructions</strong> - Setup guidance</li>
                <li><strong>FCS: Clear All Diagnostics</strong> - Remove all findings</li>
                <li><strong>FCS: Help</strong> - This help system</li>
                <li><strong>FCS: Open Settings</strong> - Quick access to settings</li>
            </ul>

            <h2>Quick Reference</h2>
            <p>All extension settings are under <code>fcs.*</code> in VS Code settings.</p>

            <h3>Supported File Types</h3>
            <ul>
                <li><strong>Terraform:</strong> .tf, .tfvars</li>
                <li><strong>YAML/YML:</strong> Kubernetes, Docker Compose, etc.</li>
                <li><strong>JSON:</strong> CloudFormation templates</li>
                <li><strong>Dockerfiles:</strong> Container configurations</li>
                <li><strong>Azure Bicep:</strong> .bicep</li>
            </ul>
        </div>`;
    }
}

export default FcsHelpManager;
