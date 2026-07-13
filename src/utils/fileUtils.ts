/**
 * File system utilities for the FCS extension
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { FileTypeDetector } from './fileTypeDetector';
import { PatternMatcher } from './patternMatcher';

const fsReaddir = promisify(fs.readdir);
const fsLstat = promisify(fs.lstat);

export class FileUtils {
    /**
     * Check if a file exists
     */
    public static async exists(filePath: string): Promise<boolean> {
        try {
            await fsLstat(filePath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Find files matching patterns in specified directories
     */
    public static async findFiles(
        scanPaths: string[],
        patterns: string[],
        exclude?: string[]
    ): Promise<string[]> {
        const foundFiles: string[] = [];

        for (const scanPath of scanPaths) {
            if (!(await this.exists(scanPath))) {
                console.warn(`Scan path does not exist: ${scanPath}`);
                continue;
            }

            const files = await this.findFilesInDirectory(scanPath, patterns, exclude);
            foundFiles.push(...files);
        }

        // Remove duplicates and sort
        return Array.from(new Set(foundFiles)).sort();
    }

    /**
     * Find files in a specific directory
     */
    private static async findFilesInDirectory(
        dirPath: string,
        patterns: string[],
        exclude?: string[]
    ): Promise<string[]> {
        const files: string[] = [];

        try {
            const stat = await fsLstat(dirPath);

            if (stat.isSymbolicLink()) {
                console.warn(`Skipping symlink during workspace scan: ${dirPath}`);
                return files;
            }

            if (stat.isFile()) {
                if (this.matchesPatterns(dirPath, patterns) && !this.matchesPatterns(dirPath, exclude)) {
                    files.push(dirPath);
                }
                return files;
            }

            if (stat.isDirectory()) {
                const entries = await fsReaddir(dirPath);

                for (const entry of entries) {
                    const fullPath = path.join(dirPath, entry);

                    // Skip hidden directories and common ignore patterns
                    if (this.shouldSkipEntry(entry)) {
                        continue;
                    }

                    const entryFiles = await this.findFilesInDirectory(fullPath, patterns, exclude);
                    files.push(...entryFiles);
                }
            }
        } catch (error) {
            console.warn(`Error scanning directory ${dirPath}:`, error);
        }

        return files;
    }

    /**
     * Check if a filename matches any of the given patterns
     * DRY: Delegates to unified PatternMatcher for consistent behavior
     */
    public static matchesPatterns(filePath: string, patterns?: string[]): boolean {
        return PatternMatcher.fileUtilsCompatible(filePath, patterns);
    }

    /**
     * Check if an entry should be skipped during scanning
     */
    private static shouldSkipEntry(entry: string): boolean {
        const skipPatterns = [
            '.',
            '..',
            '.git',
            '.vscode',
            'node_modules',
            '.terraform',
            'dist',
            'build',
            'out',
            'target',
            '__pycache__'
        ];

        return skipPatterns.some(pattern => entry.startsWith(pattern));
    }

    /**
     * Normalize file paths for consistent comparison
     */
    public static normalizePath(filePath: string): string {
        return path.resolve(filePath).replace(/\\/g, '/');
    }

    /**
     * Get relative path from workspace root
     */
    public static getWorkspaceRelativePath(filePath: string): string {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return path.basename(filePath);
        }

        const workspaceRoot = workspaceFolders[0].uri.fsPath;
        const relative = path.relative(workspaceRoot, filePath);

        // If the file is outside workspace, return just the filename
        if (relative.startsWith('..')) {
            return path.basename(filePath);
        }

        return relative;
    }

    /**
     * Check if a file is within the workspace
     */
    public static isInWorkspace(filePath: string): boolean {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return false;
        }

        const normalizedFilePath = this.normalizePath(filePath);

        return workspaceFolders.some(folder => {
            const workspacePath = this.normalizePath(folder.uri.fsPath);

            if (normalizedFilePath === workspacePath) {
                return true;
            }

            // Require separator boundary so a sibling directory that shares
            // the workspace name as a prefix doesn't pass the check.
            const workspaceWithSep = workspacePath.endsWith('/') ? workspacePath : workspacePath + '/';
            return normalizedFilePath.startsWith(workspaceWithSep);
        });
    }

    /**
     * Get file extension without the dot (delegated to FileTypeDetector)
     */
    public static getFileExtension(filePath: string): string {
        return FileTypeDetector.getFileExtension(filePath);
    }

    /**
     * Check if file is a supported IaC file type (delegated to FileTypeDetector)
     */
    public static isIacFile(filePath: string): boolean {
        return FileTypeDetector.isIacFile(filePath);
    }
}

export default FileUtils;