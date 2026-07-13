/**
 * Core linter with merged scan methods and configuration-driven scanning
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { FcsCliManager } from './cliManager';
import { DiagnosticUtils } from '../utils/diagnosticUtils';
import { ConfigurationManager } from '../utils/configUtils';
import { FileUtils } from '../utils/fileUtils';
import { DELAYS } from '../utils/constants';
import { SecurityFinding, ScanConfig, CliError } from '../types';

export class FcsLinter {
    private readonly diagnosticCollection: vscode.DiagnosticCollection;
    private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
    private activeScanPromises: Map<string, Promise<void>> = new Map();
    private readonly debounceDelay = DELAYS.SCAN_DEBOUNCE;

    constructor(private cliManager: FcsCliManager) {
        this.diagnosticCollection = DiagnosticUtils.createDiagnosticCollection();
    }

    /**
     * Main scan method - handles both single files and workspace scanning
     */
    public async scan(
        targets?: string | vscode.TextDocument | string[]
    ): Promise<void> {
        const config = ConfigurationManager.getScanConfig();

        if (!config.enabled) {
            console.log('FCS linter is disabled');
            return;
        }

        // Validate configuration
        const configErrors = ConfigurationManager.validateConfig();
        if (configErrors.length > 0) {
            vscode.window.showErrorMessage(
                `FCS configuration errors: ${configErrors.join(', ')}`
            );
            return;
        }

        try {
            // Check CLI availability
            const cliStatus = await this.cliManager.checkCliStatus();
            if (!cliStatus.isInstalled) {
                await this.promptForCliInstallation();
                return;
            }

            // Determine what to scan: directories for workspace, files for specific targets
            const scanTargets = await this.determineScanTargets(targets);

            if (scanTargets.length === 0) {
                console.log('No files to scan');
                return;
            }

            // Show progress and execute scan
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `FCS: Scan in progress...`,
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 0 });

                const findings = await this.cliManager.scanFiles(scanTargets);

                progress.report({ increment: 80 });

                // For workspace scans, we need to find all files that were actually scanned
                const scannedFiles = await this.getScannedFiles(scanTargets, config);

                // Process results
                await this.processFindings(scannedFiles, findings, config);

                progress.report({ increment: 100 });

                // Show summary
                this.showScanSummary(findings);
            });

        } catch (error) {
            console.error('FCS scan error:', error);
            const message = error instanceof CliError && error.stderr
                ? `FCS scan failed: ${error.message}\n\nCLI output:\n${error.stderr.trim()}`
                : `FCS scan failed: ${error}`;
            vscode.window.showErrorMessage(message);
        }
    }

    /**
     * Scan with debouncing for file changes and concurrency control
     */
    public debouncedScan(document: vscode.TextDocument): void {
        if (!ConfigurationManager.shouldScanFile(document.fileName)) {
            return;
        }

        const uri = document.uri.toString();

        // Clear existing timer for this document
        const existingTimer = this.debounceTimers.get(uri);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }

        // Set new timer with concurrency control
        const timer = setTimeout(async () => {
            this.debounceTimers.delete(uri);

            // Check if there's already an active scan for this document
            const existingScan = this.activeScanPromises.get(uri);
            if (existingScan) {
                console.log(`Scan already in progress for ${document.fileName}, skipping`);
                return;
            }

            // Start new scan with promise tracking
            const scanPromise = this.scan(document).finally(() => {
                this.activeScanPromises.delete(uri);
            });

            this.activeScanPromises.set(uri, scanPromise);

            // Wait for scan completion
            await scanPromise;
        }, this.debounceDelay);

        this.debounceTimers.set(uri, timer);
    }

    /**
     * Scan the current active file
     */
    public async scanCurrentFile(): Promise<void> {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            vscode.window.showWarningMessage('No active file to scan');
            return;
        }

        await this.scan(activeEditor.document);
    }

    /**
     * Scan entire workspace
     */
    public async scanWorkspace(): Promise<void> {
        await this.scan(); // No targets = scan workspace
    }

    /**
     * Clear all diagnostics
     */
    public clearDiagnostics(): void {
        DiagnosticUtils.clearAllDiagnostics(this.diagnosticCollection);
    }

    /**
     * Clear diagnostics for a specific document
     */
    public clearDocumentDiagnostics(document: vscode.TextDocument): void {
        DiagnosticUtils.clearDocumentDiagnostics(this.diagnosticCollection, document);
    }

    /**
     * Dispose of resources and clean up active operations
     */
    public dispose(): void {
        this.diagnosticCollection.dispose();

        // Clear all debounce timers
        this.debounceTimers.forEach(timer => clearTimeout(timer));
        this.debounceTimers.clear();

        // Wait for active scans to complete or cancel them
        const activeScans = Array.from(this.activeScanPromises.values());
        if (activeScans.length > 0) {
            console.log(`Waiting for ${activeScans.length} active scans to complete during disposal`);
            // Note: We can't easily cancel ongoing CLI operations, but we clean up references
        }
        this.activeScanPromises.clear();
    }

    // Private helper methods

    private async determineScanTargets(
        targets?: string | vscode.TextDocument | string[]
    ): Promise<string[]> {
        // Handle specific targets (files)
        if (targets) {
            if (typeof targets === 'string') {
                return [targets];
            } else if (targets instanceof Array) {
                return targets;
            } else {
                // TextDocument
                return [targets.fileName];
            }
        }

        // For workspace scanning, return directories instead of individual files
        try {
            return ConfigurationManager.getAbsoluteScanPaths();
        } catch (error) {
            console.error('Error determining scan targets:', error);
            // Fallback to workspace folders
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders && workspaceFolders.length > 0) {
                return [workspaceFolders[0].uri.fsPath];
            }
            return [];
        }
    }

    private async getScannedFiles(
        scanTargets: string[],
        config: ScanConfig
    ): Promise<string[]> {
        // If scan targets are individual files, return them as-is
        if (scanTargets.length > 0) {
            const firstTarget = scanTargets[0];
            if (await this.isFile(firstTarget)) {
                return scanTargets;
            }
        }

        // If scan targets are directories, find all matching files
        const allFiles: string[] = [];
        for (const target of scanTargets) {
            try {
                const files = await FileUtils.findFiles(
                    [target],
                    config.filePatterns,
                    ['.git/**', 'node_modules/**', '.vscode/**']
                );
                allFiles.push(...files);
            } catch (error) {
                console.warn(`Could not scan directory ${target}:`, error);
            }
        }

        return allFiles.filter(file => FileUtils.isInWorkspace(file));
    }

    private async isFile(path: string): Promise<boolean> {
        try {
            const stat = await fs.promises.stat(path);
            return stat.isFile();
        } catch {
            return false;
        }
    }

    private async processFindings(
        scannedFiles: string[],
        findings: SecurityFinding[],
        config: ScanConfig
    ): Promise<void> {
        // Group findings by file
        const findingsByFile = this.groupFindingsByFile(findings, scannedFiles);

        // Prepare all diagnostic updates before applying them (for atomicity)
        const diagnosticUpdates = new Map<vscode.Uri, vscode.Diagnostic[]>();

        // Process each file and prepare diagnostics
        for (const filePath of scannedFiles) {
            try {
                const uri = vscode.Uri.file(filePath);
                const fileFindings = findingsByFile.get(FileUtils.normalizePath(filePath)) || [];

                // Filter findings by severity if configured
                const filteredFindings = this.filterFindingsBySeverity(fileFindings, config.severity);

                // Open document and create diagnostics
                const document = await vscode.workspace.openTextDocument(uri);
                const diagnostics = filteredFindings.map(finding =>
                    DiagnosticUtils.createDiagnostic(document, finding)
                );

                diagnosticUpdates.set(uri, diagnostics);
            } catch (error) {
                console.warn(`Could not process findings for file ${filePath}:`, error);
                // Set empty diagnostics for files that can't be processed
                const uri = vscode.Uri.file(filePath);
                diagnosticUpdates.set(uri, []);
            }
        }

        // Apply all diagnostic updates atomically
        this.applyDiagnosticUpdatesAtomically(diagnosticUpdates);
    }

    /**
     * Apply all diagnostic updates in a single operation to maintain consistency
     */
    private applyDiagnosticUpdatesAtomically(
        diagnosticUpdates: Map<vscode.Uri, vscode.Diagnostic[]>
    ): void {
        // Convert to array format expected by VS Code API
        const updates: [vscode.Uri, vscode.Diagnostic[]][] = Array.from(diagnosticUpdates.entries());

        // Apply all updates in one atomic operation
        this.diagnosticCollection.set(updates);

        console.log(`Applied diagnostics atomically for ${updates.length} files`);
    }

    private groupFindingsByFile(
        findings: SecurityFinding[],
        scannedFiles: string[]
    ): Map<string, SecurityFinding[]> {
        const fileMap = new Map<string, SecurityFinding[]>();

        // Initialize with scanned files
        for (const filePath of scannedFiles) {
            fileMap.set(FileUtils.normalizePath(filePath), []);
        }

        // Group findings using improved matching logic
        for (const finding of findings) {
            const matchedFile = this.findMatchingFile(finding, scannedFiles);
            if (matchedFile) {
                const normalizedPath = FileUtils.normalizePath(matchedFile);
                const existingFindings = fileMap.get(normalizedPath) || [];
                existingFindings.push(finding);
                fileMap.set(normalizedPath, existingFindings);
            } else {
                console.warn(`Could not match finding to any scanned file:`, {
                    findingFile: finding.file,
                    scannedFiles: scannedFiles.slice(0, 3) // Log first 3 for debugging
                });
            }
        }

        return fileMap;
    }

    /**
     * Find the best matching file for a security finding using simplified normalized path comparison
     * KISS principle: Use single strategy with VS Code's built-in URI normalization
     */
    private findMatchingFile(finding: SecurityFinding, scannedFiles: string[]): string | null {
        if (!finding.file) {
            return null;
        }

        const findingFile = finding.file;

        // Single strategy: Comprehensive path matching with normalization
        // This replaces 4 complex strategies with one simple, robust approach
        for (const filePath of scannedFiles) {
            if (this.pathsMatch(findingFile, filePath)) {
                return filePath;
            }
        }

        return null;
    }

    /**
     * Simple path matching logic that handles all common file matching scenarios
     * KISS principle: One method that covers exact, relative, and suffix matching
     */
    private pathsMatch(findingPath: string, scannedPath: string): boolean {
        // Exact match (most reliable)
        if (scannedPath === findingPath) {
            return true;
        }

        // Normalized path match
        const normalizedFinding = FileUtils.normalizePath(findingPath);
        const normalizedScanned = FileUtils.normalizePath(scannedPath);
        if (normalizedScanned === normalizedFinding) {
            return true;
        }

        // Workspace-relative match - only if finding looks like relative path
        if (!path.isAbsolute(findingPath)) {
            const workspaceRelative = FileUtils.getWorkspaceRelativePath(scannedPath);
            if (workspaceRelative === findingPath) {
                return true;
            }

            // Only allow endsWith for longer paths to avoid false positives
            if (findingPath.includes('/') && workspaceRelative.endsWith(findingPath)) {
                return true;
            }
        }

        // Suffix match with strict validation (only for meaningful paths with directories)
        if (findingPath.length >= 5 && findingPath.includes('/') && scannedPath.endsWith(findingPath)) {
            // Ensure match is at a path boundary
            const matchIndex = scannedPath.lastIndexOf(findingPath);
            const charBefore = matchIndex > 0 ? scannedPath[matchIndex - 1] : '/';
            return charBefore === '/' || charBefore === '\\';
        }

        return false;
    }

    private filterFindingsBySeverity(
        findings: SecurityFinding[],
        severityFilter: string
    ): SecurityFinding[] {
        if (severityFilter === 'all') {
            return findings;
        }

        const severityOrder = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFORMATIONAL'];
        const minIndex = severityOrder.indexOf(severityFilter.toUpperCase());

        if (minIndex === -1) {
            return findings; // Invalid filter, return all
        }

        return findings.filter(finding => {
            const findingSeverity = finding.severity.toUpperCase();
            const findingIndex = severityOrder.indexOf(findingSeverity);
            return findingIndex !== -1 && findingIndex <= minIndex;
        });
    }

    private showScanSummary(findings: SecurityFinding[]): void {
        if (findings.length === 0) {
            vscode.window.showInformationMessage('✅ FCS scan completed - no security issues found');
            return;
        }

        // Count by severity
        const counts = findings.reduce((acc, finding) => {
            const severity = finding.severity.toLowerCase();
            acc[severity] = (acc[severity] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        const critical = counts.critical || 0;
        const high = counts.high || 0;
        const medium = counts.medium || 0;
        const low = counts.low || 0;
        const informational = counts.informational || 0;

        const message = `🔍 FCS scan found ${findings.length} security finding(s): ${critical} critical, ${high} high, ${medium} medium, ${low} low, ${informational} informational`;

        if (critical > 0 || high > 0) {
            vscode.window.showErrorMessage(message);
        } else if (medium > 0) {
            vscode.window.showWarningMessage(message);
        } else {
            vscode.window.showInformationMessage(message);
        }
    }

    private async promptForCliInstallation(): Promise<void> {
        const selection = await vscode.window.showWarningMessage(
            'FCS CLI not found. Would you like to install it?',
            'Show CLI Status',
            'Install Instructions'
        );

        switch (selection) {
            case 'Show CLI Status':
                await this.cliManager.showCliStatus();
                break;
            case 'Install Instructions':
                await vscode.commands.executeCommand('vscode.open',
                    vscode.Uri.parse('https://github.com/CrowdStrike/fcs-cli')
                );
                break;
        }
    }
}

export default FcsLinter;
