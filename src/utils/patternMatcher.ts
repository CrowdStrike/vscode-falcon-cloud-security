/**
 * Unified Pattern Matching Utility
 *
 * DRY principle: Single source of truth for all glob pattern matching logic
 * Replaces duplicate implementations in FileUtils and FileTypeDetector
 */

import * as path from 'path';

export interface MatchOptions {
    /** Whether pattern matching should be case-sensitive (default: false) */
    caseSensitive?: boolean;
    /** Whether to include directory patterns like 'node_modules/' (default: false) */
    includeDirectoryPatterns?: boolean;
}

/**
 * Unified pattern matching engine following DRY principles
 * Eliminates duplication between FileUtils.matchesPatterns() and FileTypeDetector.matchesPatterns()
 */
export class PatternMatcher {
    /**
     * Core pattern matching logic - single source of truth for all pattern matching
     *
     * Supports:
     * - Extension patterns: *.ext (e.g., *.tf, *.yaml)
     * - Exact filename: Dockerfile, package.json
     * - Directory patterns: path/to/dir/ (for exclusions, when enabled)
     *
     * @param filePath File path to match against patterns
     * @param patterns Array of patterns to match (returns false if null/undefined/empty)
     * @param options Matching options with sensible defaults
     * @returns true if filePath matches any pattern, false otherwise
     */
    public static matches(
        filePath: string,
        patterns?: string[] | null,
        options: MatchOptions = {}
    ): boolean {
        // Handle null, undefined, or empty patterns
        if (!patterns || patterns.length === 0) {
            return false;
        }

        // Handle empty file path
        if (!filePath) {
            return false;
        }

        const fileName = path.basename(filePath);
        const {
            caseSensitive = false,
            includeDirectoryPatterns = false
        } = options;

        return patterns.some(pattern => {
            // Skip empty patterns
            if (!pattern) {
                return false;
            }

            return this.matchPattern(filePath, fileName, pattern, {
                caseSensitive,
                includeDirectoryPatterns
            });
        });
    }

    /**
     * Matches a single pattern against a file path
     * Internal implementation that handles all pattern types
     */
    private static matchPattern(
        filePath: string,
        fileName: string,
        pattern: string,
        options: Required<MatchOptions>
    ): boolean {
        // Extension pattern (*.ext)
        // Both FileUtils and FileTypeDetector support this
        if (pattern.startsWith('*.')) {
            const extension = pattern.slice(2); // Extract extension after '*.'
            const fileExtension = this.getFileExtension(fileName);

            return options.caseSensitive
                ? fileExtension === extension
                : fileExtension.toLowerCase() === extension.toLowerCase();
        }

        // Directory pattern (for exclusions) - only when enabled
        // Only FileUtils supported this, FileTypeDetector did not
        if (options.includeDirectoryPatterns &&
            (pattern.endsWith('/') || pattern.endsWith('\\'))
        ) {
            const dirPattern = pattern.slice(0, -1);

            // Check for exact directory match with path separators as boundaries
            const normalizedPath = filePath.replace(/\\/g, '/');
            const normalizedPattern = dirPattern.replace(/\\/g, '/');

            // Must be followed by a path separator or be at the end
            return normalizedPath.includes('/' + normalizedPattern + '/') ||
                   normalizedPath.startsWith(normalizedPattern + '/') ||
                   normalizedPath.endsWith('/' + normalizedPattern);
        }

        // Exact filename match
        // Both supported this but with different case handling
        return options.caseSensitive
            ? fileName === pattern
            : fileName.toLowerCase() === pattern.toLowerCase();
    }

    /**
     * Extract file extension from filename (without the dot)
     * Helper method for consistent extension extraction
     */
    private static getFileExtension(fileName: string): string {
        const lastDotIndex = fileName.lastIndexOf('.');
        if (lastDotIndex === -1 || lastDotIndex === 0) {
            return ''; // No extension or hidden file
        }
        return fileName.slice(lastDotIndex + 1);
    }

    /**
     * Convenience method that matches FileUtils.matchesPatterns() behavior exactly
     * Case-insensitive, supports directory patterns
     */
    public static fileUtilsCompatible(filePath: string, patterns?: string[]): boolean {
        return this.matches(filePath, patterns, {
            caseSensitive: false,
            includeDirectoryPatterns: true
        });
    }

    /**
     * Convenience method that matches FileTypeDetector.matchesPatterns() behavior exactly
     * Case-insensitive, no directory patterns
     */
    public static fileTypeDetectorCompatible(filePath: string, patterns: string[]): boolean {
        return this.matches(filePath, patterns, {
            caseSensitive: false,
            includeDirectoryPatterns: false
        });
    }
}