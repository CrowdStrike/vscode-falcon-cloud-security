/**
 * CLI manager with PATH-first approach
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { spawn } from 'child_process';
import * as semver from 'semver';
import axios from 'axios';
import * as tar from 'tar';
import { ErrorHandler } from '../utils/errorHandler';
import { TIMEOUTS, LIMITS, CLI_VERSION } from '../utils/constants';
import {
    CliStatus,
    ApiCredentials,
    ExecuteOptions,
    CliResult,
    SecurityFinding,
    CliError,
    FcsCliScanResult} from '../types';

// API Response interfaces for type safety
interface CrowdStrikeAuthResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
}

interface CrowdStrikeFcsFileInfo {
    file_name: string;
    version: string;
    platform: string;
    hash?: string;
    os?: string;
    category?: string;
}

interface CrowdStrikeFcsEnumerateResponse {
    resources: CrowdStrikeFcsFileInfo[];
}

interface CrowdStrikeDownloadUrlResponse {
    resources: {
        download_url: string;
        expires_at?: string;
        file_hash?: string;
    };
}

interface CliDownloadInfo {
    url: string;
    hash: string;
}

export class FcsCliManager {
    private static readonly CLI_COMMAND = 'fcs';
    // 0: no findings, 1-2: warnings, 10: informational findings, 20: medium findings,
    // 30: high findings, 40: critical findings — all indicate a completed scan
    private static readonly VALID_SCAN_EXIT_CODES = [0, 1, 2, 10, 20, 30, 40];
    private static readonly LAST_KNOWN_VERSION_KEY = 'fcs.lastKnownCliVersion';

    private sessionProxyUrl: string | null = null;
    private aboveMaxWarnedThisSession: boolean = false;

    constructor(private context: vscode.ExtensionContext) {}

    private getValidatedProxyConfig(): string | null {
        return this.sessionProxyUrl;
    }

    private getAxiosConfigWithProxy(baseConfig: object = {}): object {
        const proxyUrl = this.getValidatedProxyConfig();

        if (!proxyUrl) {
            return baseConfig;
        }

        try {
            const url = new URL(proxyUrl);
            return {
                ...baseConfig,
                proxy: {
                    protocol: url.protocol.replace(':', ''),
                    host: url.hostname,
                    port: url.port ? parseInt(url.port, 10) : (url.protocol === 'https:' ? 443 : 80),
                    ...(url.username ? { auth: { username: url.username, password: url.password || '' } } : {})
                }
            };
        } catch {
            return baseConfig;
        }
    }

    private validateProxyInput(proxyUrl?: string): string | null {
        if (!proxyUrl || !proxyUrl.trim()) {
            return null;
        }
        const trimmed = proxyUrl.trim();
        try {
            const url = new URL(trimmed);
            if (url.protocol !== 'http:' && url.protocol !== 'https:') {
                void vscode.window.showWarningMessage(
                    `Invalid proxy URL scheme: ${url.protocol}. Only http:// and https:// are supported.`
                );
                return null;
            }
            const hostname = url.hostname.toLowerCase()
                .replace(/^\[|\]$/g, '')
                .replace(/\.$/, '');
            if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' ||
                hostname.startsWith('127.') || hostname === '0.0.0.0') {
                void vscode.window.showWarningMessage(
                    'Localhost/loopback proxy addresses are not allowed.'
                );
                return null;
            }
            return trimmed;
        } catch {
            void vscode.window.showWarningMessage(
                `Invalid proxy URL: ${trimmed}. Expected format: http://proxy.example.com:8080`
            );
            return null;
        }
    }

    private static redactCredentials(text: string): string {
        return text.replace(/([a-z][a-z0-9+\-.]*:\/\/)[^:@/\s]+:[^@/\s]+@/gi, '$1<redacted>@');
    }

    public getLastKnownVersion(): string | undefined {
        return this.context.globalState.get<string>(FcsCliManager.LAST_KNOWN_VERSION_KEY);
    }

    public async setLastKnownVersion(version: string): Promise<void> {
        await this.context.globalState.update(FcsCliManager.LAST_KNOWN_VERSION_KEY, version);
    }

    private isWorkspacePath(filePath: string): boolean {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return false;
        }
        const normalizedPath = path.normalize(filePath);
        return workspaceFolders.some(folder => {
            const workspaceRoot = path.normalize(folder.uri.fsPath);
            const withSep = workspaceRoot.endsWith(path.sep) ? workspaceRoot : workspaceRoot + path.sep;
            return normalizedPath === workspaceRoot || normalizedPath.startsWith(withSep);
        });
    }

    private validateDownloadUrl(downloadUrl: string, trustedApiUrl: string): void {
        let dlUrl: URL;
        let apiUrl: URL;
        try {
            dlUrl = new URL(downloadUrl);
            apiUrl = new URL(trustedApiUrl);
        } catch {
            throw new Error(
                `Download URL validation failed: one or more URLs are malformed. ` +
                `Download URL: ${downloadUrl}. ` +
                `API URL: ${trustedApiUrl}. ` +
                `Please verify both URLs are valid and try again.`
            );
        }

        if (dlUrl.protocol !== 'https:') {
            throw new Error(`Download URL must use HTTPS, got: ${dlUrl.protocol}`);
        }

        // The Falcon API returns S3 pre-signed URLs for binary downloads
        const trustedDownloadDomains = ['amazonaws.com'];
        const apiRootDomain = apiUrl.hostname.split('.').slice(-2).join('.');
        const hostname = dlUrl.hostname.toLowerCase();
        const isTrusted =
            hostname === apiRootDomain ||
            hostname.endsWith('.' + apiRootDomain) ||
            trustedDownloadDomains.some(d => hostname === d || hostname.endsWith('.' + d));

        if (!isTrusted) {
            throw new Error(
                `Download host "${hostname}" does not belong to a trusted domain. ` +
                `This could indicate a security issue.`
            );
        }
    }

    private calculateFileHash(filePath: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const hash = crypto.createHash('sha256');
            const stream = fs.createReadStream(filePath);
            stream.on('data', (data) => hash.update(data));
            stream.on('end', () => resolve(hash.digest('hex')));
            stream.on('error', reject);
        });
    }

    private async verifyFileHash(filePath: string, expectedHash: string): Promise<void> {
        const actualHash = await this.calculateFileHash(filePath);
        if (actualHash.toLowerCase() !== expectedHash.toLowerCase()) {
            throw new Error(
                `File integrity check failed. Downloaded binary does not match the hash provided by ` +
                `the CrowdStrike API. Expected: ${expectedHash}, got: ${actualHash}. ` +
                `The download may be corrupted or tampered with.`
            );
        }
        console.log(`Integrity check passed for ${path.basename(filePath)}`);
    }

    /**
     * Secure CLI execution helper to prevent command injection
     */
    private async executeCli(cliPath: string, args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
        return new Promise((resolve, reject) => {
            const child = spawn(cliPath, args, {
                timeout: TIMEOUTS.CLI_VERSION_CHECK
            });

            let stdout = '';
            let stderr = '';

            child.stdout?.on('data', (data) => {
                stdout += data.toString();
            });

            child.stderr?.on('data', (data) => {
                stderr += data.toString();
            });

            child.on('close', (exitCode) => {
                resolve({ stdout, stderr, exitCode: exitCode || 0 });
            });

            child.on('error', (error) => {
                const message = error.message || 'unknown error';
                let guidance = '';
                if (message.includes('ENOENT')) {
                    guidance = ' The CLI binary was not found. Verify it is installed and in your PATH.';
                } else if (message.includes('EACCES')) {
                    guidance = ' The CLI binary exists but is not executable. Check file permissions.';
                } else if (message.includes('ENOEXEC')) {
                    guidance = ' The CLI binary is not executable or not the correct architecture for your system.';
                }
                reject(new Error(
                    `Failed to execute FCS CLI: ${message}.${guidance} ` +
                    `Try reinstalling or use "FCS: Download CLI" to download the latest version.`
                ));
            });
        });
    }

    /**
     * Check CLI status - first in PATH, then downloaded version
     */
    public async checkCliStatus(): Promise<CliStatus> {
        // In untrusted workspaces, skip PATH-discovered binaries entirely
        if (!vscode.workspace.isTrusted) {
            return this.checkDownloadedCli();
        }

        const downloadedStatus = await this.checkDownloadedCli();

        // If a downloaded CLI exists, prefer it — the user explicitly downloaded it via the plugin
        if (downloadedStatus.isInstalled) {
            return downloadedStatus;
        }

        // Resolve absolute path before executing to prevent workspace PATH shadowing
        const resolvedPath = await this.resolveCliPath(FcsCliManager.CLI_COMMAND);

        if (resolvedPath && !this.isWorkspacePath(resolvedPath)) {
            try {
                const result = await this.executeCli(resolvedPath, ['version']);
                const version = this.parseVersionOutput(result.stdout);
                return { isInstalled: true, version, path: resolvedPath, isCompatible: this.isVersionCompatible(version) };
            } catch {
                // fall through to downloaded CLI
            }
        } else if (resolvedPath) {
            console.warn(`CLI found at ${resolvedPath} but rejected — path is inside the workspace directory`);
        }

        return downloadedStatus;
    }

    /**
     * Check downloaded CLI status
     */
    private async checkDownloadedCli(): Promise<CliStatus> {
        const downloadedPath = this.getDownloadedCliPath();

        if (!(await this.pathExists(downloadedPath))) {
            return {
                isInstalled: false,
                path: downloadedPath
            };
        }

        try {
            const result = await this.executeCli(downloadedPath, ['version']);
            const version = this.parseVersionOutput(result.stdout);

            return {
                isInstalled: true,
                version,
                path: downloadedPath,
                isCompatible: this.isVersionCompatible(version)
            };
        } catch (error) {
            return {
                isInstalled: false,
                path: downloadedPath
            };
        }
    }

    /**
     * Execute CLI command using the best available CLI
     */
    public async executeCommand(
        args: string[],
        options: ExecuteOptions = {}
    ): Promise<CliResult> {
        const cliPath = await this.getAvailableCliPath();

        if (!cliPath) {
            throw new CliError('FCS CLI not found. Please install it or use the download option.');
        }

        return this.runCliCommand(cliPath, args, options);
    }

    /**
     * Download CLI using provided API credentials
     */
    public async downloadCli(credentials: ApiCredentials): Promise<void> {
        this.sessionProxyUrl = this.validateProxyInput(credentials.proxyUrl);
        try {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Downloading FCS CLI",
            cancellable: false
        }, async (progress) => {
            progress.report({ increment: 0, message: "Authenticating..." });

            // Authenticate with CrowdStrike API
            const token = await this.authenticate(credentials);

            progress.report({ increment: 25, message: "Getting download URL..." });

            // Get download URL and hash for this platform
            const platform = this.getPlatformInfo();
            const downloadInfo = await this.getDownloadUrl(token, platform, credentials.apiUrl, credentials.version);

            progress.report({ increment: 50, message: "Downloading CLI..." });

            // Download, verify integrity, and extract
            await this.downloadAndExtractCli(downloadInfo);

            progress.report({ increment: 90, message: "Verifying CLI installation..." });

            // Verify the downloaded binary directly to confirm extraction succeeded.
            const downloadedStatus = await this.checkDownloadedCli();
            console.log(`   Downloaded CLI status: installed=${downloadedStatus.isInstalled}, version=${downloadedStatus.version || 'N/A'}`);

            if (!downloadedStatus.isInstalled) {
                throw new Error(
                    `CLI download completed but the binary was not found after extraction. ` +
                    `Check VS Code's Output panel (View → Output) for detailed extraction logs. ` +
                    `This may indicate a corrupted download, insufficient disk space, or permission issues. ` +
                    `Try downloading again, or contact support if the issue persists.`
                );
            }

            // Migrate legacy config if upgrading from v2 (fcs_profiles.json → fcs.json).
            // Skipped automatically when fcs_profiles.json doesn't exist — fresh downloads
            // already produce a correct fcs.json so no migration is needed.
            const migrated = await this.runMigrateConfig();
            if (migrated) {
                console.log('fcs migrate-config completed successfully');
            }

            // Store the new version for upgrade detection on next startup
            await this.setLastKnownVersion(downloadedStatus.version!);

            progress.report({ increment: 100, message: "CLI downloaded successfully!" });

            // Show completion message
            const actions = ['Show CLI Location', 'OK'];
            const selection = await vscode.window.showInformationMessage(
                `✅ FCS CLI v${downloadedStatus.version} downloaded successfully!`,
                ...actions
            );

            if (selection === 'Show CLI Location') {
                await this.showCliLocation();
            }
        });
        } finally {
            this.sessionProxyUrl = null;
        }
    }

    /**
     * Show information about CLI installation location
     */
    public async showCliLocation(): Promise<void> {
        const status = await this.checkCliStatus();

        if (!status.isInstalled || !status.path) {
            vscode.window.showInformationMessage('FCS CLI is not installed.');
            return;
        }

        // Check if this is a fallback message rather than an actual path
        const isFallbackMessage = status.path.includes('system PATH') || status.path.includes('path resolution failed');

        const message = isFallbackMessage
            ? `FCS CLI v${status.version} is available in your system PATH`
            : `FCS CLI v${status.version} is installed at: ${status.path}`;

        const actions: string[] = [];

        // Only show file actions for actual file paths (not fallback messages)
        if (!isFallbackMessage) {
            actions.push('Reveal in File Explorer', 'Copy Path to Clipboard');
        }

        if (actions.length > 0) {
            const selection = await vscode.window.showInformationMessage(message, ...actions);

            switch (selection) {
                case 'Reveal in File Explorer':
                    await this.revealCliInExplorer(status.path);
                    break;
                case 'Copy Path to Clipboard':
                    await vscode.env.clipboard.writeText(status.path);
                    vscode.window.showInformationMessage('CLI path copied to clipboard');
                    break;
            }
        } else {
            vscode.window.showInformationMessage(message);
        }
    }

    /**
     * Reveal CLI location in file explorer
     */
    private async revealCliInExplorer(cliPath: string): Promise<void> {
        try {
            const uri = vscode.Uri.file(cliPath);
            await vscode.commands.executeCommand('revealFileInOS', uri);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to reveal CLI in explorer: ${error}`);
        }
    }
    public async showCliStatus(): Promise<void> {
        const status = await this.checkCliStatus();

        let compatNote = '';
        if (status.isCompatible === false) {
            if (status.version && semver.gt(status.version, CLI_VERSION.MAXIMUM)) {
                compatNote = ` ⚠️ Version ${status.version} compatibility with this extension has not been validated. Consider updating the extension.`;
            } else {
                compatNote = ` ⚠️ Version ${status.version} is below the minimum required version (${CLI_VERSION.MINIMUM}).`;
            }
        } else if (status.version && semver.eq(status.version, CLI_VERSION.MAXIMUM)) {
            compatNote = ` ✅ Latest compatible version`;
        } else if (status.version && semver.lt(status.version, CLI_VERSION.MAXIMUM)) {
            compatNote = ` (latest compatible: v${CLI_VERSION.MAXIMUM})`;
        }

        const statusMessage = status.isInstalled
            ? `FCS CLI v${status.version} found at: ${status.path}${compatNote}`
            : 'FCS CLI not found';

        const actions: string[] = [];

        if (!status.isInstalled) {
            actions.push('Download CLI');
        } else if (status.isCompatible === false) {
            actions.push('Download Latest CLI');
        }

        if (actions.length > 0) {
            const selection = await vscode.window.showInformationMessage(
                statusMessage,
                ...actions
            );

            if (selection === 'Download CLI' || selection === 'Download Latest CLI') {
                await this.promptForDownload();
            }
        } else {
            vscode.window.showInformationMessage(statusMessage);
        }
    }

    /**
     * Run fcs migrate-config only when the legacy fcs_profiles.json exists.
     * Safe to call speculatively — returns false without running if no legacy file is found.
     * Never runs when fcs.json already exists without a legacy file, which would wipe credentials.
     */
    public async runMigrateConfig(): Promise<boolean> {
        const legacyProfilesPath = path.join(os.homedir(), '.crowdstrike', 'fcs_profiles.json');
        if (!(await this.pathExists(legacyProfilesPath))) {
            console.log('fcs migrate-config skipped: no legacy fcs_profiles.json found');
            return false;
        }
        try {
            const result = await this.executeCommand(['migrate-config'], { strictMode: false });
            return result.exitCode === 0;
        } catch (error) {
            console.warn('fcs migrate-config execution failed:', error);
            return false;
        }
    }

    /**
     * Scan files with the CLI
     */
    public async scanFiles(filePaths: string[]): Promise<SecurityFinding[]> {
        const cliPath = await this.getAvailableCliPath();

        if (!cliPath) {
            throw new CliError('FCS CLI not available. Please install or download the CLI first.');
        }

        // Check version compatibility before attempting scan
        const cliStatus = await this.checkCliStatus();
        if (cliStatus.isInstalled && cliStatus.isCompatible === false) {
            const isAboveMax = cliStatus.version && semver.gt(cliStatus.version, CLI_VERSION.MAXIMUM);
            if (isAboveMax) {
                if (!this.aboveMaxWarnedThisSession) {
                    this.aboveMaxWarnedThisSession = true;
                    vscode.window.showWarningMessage(
                        `FCS CLI v${cliStatus.version} compatibility with this extension has not been validated. Consider updating the extension.`
                    );
                }
                // continue — allow scan to proceed
            } else {
                throw new CliError(
                    `FCS CLI v${cliStatus.version} is below the minimum required version (${CLI_VERSION.MINIMUM}). ` +
                    `Run "FCS: Download CLI" to install the latest version, or upgrade your system installation.`
                );
            }
        }

        // Create secure temporary directory for results
        const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'fcs-scan-'));

        try {
            // Build CLI arguments - pass directories for workspace scanning, files for individual scans
            const args = [
                'scan', 'iac',
                '--report-formats', 'json',
                '--output-path', tempDir,
                '--policy-rule', 'local'
            ];

            // Add each path as a separate argument (CLI expects multiple --path arguments or directories)
            filePaths.forEach(filePath => {
                args.push('--path', filePath);
            });

            const config = vscode.workspace.getConfiguration('fcs');
            const scanTimeout = config.get('scanTimeout', 300) as number;
            args.push('--timeout', String(scanTimeout));

            const platforms = config.get('platforms', []) as string[];
            if (platforms.length > 0) {
                args.push('--platforms', platforms.join(','));
            }

            // Only pass --upload if explicitly enabled in extension settings.
            // Never inherit upload_results from fcs.json — the extension controls this explicitly
            // to prevent unintended API calls from user's existing CLI configuration.
            const uploadResults = config.get('uploadResults', false) as boolean;
            if (uploadResults) {
                args.push('--upload');
            }

            const result = await this.runCliCommand(cliPath, args, {
                strictMode: false
            });

            // CLI exited cleanly but wrote no report — no IaC content found in the target
            const jsonFile = await this.findJsonReport(tempDir);
            if (!jsonFile) {
                if (result.exitCode === 0) {
                    return [];
                }
                throw new CliError(
                    `Scan failed with exit code ${result.exitCode}. ` +
                    `No scan report was generated. This may indicate: (1) CLI error — check the details below, ` +
                    `(2) invalid target path, (3) permission denied, or (4) unsupported file types. ` +
                    `Check "FCS: Show Help" for supported file types and troubleshooting.`,
                    result.exitCode,
                    result.stderr
                );
            }

            return await this.parseSecurityFindings(jsonFile);

        } finally {
            // Cleanup temp directory
            try {
                await fs.promises.rm(tempDir, { recursive: true, force: true });
            } catch (error) {
                console.warn('Failed to cleanup temp directory:', error);
            }
        }
    }

    // Private helper methods

    /**
     * Resolve the actual file path of a CLI command in system PATH
     */
    private async resolveCliPath(command: string): Promise<string | null> {
        return new Promise((resolve) => {
            const platform = os.platform();
            const whichCommand = platform === 'win32' ? 'where' : 'which';

            const child = spawn(whichCommand, [command], {
                timeout: TIMEOUTS.PATH_RESOLUTION,
                shell: platform === 'win32' // Windows needs shell for 'where'
            });

            let stdout = '';

            child.stdout?.on('data', (data) => {
                stdout += data.toString();
            });

            child.on('close', (exitCode) => {
                if (exitCode === 0 && stdout.trim()) {
                    // Return first path found (which/where can return multiple paths)
                    const firstPath = stdout.trim().split(/\r?\n/)[0].trim();
                    resolve(firstPath || null);
                } else {
                    resolve(null);
                }
            });

            child.on('error', () => {
                resolve(null);
            });
        });
    }

    private async getAvailableCliPath(): Promise<string | null> {
        // In untrusted workspaces, only use the downloaded CLI
        if (!vscode.workspace.isTrusted) {
            const downloadedPath = this.getDownloadedCliPath();
            return await this.pathExists(downloadedPath) ? downloadedPath : null;
        }

        const downloadedPath = this.getDownloadedCliPath();

        // If a downloaded CLI exists, prefer it — the user explicitly downloaded it via the plugin
        if (await this.pathExists(downloadedPath)) {
            return downloadedPath;
        }

        // Resolve absolute path before executing to prevent workspace PATH shadowing
        const resolvedPath = await this.resolveCliPath(FcsCliManager.CLI_COMMAND);

        if (resolvedPath && !this.isWorkspacePath(resolvedPath)) {
            try {
                await this.executeCli(resolvedPath, ['version']);
                return resolvedPath;
            } catch {
                // fall through
            }
        } else if (resolvedPath) {
            console.warn(`CLI found at ${resolvedPath} but rejected — path is inside the workspace directory`);
        }

        return null;
    }

    private getDownloadedCliPath(): string {
        // Use VS Code's global storage if available, otherwise fail securely
        if (!this.context.globalStorageUri) {
            throw new Error(
                'VS Code global storage not available. Cannot determine secure CLI storage location. ' +
                'Please install FCS CLI manually and add it to your system PATH.'
            );
        }

        const cliDir = path.join(this.context.globalStorageUri.fsPath, 'fcs-cli');
        const executable = os.platform() === 'win32' ? 'fcs.exe' : 'fcs';
        return path.join(cliDir, executable);
    }

    private async pathExists(filePath: string): Promise<boolean> {
        try {
            await fs.promises.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    private async runCliCommand(
        cliPath: string,
        args: string[],
        options: ExecuteOptions
    ): Promise<CliResult> {
        return new Promise((resolve, reject) => {
            const child = spawn(cliPath, args, {
                cwd: options.cwd,
                timeout: options.timeout || TIMEOUTS.CLI_COMMAND,
                env: process.env
            });

            let stdout = '';
            let stderr = '';
            const maxOutputSize = LIMITS.MAX_CLI_OUTPUT;

            child.stdout?.on('data', (data) => {
                const chunk = data.toString();
                if (stdout.length + chunk.length > maxOutputSize) {
                    child.kill('SIGTERM');
                    reject(new CliError(
                        `Scan output exceeded 10MB limit. This usually means the scan found too many issues ` +
                        `or the target files are very large. Try scanning a smaller scope or specific directories.`
                    ));
                    return;
                }
                stdout += chunk;
            });

            child.stderr?.on('data', (data) => {
                const chunk = data.toString();
                if (stderr.length + chunk.length > maxOutputSize) {
                    child.kill('SIGTERM');
                    reject(new CliError(
                        `CLI error output exceeded 10MB limit. The scan may have encountered a serious issue. ` +
                        `Check the VS Code Output panel for details, or use "FCS: Check CLI Status" to verify CLI installation.`
                    ));
                    return;
                }
                stderr += chunk;
            });

            child.on('close', (exitCode) => {
                // FCS CLI exit codes:
                // 0: Clean scan, no findings
                // 1-2: Scan completed with warnings
                // 40: Successful scan WITH findings (this is normal!)
                // 201-207: Genuine CLI errors
                // null: Process was killed or crashed
                const actualExitCode = exitCode ?? -1;
                const isValidScanResult = FcsCliManager.VALID_SCAN_EXIT_CODES.includes(actualExitCode);
                const isKilledOrCrashed = actualExitCode === -1;
                const sanitizedStderr = FcsCliManager.redactCredentials(stderr);

                const result: CliResult = {
                    success: isValidScanResult || (!options.strictMode && !isKilledOrCrashed),
                    stdout,
                    stderr: sanitizedStderr,
                    exitCode: actualExitCode
                };

                if (options.strictMode && !isValidScanResult && !isKilledOrCrashed) {
                    reject(new CliError(
                        `CLI command failed with exit code ${actualExitCode}`,
                        actualExitCode,
                        sanitizedStderr
                    ));
                } else if (isKilledOrCrashed) {
                    reject(new CliError(
                        `FCS CLI process terminated unexpectedly. This may indicate insufficient system resources (memory/disk), ` +
                        `a corrupted CLI installation, or an incompatible system environment. ` +
                        `Try: (1) Increase system resources, (2) Use "FCS: Download CLI" to reinstall, ` +
                        `or (3) Check "FCS: Show Help" for troubleshooting.`,
                        actualExitCode,
                        sanitizedStderr || 'Process terminated unexpectedly'
                    ));
                } else {
                    resolve(result);
                }
            });

            child.on('error', (error) => {
                const message = error.message || 'unknown error';
                let guidance = '';
                if (message.includes('ENOENT')) {
                    guidance = ' The CLI binary was not found at the expected location. ';
                } else if (message.includes('EACCES')) {
                    guidance = ' Permission denied: check file permissions on the CLI binary. ';
                } else if (message.includes('ENOEXEC')) {
                    guidance = ' The binary may be corrupted or the wrong architecture. ';
                }
                reject(new CliError(
                    `Failed to execute FCS CLI: ${message}.${guidance}` +
                    `Try using "FCS: Check CLI Status" to diagnose, or "FCS: Download CLI" to reinstall.`
                ));
            });

            // Handle timeout
            if (options.timeout) {
                setTimeout(() => {
                    if (!child.killed) {
                        child.kill('SIGTERM');
                        reject(new CliError(`CLI command timed out after ${options.timeout}ms`));
                    }
                }, options.timeout);
            }
        });
    }

    private parseVersionOutput(output: string): string {
        // Extract version from typical CLI version output
        const versionMatch = output.match(/version[:\s]+([0-9]+\.[0-9]+\.[0-9]+)/i);
        return versionMatch ? versionMatch[1] : 'unknown';
    }

    private isVersionCompatible(version: string): boolean {
        if (version === 'unknown') return false;
        return semver.gte(version, CLI_VERSION.MINIMUM) && semver.lte(version, CLI_VERSION.MAXIMUM);
    }

    private getPlatformInfo(): { os: string; arch: string } {
        const platform = os.platform();
        const arch = os.arch();

        // Map Node.js platform names to CLI platform names
        const platformMap: Record<string, string> = {
            'win32': 'windows',
            'darwin': 'darwin',
            'linux': 'linux'
        };

        const archMap: Record<string, string> = {
            'x64': 'amd64',
            'arm64': 'arm64'
        };

        return {
            os: platformMap[platform] || platform,
            arch: archMap[arch] || arch
        };
    }

    private async authenticate(credentials: ApiCredentials): Promise<string> {
        // Create a copy to avoid mutating the original credentials object
        const credentialsCopy = {
            clientId: credentials.clientId,
            clientSecret: credentials.clientSecret,
            apiUrl: credentials.apiUrl
        };

        // Validate credential format before making API request
        if (!credentialsCopy.clientId || !credentialsCopy.clientSecret || !credentialsCopy.apiUrl) {
            throw new Error('Missing required credentials: client_id, client_secret, and api_url are all required');
        }

        if (credentialsCopy.clientId.length < 10) {
            throw new Error('Client ID appears to be too short. Please verify your CrowdStrike API credentials.');
        }

        if (credentialsCopy.clientSecret.length < 20) {
            throw new Error('Client Secret appears to be too short. Please verify your CrowdStrike API credentials.');
        }

        // Properly URL encode credentials to handle special characters
        const encodedClientId = encodeURIComponent(credentialsCopy.clientId);
        const encodedClientSecret = encodeURIComponent(credentialsCopy.clientSecret);

        // Use exact format from CrowdStrike documentation
        const requestBody = `client_id=${encodedClientId}&client_secret=${encodedClientSecret}`;

        try {
            const response = await axios.post(
                `${credentialsCopy.apiUrl}/oauth2/token`,
                requestBody,
                this.getAxiosConfigWithProxy({
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Accept': 'application/json'
                    },
                    timeout: TIMEOUTS.API_REQUEST
                })
            );

            // Validate response structure
            const authResponse = response.data as CrowdStrikeAuthResponse;
            if (!authResponse.access_token) {
                throw new Error('Invalid authentication response - missing access token');
            }

            return authResponse.access_token;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                const status = error.response?.status;
                const statusText = error.response?.statusText || '';

                if (status === 401) {
                    throw new Error('Invalid credentials. Please check your Client ID and Client Secret are correct and not expired.');
                } else if (status === 403) {
                    throw new Error(`Access denied (403). Please verify your API key permissions in the CrowdStrike console.`);
                } else if (status === 404) {
                    throw new Error(`API endpoint not found (404). Please verify the API URL: ${credentialsCopy.apiUrl}`);
                } else if (status === 429) {
                    throw new Error('Rate limit exceeded (429). Please wait a few minutes before trying again.');
                } else {
                    throw new Error(`Authentication failed (${status}): ${statusText}`);
                }
            }
            throw new Error('Authentication failed due to network error. Please check your internet connection and API URL.');
        } finally {
            // Clear the copy from memory (the original credentials object remains intact)
            credentialsCopy.clientSecret = '';
            credentialsCopy.clientId = '';
        }
    }

    private async getDownloadUrl(
        token: string,
        platform: { os: string; arch: string },
        apiUrl: string,
        version?: string
    ): Promise<CliDownloadInfo> {
        try {
            // Get available downloads from CrowdStrike FCS API using correct endpoint with proper filtering
            const response = await axios.get(
                `${apiUrl}/csdownloads/entities/files/enumerate/v1?arch=${platform.arch}&os=${platform.os}`,
                this.getAxiosConfigWithProxy({
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/json'
                    },
                    timeout: TIMEOUTS.API_REQUEST
                })
            );

            // Validate and type the response
            const downloadsResponse = response.data as CrowdStrikeFcsEnumerateResponse;
            if (!downloadsResponse.resources || !Array.isArray(downloadsResponse.resources)) {
                throw new Error(
                    `Failed to list available FCS CLI downloads. The CrowdStrike API returned an unexpected response format. ` +
                    `This is usually a temporary API issue. Please try again in a few moments. ` +
                    `If the problem persists, contact CrowdStrike support.`
                );
            }

            // Find FCS CLI files (should already be filtered by API, but double-check)
            const fcsFiles = downloadsResponse.resources.filter((download: CrowdStrikeFcsFileInfo) =>
                download.file_name && download.file_name.includes('fcs')
            );

            if (fcsFiles.length === 0) {
                throw new Error(`No FCS CLI download available for ${platform.os}/${platform.arch}`);
            }

            // Sort by version ascending so the latest compatible is always last
            const sortedFiles = [...fcsFiles].sort((a, b) =>
                semver.compare(semver.coerce(a.version)?.version ?? '0.0.0', semver.coerce(b.version)?.version ?? '0.0.0')
            );

            // Filter to compatible version range unless a specific version was requested
            const compatibleFiles = version
                ? sortedFiles
                : sortedFiles.filter(f => this.isVersionCompatible(semver.coerce(f.version)?.version ?? '0.0.0'));

            if (compatibleFiles.length === 0) {
                throw new Error(
                    `No compatible FCS CLI version found for ${platform.os}/${platform.arch}. ` +
                    `Compatible range: v${CLI_VERSION.MINIMUM} – v${CLI_VERSION.MAXIMUM}. ` +
                    `Update the extension to download a newer CLI version.`
                );
            }

            // Select version: use requested version if specified, otherwise take latest compatible (last item)
            const platformDownload = version
                ? (sortedFiles.find((f: CrowdStrikeFcsFileInfo) => f.version === version) ?? compatibleFiles[compatibleFiles.length - 1])
                : compatibleFiles[compatibleFiles.length - 1];

            // Get actual download URL using file name and version
            const downloadResponse = await axios.get(
                `${apiUrl}/csdownloads/entities/files/download/v1?file_name=${encodeURIComponent(platformDownload.file_name)}&file_version=${encodeURIComponent(platformDownload.version)}`,
                this.getAxiosConfigWithProxy({
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/json'
                    },
                    timeout: TIMEOUTS.API_REQUEST
                })
            );

            const urlResponse = downloadResponse.data as CrowdStrikeDownloadUrlResponse;
            // Extract download URL from the resources object (not array)
            if (!urlResponse.resources || !urlResponse.resources.download_url) {
                throw new Error('No download URLs available in CrowdStrike API response');
            }

            const downloadUrl = urlResponse.resources.download_url;
            const fileHash = urlResponse.resources.file_hash;

            if (!downloadUrl) {
                throw new Error('Invalid download URL in CrowdStrike API response');
            }

            if (!fileHash) {
                throw new Error('No file hash provided in CrowdStrike API response - cannot verify download integrity');
            }

            this.validateDownloadUrl(downloadUrl, apiUrl);

            return { url: downloadUrl, hash: fileHash };
        } catch (error) {
            if (axios.isAxiosError(error)) {
                const status = error.response?.status;
                const statusText = error.response?.statusText || '';

                if (status === 401) {
                    throw new Error('Authentication token expired. Please try downloading again.');
                } else if (status === 403) {
                    throw new Error('Access denied for FCS CLI downloads. Please verify your API credentials have the necessary permissions.');
                } else if (status === 404) {
                    throw new Error('FCS CLI downloads not found. Please verify the API URL and that FCS CLI is available in your region.');
                } else {
                    throw new Error(`Failed to get FCS CLI download URL (${status}): ${statusText}`);
                }
            }
            throw new Error(`Failed to get FCS CLI download URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Downloads CLI archive to a temporary location and verifies its integrity
     */
    private async downloadCliArchive(downloadUrl: string, expectedHash: string): Promise<string> {
        console.log(`📥 Downloading CLI archive...`);

        const response = await axios.get(downloadUrl, this.getAxiosConfigWithProxy({
            responseType: 'stream',
            timeout: TIMEOUTS.DOWNLOAD,
            maxContentLength: LIMITS.MAX_DOWNLOAD_SIZE,
            maxBodyLength: LIMITS.MAX_DOWNLOAD_SIZE
        }));

        // Create a secure temporary file for the download
        const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'fcs-download-'));
        const tempArchive = path.join(tempDir, 'fcs-cli.tar.gz');
        console.log(`   Temp archive: ${tempArchive}`);

        const writeStream = fs.createWriteStream(tempArchive);
        response.data.pipe(writeStream);

        await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
                writeStream.destroy();
                reject(new Error(`Download timeout after ${TIMEOUTS.DOWNLOAD / 1000} seconds`));
            }, TIMEOUTS.DOWNLOAD);

            writeStream.on('finish', () => {
                clearTimeout(timeout);
                resolve();
            });
            writeStream.on('error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });
        });

        console.log(`✅ Archive downloaded successfully`);
        await this.verifyFileHash(tempArchive, expectedHash);
        return tempArchive;
    }

    /**
     * Rejects archive entry paths that could escape the extraction directory.
     * Blocks absolute paths, Windows-style separators, and .. traversal segments.
     */
    private isSecureArchivePath(entryPath: string): boolean {
        if (path.isAbsolute(entryPath) || entryPath.startsWith('/') || entryPath.startsWith('\\')) {
            console.warn(`Rejected absolute archive path: ${entryPath}`);
            return false;
        }

        const segments = entryPath.split(/[/\\]/);
        if (segments.includes('..')) {
            console.warn(`Rejected archive path with traversal: ${entryPath}`);
            return false;
        }

        const normalized = path.normalize(entryPath);
        if (normalized.startsWith('..')) {
            console.warn(`Rejected archive path after normalization: ${entryPath}`);
            return false;
        }

        return true;
    }

    /**
     * Extracts CLI archive with intelligent structure analysis
     * Restores the robust logic from commit 28d0bc3 that handles various archive structures
     */
    private async extractCliArchive(tempArchive: string, cliDir: string): Promise<void> {
        console.log(`🔍 Analyzing archive structure before extraction...`);

        // Analyze archive contents to determine extraction strategy
        const archiveContents: string[] = [];
        try {
            await tar.list({
                file: tempArchive,
                onentry: (entry) => {
                    if (!this.isSecureArchivePath(entry.path)) {
                        throw new Error(`Archive contains unsafe path: ${entry.path}. Rejecting download.`);
                    }
                    console.log(`   Archive entry: ${entry.path} (${entry.size} bytes, type: ${entry.type})`);
                    archiveContents.push(entry.path);
                }
            });
            console.log(`   Total archive entries: ${archiveContents.length}`);
        } catch (listError) {
            if (listError instanceof Error && listError.message.includes('unsafe path')) {
                throw listError;
            }
            console.warn(`   Could not list archive contents:`, listError);
            // Fallback to basic extraction if listing fails
            await tar.extract({
                file: tempArchive,
                cwd: cliDir,
                strip: 1,
                filter: (entryPath) => {
                    if (!this.isSecureArchivePath(entryPath)) {
                        throw new Error(`Archive contains unsafe path: ${entryPath}. Extraction aborted.`);
                    }
                    return true;
                }
            });
            return;
        }

        // Determine optimal strip level based on archive structure
        const stripLevel = this.calculateOptimalStripLevel(archiveContents);
        console.log(`   Calculated optimal strip level: ${stripLevel}`);

        // Extract with intelligent stripping
        console.log(`📦 Extracting archive with strip level ${stripLevel}...`);
        await tar.extract({
            file: tempArchive,
            cwd: cliDir,
            strip: stripLevel,
            filter: (entryPath) => {
                if (!this.isSecureArchivePath(entryPath)) {
                    throw new Error(`Archive contains unsafe path: ${entryPath}. Extraction aborted.`);
                }
                return true;
            },
            onentry: (entry) => {
                const targetPath = stripLevel > 0
                    ? entry.path.split('/').slice(stripLevel).join('/')
                    : entry.path;
                console.log(`   Extracting: ${entry.path} -> ${targetPath}`);
            }
        });

        console.log(`✅ Archive extracted with strip level ${stripLevel}`);
    }

    /**
     * Calculates the optimal strip level for archive extraction
     * Based on empirical testing of tar.extract behavior
     */
    private calculateOptimalStripLevel(archiveContents: string[]): number {
        // Filter out directory entries and normalize paths
        const fileEntries = archiveContents
            .filter(entry => !entry.endsWith('/'))
            .map(entry => entry.replace(/^\.\//, ''))
            .filter(entry => entry.length > 0);

        if (fileEntries.length === 0) {
            return 0;
        }

        // Find CLI binary specifically
        const cliBinary = fileEntries.find(entry =>
            path.basename(entry) === 'fcs' || path.basename(entry) === 'fcs.exe'
        );

        if (cliBinary) {
            // Count directory levels in CLI binary path
            const pathParts = cliBinary.split('/').filter(part => part !== '');

            console.log(`   CLI binary path: ${cliBinary}, parts: ${pathParts.length}`);

            if (pathParts.length === 1) {
                // CLI is at root level: fcs
                // But tar still has './' so we may need strip 1 for some archives
                return this.hasRootDirectoryEntry(archiveContents) ? 1 : 0;
            } else if (pathParts.length === 2) {
                // CLI is one level deep: fcs-cli/fcs
                // Need strip 2 to get CLI at root (strip './' and 'fcs-cli/')
                return 2;
            } else {
                // CLI is deeper: fcs-cli-v1.0.0/bin/fcs
                // Need strip 2 to get bin/fcs (strip './' and 'fcs-cli-v1.0.0/')
                return 2;
            }
        }

        // Fallback: analyze common prefix
        return 1; // Safe default
    }

    /**
     * Checks if archive has root directory entries that need stripping
     */
    private hasRootDirectoryEntry(archiveContents: string[]): boolean {
        return archiveContents.some(entry => entry === './' || entry === '.');
    }

    /**
     * Finds common directory prefix across file entries
     */
    private findCommonDirectoryPrefix(fileEntries: string[]): string | null {
        if (fileEntries.length === 0) return null;

        // Find the shortest path to start with
        let commonPrefix = fileEntries[0];

        for (const entry of fileEntries) {
            // Find common prefix between current common and this entry
            const minLength = Math.min(commonPrefix.length, entry.length);
            let i = 0;

            while (i < minLength && commonPrefix[i] === entry[i]) {
                i++;
            }

            commonPrefix = commonPrefix.substring(0, i);
        }

        // Ensure we end at a directory boundary
        const lastSlash = commonPrefix.lastIndexOf('/');
        return lastSlash > 0 ? commonPrefix.substring(0, lastSlash + 1) : null;
    }

    /**
     * Ensures CLI binary is at the expected location with robust error recovery
     * Uses copyFile instead of rename for cross-filesystem compatibility
     */
    private async ensureCliAtExpectedLocation(cliDir: string, expectedCliPath: string): Promise<void> {
        console.log(`🔍 Verifying CLI binary at expected path: ${expectedCliPath}`);

        // If CLI is already at expected location, verify it works
        if (await this.pathExists(expectedCliPath)) {
            console.log(`✅ CLI binary found at expected location`);

            // Make sure it's executable on Unix systems
            if (process.platform !== 'win32') {
                await fs.promises.chmod(expectedCliPath, 0o755);
            }
            return;
        }

        console.log(`🔍 CLI not at expected location, searching extraction directory...`);

        // Find CLI binary in extraction directory using recursive search
        const cliPath = await this.findCliBinary(cliDir);
        if (!cliPath) {
            // List directory contents to help debug extraction issues
            console.log(`📁 Contents of extraction directory ${cliDir}:`);
            try {
                const extractedFiles = await fs.promises.readdir(cliDir, { recursive: true });
                console.log(`   Extracted files (${extractedFiles.length}):`, extractedFiles);
            } catch (error) {
                console.warn(`   Could not list extraction directory:`, error);
            }

            throw ErrorHandler.createError(
                'CLI binary not found in extracted archive',
                { component: 'CLI Manager', operation: 'CLI location verification' }
            );
        }

        console.log(`🔄 Moving CLI binary from ${cliPath} to expected location...`);

        // Use copyFile instead of rename for cross-filesystem compatibility
        // This was a bug in the current implementation - rename fails when temp and target are on different filesystems
        await fs.promises.copyFile(cliPath, expectedCliPath);

        // Make executable on Unix-like systems
        if (process.platform !== 'win32') {
            await fs.promises.chmod(expectedCliPath, 0o755);
            console.log(`🔧 Executable permissions set`);
        }

        // Verify the copy worked
        if (!(await this.pathExists(expectedCliPath))) {
            throw ErrorHandler.createError(
                'Failed to copy CLI binary to expected location',
                { component: 'CLI Manager', operation: 'CLI binary placement' }
            );
        }

        // Clean up original file if copy successful
        try {
            await fs.promises.unlink(cliPath);
            console.log(`🧹 Cleaned up original CLI binary at ${cliPath}`);
        } catch (cleanupError) {
            console.warn(`   Could not clean up original CLI binary:`, cleanupError);
            // Non-fatal - the copy worked which is what matters
        }

        console.log(`✅ CLI binary successfully placed at ${expectedCliPath}`);
    }

    /**
     * Simple recursive search for CLI binary
     */
    private async findCliBinary(dir: string): Promise<string | null> {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            if (entry.isFile() && (entry.name === 'fcs' || entry.name === 'fcs.exe')) {
                return fullPath;
            }

            if (entry.isDirectory()) {
                const found = await this.findCliBinary(fullPath);
                if (found) return found;
            }
        }

        return null;
    }

    private async downloadAndExtractCli(downloadInfo: CliDownloadInfo): Promise<void> {
        const cliDir = path.dirname(this.getDownloadedCliPath());
        const expectedCliPath = this.getDownloadedCliPath();

        // Ensure directory exists
        if (!(await this.pathExists(cliDir))) {
            await fs.promises.mkdir(cliDir, { recursive: true });
        }

        let tempArchive: string | undefined;

        try {
            // Download and extract in one streamlined process
            tempArchive = await this.downloadCliArchive(downloadInfo.url, downloadInfo.hash);
            await this.extractCliArchive(tempArchive, cliDir);
            await this.ensureCliAtExpectedLocation(cliDir, expectedCliPath);

        } catch (error) {
            throw new Error(`Failed to download FCS CLI: ${error}`);
        } finally {
            // Clean up temp files
            if (tempArchive) {
                const tempDir = path.dirname(tempArchive);
                try {
                    await fs.promises.rm(tempDir, { recursive: true, force: true });
                } catch (cleanupError) {
                    // Ignore cleanup errors - they're not critical
                }
            }
        }
    }

    private async findJsonReport(tempDir: string): Promise<string | null> {
        try {
            const files = await fs.promises.readdir(tempDir);
            const jsonFile = files.find(file => file.endsWith('.json'));
            return jsonFile ? path.join(tempDir, jsonFile) : null;
        } catch {
            return null;
        }
    }

    private async parseSecurityFindings(jsonFilePath: string): Promise<SecurityFinding[]> {
        try {
            const content = await fs.promises.readFile(jsonFilePath, 'utf8');
            const scanResult: FcsCliScanResult = JSON.parse(content);

            const findings: SecurityFinding[] = [];

            // FCS CLI uses rule_detections array containing detections
            if (scanResult.rule_detections) {
                for (const ruleDetection of scanResult.rule_detections) {
                    if (ruleDetection.detections) {
                        for (const detection of ruleDetection.detections) {
                            // Convert FCS CLI detection to SecurityFinding format
                            const finding: SecurityFinding = {
                                // Core fields from CLI detection
                                file: detection.file,
                                line: detection.line,
                                reason: detection.reason,
                                resource_type: detection.resource_type,
                                resource_name: detection.resource_name,
                                issue_type: detection.issue_type,
                                recommendation: detection.recommendation,
                                platform: ruleDetection.platform, // Platform from CLI detection

                                // Rule information from parent rule detection
                                rule_name: ruleDetection.rule_name,
                                rule_uuid: ruleDetection.rule_uuid,
                                rule_category: ruleDetection.rule_category,
                                severity: ruleDetection.severity,

                                // Legacy compatibility fields
                                id: ruleDetection.rule_uuid,
                                title: ruleDetection.rule_name,
                                description: detection.reason,
                                ruleId: ruleDetection.rule_uuid,
                                category: ruleDetection.rule_category,
                                remediation: detection.recommendation
                            };

                            findings.push(finding);
                        }
                    }
                }
            }

            return findings;

        } catch (error) {
            console.error('Error parsing FCS CLI scan results:', error);
            return [];
        }
    }

    private async promptForDownload(): Promise<void> {
        const selection = await vscode.window.showInformationMessage(
            'Download FCS CLI requires CrowdStrike API credentials. Do you want to proceed?',
            'Yes, configure credentials',
            'Cancel'
        );

        if (selection === 'Yes, configure credentials') {
            await vscode.commands.executeCommand('fcs.installCli');
        }
    }

}
