/**
 * Standardized Error Handling Utility
 *
 * DRY principle: Single source of truth for all error handling patterns
 * Provides consistent logging, error transformation, and error reporting
 */

import * as vscode from 'vscode';
import { FcsError, CliError, ConfigurationError } from '../types';

export interface ErrorContext {
    /** Component where error occurred (e.g., 'CLI Manager', 'File Scanner') */
    component: string;
    /** Operation being performed (e.g., 'downloading CLI', 'scanning file') */
    operation: string;
    /** Additional context data */
    details?: Record<string, unknown>;
}

export interface ErrorHandlingOptions {
    /** Whether to show error message to user (default: false) */
    showToUser?: boolean;
    /** Whether to log to console (default: true) */
    logToConsole?: boolean;
    /** Log level for console (default: 'error') */
    logLevel?: 'error' | 'warn' | 'info';
    /** Whether to include stack trace in logs (default: true for errors) */
    includeStack?: boolean;
}

/**
 * Centralized error handling following DRY and KISS principles
 * Eliminates inconsistent error patterns across the codebase
 */
export class ErrorHandler {

    /**
     * Handle an error with standardized logging and user notification
     * Single method replaces all scattered console.error/warn patterns
     */
    public static handle(
        error: Error | unknown,
        context: ErrorContext,
        options: ErrorHandlingOptions = {}
    ): void {
        const {
            showToUser = false,
            logToConsole = true,
            logLevel = 'error',
            includeStack = logLevel === 'error'
        } = options;

        const standardizedError = this.standardizeError(error);
        const message = this.formatErrorMessage(standardizedError, context);

        // Console logging with consistent format
        if (logToConsole) {
            this.logToConsole(standardizedError, message, logLevel, includeStack);
        }

        // User notification for important errors
        if (showToUser) {
            this.showUserNotification(standardizedError, context);
        }
    }

    /**
     * Convert any error type to a standardized Error object
     * Handles string errors, unknown types, and preserves Error instances
     */
    public static standardizeError(error: unknown): Error {
        if (error instanceof Error) {
            return error;
        }

        if (typeof error === 'string') {
            return new Error(error);
        }

        if (error && typeof error === 'object') {
            // Axios errors serialize config.data which can contain client_secret, tokens, and API keys.
            // Extract only safe fields and discard config.data and config.headers.
            const axiosError = error as any;
            if (axiosError.isAxiosError || (axiosError.config && axiosError.response)) {
                const safeError: Record<string, any> = {
                    message: axiosError.message || 'HTTP request failed',
                    status: axiosError.response?.status,
                    statusText: axiosError.response?.statusText,
                    method: axiosError.config?.method,
                    url: axiosError.config?.url
                };
                return new Error(`HTTP Error: ${JSON.stringify(safeError)}`);
            }

            return new Error(`Error: ${JSON.stringify(error)}`);
        }

        return new Error(`Unknown error: ${String(error)}`);
    }

    /**
     * Create appropriate FCS error types based on context
     * Provides consistent error categorization across the codebase
     */
    public static createError(
        message: string,
        context: ErrorContext,
        originalError?: Error
    ): FcsError {
        switch (context.component.toLowerCase()) {
            case 'cli':
            case 'cli manager':
                return new CliError(message);

            case 'config':
            case 'configuration':
                return new ConfigurationError(message);

            default:
                return new FcsError(message, undefined, originalError);
        }
    }

    /**
     * Handle CLI-specific errors with exit codes and stderr
     * Standardizes CLI error reporting across the extension
     */
    public static handleCliError(
        error: unknown,
        exitCode?: number,
        stderr?: string,
        operation?: string
    ): CliError {
        const baseMessage = error instanceof Error ? error.message : String(error);
        const context = operation ? ` during ${operation}` : '';

        let message = `CLI Error${context}: ${baseMessage}`;

        if (exitCode !== undefined) {
            message += ` (exit code: ${exitCode})`;
        }

        if (stderr) {
            message += `\nStderr: ${stderr.trim()}`;
        }

        return new CliError(message, exitCode, stderr);
    }

    /**
     * Handle configuration errors with helpful user guidance
     * Provides consistent configuration error messaging
     */
    public static handleConfigError(
        error: unknown,
        setting?: string
    ): ConfigurationError {
        const baseMessage = error instanceof Error ? error.message : String(error);
        const settingInfo = setting ? ` for setting '${setting}'` : '';

        const message = `Configuration Error${settingInfo}: ${baseMessage}`;
        return new ConfigurationError(message);
    }

    /**
     * Log errors with async operations safely
     * Prevents unhandled promise rejections
     */
    public static handleAsync<T>(
        promise: Promise<T>,
        context: ErrorContext,
        options: ErrorHandlingOptions = {}
    ): Promise<T> {
        return promise.catch((error) => {
            this.handle(error, context, options);
            throw error; // Re-throw for caller to handle
        });
    }

    /**
     * Format error message with context information
     * Provides consistent error message structure
     */
    private static formatErrorMessage(error: Error, context: ErrorContext): string {
        const { component, operation, details } = context;

        let message = `[${component}] Error during ${operation}: ${error.message}`;

        if (details && Object.keys(details).length > 0) {
            const detailsStr = Object.entries(details)
                .map(([key, value]) => `${key}=${String(value)}`)
                .join(', ');
            message += ` (${detailsStr})`;
        }

        return message;
    }

    /**
     * Log to console with consistent formatting and levels
     * Replaces all scattered console.error/warn calls
     */
    private static logToConsole(
        error: Error,
        message: string,
        level: 'error' | 'warn' | 'info',
        includeStack: boolean
    ): void {
        const logMethod = console[level] || console.error;

        if (includeStack && error.stack) {
            logMethod(message + '\n' + error.stack);
        } else {
            logMethod(message);
        }
    }

    /**
     * Show user-friendly error notification
     * Provides consistent user error experience
     */
    private static async showUserNotification(
        error: Error,
        context: ErrorContext
    ): Promise<void> {
        let userMessage: string;
        let actions: string[] = [];

        if (error instanceof CliError) {
            userMessage = `CLI operation failed: ${error.message}`;
            actions = ['Download CLI', 'Check Settings'];
        } else if (error instanceof ConfigurationError) {
            userMessage = `Configuration issue: ${error.message}`;
            actions = ['Open Settings'];
        } else {
            userMessage = `${context.component} error: ${error.message}`;
            actions = ['OK'];
        }

        const selection = await vscode.window.showErrorMessage(userMessage, ...actions);

        // Handle user action selection
        if (selection === 'Download CLI') {
            vscode.commands.executeCommand('fcs.downloadCli');
        } else if (selection === 'Open Settings' || selection === 'Check Settings') {
            vscode.commands.executeCommand('fcs.openSettings');
        }
    }
}

export default ErrorHandler;