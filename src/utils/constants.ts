/**
 * Centralized constants for the FCS VS Code extension.
 * This file contains all timeout values, delays, and other configuration constants
 * to follow DRY (Don't Repeat Yourself) principles.
 */

/**
 * Timeout values in milliseconds
 */
export const TIMEOUTS = {
    /** CLI version check timeout - 10 seconds */
    CLI_VERSION_CHECK: 10000,

    /** Default CLI command execution timeout - 2 minutes */
    CLI_COMMAND: 120000,

    /** HTTP API request timeout - 30 seconds */
    API_REQUEST: 30000,

    /** File download timeout - 5 minutes */
    DOWNLOAD: 300000,

    /** PATH resolution timeout - 5 seconds */
    PATH_RESOLUTION: 5000,

    /** Credential management API timeout - 10 seconds */
    CREDENTIALS_API: 10000
} as const;

/**
 * Delay values in milliseconds
 */
export const DELAYS = {
    /** Debounce delay for file scanning - 2 seconds */
    SCAN_DEBOUNCE: 2000
} as const;

/**
 * Size limits in bytes
 */
export const LIMITS = {
    /** Maximum CLI output size - 10MB */
    MAX_CLI_OUTPUT: 10 * 1024 * 1024,

    /** Maximum CLI download size - 100MB */
    MAX_DOWNLOAD_SIZE: 100 * 1024 * 1024
} as const;

/**
 * File permissions
 */
export const PERMISSIONS = {
    /** Executable file permission */
    EXECUTABLE: 0o755
} as const;

/**
 * CLI version requirements
 */
export const CLI_VERSION = {
    /** Minimum FCS CLI version required by this extension */
    MINIMUM: '3.0.0',

    /** Maximum FCS CLI version validated to work with this extension */
    MAXIMUM: '4.1.2'
} as const;