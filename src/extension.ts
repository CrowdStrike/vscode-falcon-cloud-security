/**
 * Extension entry point with clean architecture
 */

import * as vscode from 'vscode';
import * as semver from 'semver';
import { FcsLinter } from './core/linter';
import { FcsCliManager } from './core/cliManager';
import { FcsCredentialsManager } from './core/credentialsManager';
import { FcsHelpManager } from './core/helpManager';
import { ConfigurationManager } from './utils/configUtils';
import { SecurityCodeActionProvider } from './providers/codeActionProvider';
import { SecurityHoverProvider } from './providers/hoverProvider';
import { ErrorHandler } from './utils/errorHandler';
import { CLI_VERSION } from './utils/constants';

let linter: FcsLinter;
let cliManager: FcsCliManager;
let credentialsManager: FcsCredentialsManager;
let helpManager: FcsHelpManager;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    console.log('CrowdStrike FCS Linter is activating...');

    try {
        // Initialize core components
        cliManager = new FcsCliManager(context);
        credentialsManager = new FcsCredentialsManager(context);
        helpManager = new FcsHelpManager();
        linter = new FcsLinter(cliManager);

        // Register commands
        registerCommands(context);

        // Register providers
        registerProviders(context);

        // Register event listeners
        registerEventListeners(context);

        // Start initial setup in background (non-blocking)
        ErrorHandler.handleAsync(
            performInitialSetup(),
            { component: 'Extension', operation: 'initial setup' },
            { logLevel: 'warn' }
        ).catch(() => {
            // Extension continues to work even if setup fails
        });

        console.log('CrowdStrike FCS Linter is now active');

    } catch (error) {
        ErrorHandler.handle(
            error,
            { component: 'Extension', operation: 'activation' },
            { showToUser: true }
        );
    }
}

export function deactivate(): void {
    console.log('CrowdStrike FCS Linter is deactivating...');

    if (linter) {
        linter.dispose();
    }
}

function registerCommands(context: vscode.ExtensionContext): void {
    const commands = [
        // Scanning commands
        vscode.commands.registerCommand('fcs.scanFile', async () => {
            await ensureCliAvailable();
            await linter.scanCurrentFile();
        }),

        vscode.commands.registerCommand('fcs.scanWorkspace', async () => {
            await ensureCliAvailable();
            await linter.scanWorkspace();
        }),

        // CLI management commands
        vscode.commands.registerCommand('fcs.checkCliStatus', async () => {
            await cliManager.showCliStatus();
        }),

        vscode.commands.registerCommand('fcs.installCli', async () => {
            const credentials = await credentialsManager.getDownloadCredentials();
            if (credentials) {
                await cliManager.downloadCli(credentials);
            }
        }),

        // Configuration commands
        vscode.commands.registerCommand('fcs.configure', async () => {
            await helpManager.showConfigurationInstructions();
        }),

        vscode.commands.registerCommand('fcs.clearDiagnostics', () => {
            linter.clearDiagnostics();
        }),

        // Help and information
        vscode.commands.registerCommand('fcs.showHelp', async () => {
            await helpManager.showSetupHelp();
        }),

        vscode.commands.registerCommand('fcs.openSettings', async () => {
            await vscode.commands.executeCommand('workbench.action.openSettings', 'fcs');
        })
    ];

    context.subscriptions.push(...commands);
}

function registerProviders(context: vscode.ExtensionContext): void {
    const documentSelectors = ConfigurationManager.getDocumentSelectors();

    // Code Action Provider - provides quick fixes for security issues
    const codeActionProvider = new SecurityCodeActionProvider();
    const codeActionDisposable = vscode.languages.registerCodeActionsProvider(
        documentSelectors,
        codeActionProvider,
        {
            providedCodeActionKinds: SecurityCodeActionProvider.providedCodeActionKinds
        }
    );

    // Hover Provider - provides remediation guidance on hover
    const hoverProvider = new SecurityHoverProvider();
    const hoverDisposable = vscode.languages.registerHoverProvider(documentSelectors, hoverProvider);

    context.subscriptions.push(codeActionDisposable, hoverDisposable);
}

function registerEventListeners(context: vscode.ExtensionContext): void {
    const eventListeners = [
        // File save events
        vscode.workspace.onDidSaveTextDocument(async (document) => {
            const config = ConfigurationManager.getConfig();
            if (config.scanOnSave && ConfigurationManager.shouldScanFile(document.fileName)) {
                try {
                    await ensureCliAvailable();
                    linter.debouncedScan(document);
                } catch (error) {
                    // Silently fail scan-on-save if CLI not available - user can manually scan later
                    ErrorHandler.handle(
                        error,
                        { component: 'Extension', operation: 'scan on save' },
                        { logLevel: 'warn', showToUser: false }
                    );
                }
            }
        }),

        // Clean up diagnostics when files are closed
        vscode.workspace.onDidCloseTextDocument((document) => {
            linter.clearDocumentDiagnostics(document);
        }),

        // Respond to configuration changes
        vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration('fcs')) {
                handleConfigurationChange();
            }
        })
    ];

    context.subscriptions.push(...eventListeners);
}

