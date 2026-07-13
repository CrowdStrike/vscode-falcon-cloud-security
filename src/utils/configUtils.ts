/**
 * Configuration utilities for the FCS extension
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { FileTypeDetector } from './fileTypeDetector';
import { ExtensionConfig, ScanConfig, ConfigurationError } from '../types';

export class ConfigurationManager {
    private static readonly CONFIG_SECTION = 'fcs';

    /**
     * Get the current extension configuration
     */
    public static getConfig(): ExtensionConfig {
        const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);

        return {
            enabled: config.get('enabled', true),
            scanPaths: config.get('scanPaths', []),
            filePatterns: config.get('filePatterns', FileTypeDetector.getDefaultFilePatterns()),
            severity: config.get('severity', 'all'),
            scanOnSave: config.get('scanOnSave', true),
            cliVersion: config.get('cliVersion', 'latest'),
            scanTimeout: config.get('scanTimeout', 300),
            platforms: config.get('platforms', []),
            uploadResults: config.get('uploadResults', false)
        };
    }

    /**
     * Get scan configuration with workspace-aware defaults
     */
    public static getScanConfig(): ScanConfig {
        const config = this.getConfig();
        const workspaceFolders = vscode.workspace.workspaceFolders;

        let defaultScanPaths = ['.'];
        if (workspaceFolders && workspaceFolders.length > 0) {
            defaultScanPaths = [workspaceFolders[0].uri.fsPath];
        }

        return {
            scanPaths: config.scanPaths.length > 0 ? config.scanPaths : defaultScanPaths,
            filePatterns: config.filePatterns,
            severity: config.severity as 'all' | 'critical' | 'high' | 'medium' | 'informational',
            scanOnSave: config.scanOnSave,
            enabled: config.enabled,
            scanTimeout: config.scanTimeout,
            platforms: config.platforms,
            uploadResults: config.uploadResults
        };
    }

    /**
     * Update a configuration value
     */
    public static async updateConfig(key: string, value: any, target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Workspace): Promise<void> {
        const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);
        await config.update(key, value, target);
    }

    /**
     * Validate configuration and return errors if any
     */
    public static validateConfig(): string[] {
        const errors: string[] = [];
        const config = this.getConfig();

        if (!config.enabled) {
            return errors; // Skip validation if disabled
        }

        // Validate severity levels
        const validSeverities = ['all', 'critical', 'high', 'medium', 'informational'];
        if (!validSeverities.includes(config.severity)) {
            errors.push(`Invalid severity level: ${config.severity}. Valid options: ${validSeverities.join(', ')}`);
        }

        // Validate file patterns
        if (config.filePatterns.length === 0) {
            errors.push('At least one file pattern must be specified');
        }

        // Validate scan paths exist (if workspace is available)
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && config.scanPaths.length === 0) {
            // This is okay, we'll default to workspace root
        }

        return errors;
    }

    /**
     * Get workspace-relative paths for scanning
     */
    public static getAbsoluteScanPaths(): string[] {
        const config = this.getScanConfig();
        const workspaceFolders = vscode.workspace.workspaceFolders;

        if (!workspaceFolders || workspaceFolders.length === 0) {
            throw new ConfigurationError('No workspace folder available for scanning');
        }

        const workspaceRoot = workspaceFolders[0].uri.fsPath;
        const normalizedWorkspaceRoot = path.normalize(workspaceRoot);

        return config.scanPaths
            .map(scanPath => {
                const absolutePath = path.isAbsolute(scanPath)
                    ? path.normalize(scanPath)
                    : path.resolve(workspaceRoot, scanPath);

                const relativePath = path.relative(normalizedWorkspaceRoot, absolutePath);

                if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
                    console.warn(`Rejecting scan path outside workspace: ${scanPath} (resolved to ${absolutePath})`);
                    return null;
                }

                return absolutePath;
            })
            .filter((p): p is string => p !== null);
    }

    /**
     * Check if a file should be scanned based on configuration
     */
    public static shouldScanFile(filePath: string): boolean {
        const config = this.getConfig();

        if (!config.enabled) {
            return false;
        }

        // Reject excluded files
        if (FileTypeDetector.matchesPatterns(filePath, FileTypeDetector.ALWAYS_EXCLUDE_PATTERNS)) {
            return false;
        }

        // Use centralized file pattern matching
        return FileTypeDetector.matchesPatterns(filePath, config.filePatterns);
    }

    /**
     * Get file patterns as VS Code file selectors
     */
    public static getDocumentSelectors(): vscode.DocumentSelector {
        const config = this.getConfig();
        return config.filePatterns.map(pattern => {
            if (pattern.startsWith('*.')) {
                return { pattern };
            }
            return { pattern: `**/${pattern}` };
        });
    }
}

export default ConfigurationManager;