/**
 * Shared type definitions for the FCS VS Code extension
 */

import * as vscode from 'vscode';

// CLI Management Types
export interface CliStatus {
    isInstalled: boolean;
    version?: string;
    path?: string;
    isCompatible?: boolean;   // true if version >= MIN, false if below, undefined if unknown
}

export interface ApiCredentials {
    clientId: string;
    clientSecret: string;
    apiUrl: string;
    version?: string;
    proxyUrl?: string;
}

export interface ExecuteOptions {
    strictMode?: boolean;
    timeout?: number;
    cwd?: string;
}

export interface CliResult {
    success: boolean;
    stdout: string;
    stderr: string;
    exitCode: number;
}

// Scanning Types
export interface ScanConfig {
    scanPaths: string[];
    filePatterns: string[];
    severity: 'all' | 'critical' | 'high' | 'medium' | 'low' | 'informational';
    scanOnSave: boolean;
    enabled: boolean;
    scanTimeout: number;
    platforms: string[];
    uploadResults: boolean;
}

export interface ScanResult {
    file: string;
    findings: SecurityFinding[];
}

// FCS CLI Result Types (matching actual CLI output structure)
export interface FcsCliScanResult {
    fcs_version: string;
    path: string;
    scan_uuid: string;
    detection_summary: {
        total: number;
        critical: number;
        high: number;
        medium: number;
        informational: number;
    };
    rule_detections: FcsRuleDetection[];
}

export interface FcsRuleDetection {
    rule_name: string;
    rule_uuid: string;
    rule_category: string;
    description: string;
    severity: 'Critical' | 'High' | 'Medium' | 'Low' | 'Informational';
    platform: string;           // e.g., "terraform"
    cloud_provider?: string;    // e.g., "AWS"
    service?: string;           // e.g., "S3"
    detections: FcsDetection[];
}

export interface FcsDetection {
    file: string;
    line: number;
    resource_type?: string;
    resource_name?: string;
    issue_type?: string;
    reason: string;
    recommendation?: string;
}

export interface SecurityFinding {
    // Core fields that match FCS CLI output exactly
    file: string;               // File path where finding was detected
    line: number;               // Line number in file
    resource_type?: string;     // e.g., "aws_s3_bucket"
    resource_name?: string;     // e.g., "my-insecure-bucket"
    issue_type?: string;        // e.g., "IncorrectValue"
    reason: string;             // CLI uses 'reason' field for description
    recommendation?: string;    // CLI recommendation text

    // Rule information from CLI
    rule_name?: string;         // e.g., "S3 Bucket ACL Allows Read Or Write to All Users"
    rule_uuid?: string;         // Unique rule identifier
    rule_category?: string;     // e.g., "Access Control"
    platform?: string;         // e.g., "cloudformation", "ansible", "terraform"

    // Severity mapping (CLI format)
    severity: 'Critical' | 'High' | 'Medium' | 'Low' | 'Informational';

    // Legacy fields for backward compatibility
    id?: string;                // Can be derived from rule_uuid
    title?: string;             // Can be derived from rule_name
    description?: string;       // Can be derived from reason
    column?: number;            // Optional positioning
    endLine?: number;           // Optional range end
    endColumn?: number;         // Optional range end
    ruleId?: string;            // Can be derived from rule_uuid
    category?: string;          // Can be derived from rule_category
    remediation?: string;       // Can be derived from recommendation
}

// Diagnostic Types
export interface DiagnosticInfo {
    finding: SecurityFinding;
    range: vscode.Range;
    severity: vscode.DiagnosticSeverity;
    source: string;
    code?: string | number;
}

// Configuration Types
export interface ExtensionConfig {
    enabled: boolean;
    scanPaths: string[];
    filePatterns: string[];
    severity: string;
    scanOnSave: boolean;
    cliVersion: string;
    scanTimeout: number;
    platforms: string[];
    uploadResults: boolean;
}

// Command Types
export type FcsCommand =
    | 'fcs.scanFile'
    | 'fcs.scanWorkspace'
    | 'fcs.checkCliStatus'
    | 'fcs.installCli'
    | 'fcs.configure';

// Event Types
export interface FileChangeEvent {
    document: vscode.TextDocument;
    changeType: 'save' | 'change';
}

// Error Types
export class FcsError extends Error {
    constructor(
        message: string,
        public readonly code?: string,
        public readonly cause?: Error
    ) {
        super(message);
        this.name = 'FcsError';
    }
}

export class CliError extends FcsError {
    constructor(
        message: string,
        public readonly exitCode?: number,
        public readonly stderr?: string
    ) {
        super(message, 'CLI_ERROR');
        this.name = 'CliError';
    }
}

export class ConfigurationError extends FcsError {
    constructor(message: string) {
        super(message, 'CONFIG_ERROR');
        this.name = 'ConfigurationError';
    }
}