async function ensureCliAvailable(): Promise<void> {
    const cliStatus = await cliManager.checkCliStatus();

    if (!cliStatus.isInstalled) {
        const selection = await vscode.window.showWarningMessage(
            'FCS CLI is required for scanning. Would you like to set it up?',
            'Download CLI',
            'Show Instructions',
            'Cancel'
        );

        switch (selection) {
            case 'Download CLI':
                const credentials = await credentialsManager.getDownloadCredentials();
                if (credentials) {
                    await vscode.window.withProgress({
                        location: vscode.ProgressLocation.Notification,
                        title: "Downloading FCS CLI",
                        cancellable: false
                    }, async () => {
                        await cliManager.downloadCli(credentials);
                    });
                }
                break;
            case 'Show Instructions':
                await helpManager.showConfigurationInstructions();
                break;
            case 'Cancel':
                throw ErrorHandler.createError(
                    'CLI is required for scanning operations',
                    { component: 'Extension', operation: 'CLI requirement check' }
                );
        }
    }
}

async function performInitialSetup(): Promise<void> {
    // Check configuration
    const configErrors = ConfigurationManager.validateConfig();
    if (configErrors.length > 0) {
        ErrorHandler.handle(
            new Error(`Configuration issues: ${configErrors.join(', ')}`),
            { component: 'Extension', operation: 'configuration validation' },
            { logLevel: 'warn' }
        );
    }

    // Check CLI status
    const cliStatus = await cliManager.checkCliStatus();

    if (!cliStatus.isInstalled) {
        // Show helpful message for first-time users
        const selection = await vscode.window.showWarningMessage(
            'FCS CLI not detected. Would you like to set it up?',
            'Download CLI',
            'Show Instructions',
            'Later'
        );

        switch (selection) {
            case 'Download CLI':
                const credentials = await credentialsManager.getDownloadCredentials();
                if (credentials) {
                    await cliManager.downloadCli(credentials);
                }
                break;
            case 'Show Instructions':
                await helpManager.showConfigurationInstructions();
                break;
        }
    } else if (cliStatus.isCompatible === false) {
        // CLI version is incompatible
        const isAboveMax = cliStatus.version && semver.gt(cliStatus.version, CLI_VERSION.MAXIMUM);
        const message = isAboveMax
            ? `FCS CLI v${cliStatus.version} is above the maximum validated version (v${CLI_VERSION.MAXIMUM}). ` +
              `Scans may not work correctly. Consider updating the extension.`
            : `FCS CLI v${cliStatus.version} is installed, but this extension requires v${CLI_VERSION.MINIMUM} or later. ` +
              `Scans will not work until the CLI is updated.`;

        const selection = await vscode.window.showWarningMessage(
            message,
            isAboveMax ? 'Dismiss' : 'Download Latest CLI',
            'Dismiss'
        );

        if (selection === 'Download Latest CLI') {
            await vscode.commands.executeCommand('fcs.installCli');
        }
    } else {
        // CLI is available and compatible — check for upgrade
        const currentVersion = cliStatus.version!;
        const lastVersion = cliManager.getLastKnownVersion();

        if (lastVersion && semver.gt(currentVersion, lastVersion)) {
            const migrated = await cliManager.runMigrateConfig();
            if (migrated) {
                vscode.window.showInformationMessage(
                    `FCS CLI upgraded to v${currentVersion}. Config migrated automatically. ✅ FCS Linter is ready`
                );
            } else {
                vscode.window.showInformationMessage(
                    `FCS CLI upgraded to v${currentVersion}. ✅ FCS Linter is ready`
                );
            }
        } else {
            vscode.window.showInformationMessage('✅ FCS Linter is ready');
        }

        await cliManager.setLastKnownVersion(currentVersion);
    }
}

function handleConfigurationChange(): void {
    console.log('FCS Linter configuration changed');

    // Validate new configuration
    const configErrors = ConfigurationManager.validateConfig();
    if (configErrors.length > 0) {
        vscode.window.showWarningMessage(
            `FCS configuration issues: ${configErrors.join(', ')}`
        );
    }

    // Clear existing diagnostics if linter was disabled
    const config = ConfigurationManager.getConfig();
    if (!config.enabled) {
        linter.clearDiagnostics();
    }
}

// Export components for testing
export { linter, cliManager, credentialsManager, helpManager };
