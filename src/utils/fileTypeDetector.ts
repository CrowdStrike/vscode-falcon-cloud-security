/**
 * Centralized file type detection utility following DRY principles.
 * Single source of truth for all file type and extension checking logic.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { PatternMatcher } from './patternMatcher';

export enum FileType {
    TERRAFORM = 'terraform',
    YAML = 'yaml',
    JSON = 'json',
    DOCKERFILE = 'dockerfile',
    BICEP = 'bicep',
    UNKNOWN = 'unknown'
}

export class FileTypeDetector {
    /**
     * Default file patterns supported by the extension
     */
    public static readonly DEFAULT_FILE_PATTERNS = [
        '*.tf', '*.tfvars',           // Terraform
        '*.yaml', '*.yml',            // YAML (Kubernetes, Ansible, CloudFormation, etc.)
        '*.json',                     // JSON (CloudFormation, Azure ARM, OpenAPI, etc.)
        'Dockerfile', '*.dockerfile', // Docker
        'docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml', // Docker Compose
        '*.ts', '*.js', '*.py', '*.go', '*.cs', // Pulumi (multiple languages)
        'serverless.yml', 'serverless.yaml',   // Serverless Framework
        'azuredeploy.json', '*.parameters.json', // Azure ARM Templates
        '*.jinja',                    // Google Deployment Manager
        'openapi.json', 'openapi.yaml', 'swagger.json', 'swagger.yaml', // OpenAPI/Swagger
        '*.bicep'                     // Azure Bicep
    ];

    /**
     * File patterns to always exclude from scanning
     */
    public static readonly ALWAYS_EXCLUDE_PATTERNS = [
        'settings.json',              // VS Code settings (not IaC)
        'launch.json',                // VS Code launch configs (not IaC)
        'tasks.json',                 // VS Code task configs (not IaC)
    ];

    /**
     * Infrastructure as Code file extensions
     */
    private static readonly IAC_EXTENSIONS = [
        'tf', 'tfvars',      // Terraform
        'yaml', 'yml',       // YAML
        'json',              // JSON
        'dockerfile',        // Docker
        'bicep'              // Azure Bicep
    ];

    /**
     * Determines the file type from a file path or VS Code document
     */
    public static getFileType(input: string | vscode.TextDocument): FileType {
        let filePath: string;
        let languageId: string | undefined;

        if (typeof input === 'string') {
            filePath = input;
        } else {
            filePath = input.fileName;
            languageId = input.languageId;
        }

        const fileName = path.basename(filePath);
        const extension = this.getFileExtension(filePath).toLowerCase();

        // Check language ID first if available
        if (languageId) {
            switch (languageId) {
                case 'terraform':
                    return FileType.TERRAFORM;
                case 'yaml':
                    return FileType.YAML;
                case 'json':
                    return FileType.JSON;
                case 'dockerfile':
                    return FileType.DOCKERFILE;
                case 'bicep':
                    return FileType.BICEP;
            }
        }

        // Check by file extension and name
        if (extension === 'tf' || extension === 'tfvars') {
            return FileType.TERRAFORM;
        }

        if (extension === 'yaml' || extension === 'yml') {
            return FileType.YAML;
        }

        if (extension === 'json') {
            return FileType.JSON;
        }

        if (fileName.toLowerCase().startsWith('dockerfile') || extension === 'dockerfile') {
            return FileType.DOCKERFILE;
        }

        if (extension === 'bicep') {
            return FileType.BICEP;
        }

        return FileType.UNKNOWN;
    }

    /**
     * Checks if a file is an Infrastructure as Code file
     */
    public static isIacFile(input: string | vscode.TextDocument): boolean {
        const fileType = this.getFileType(input);
        return fileType !== FileType.UNKNOWN;
    }

    /**
     * Checks if a file is a Terraform file
     */
    public static isTerraformFile(input: string | vscode.TextDocument): boolean {
        const fileType = this.getFileType(input);
        return fileType === FileType.TERRAFORM;
    }

    /**
     * Checks if a file is a YAML file
     */
    public static isYamlFile(input: string | vscode.TextDocument): boolean {
        const fileType = this.getFileType(input);
        return fileType === FileType.YAML;
    }

    /**
     * Checks if a file is a JSON file
     */
    public static isJsonFile(input: string | vscode.TextDocument): boolean {
        const fileType = this.getFileType(input);
        return fileType === FileType.JSON;
    }

    /**
     * Checks if a file is a Dockerfile
     */
    public static isDockerfile(input: string | vscode.TextDocument): boolean {
        const fileType = this.getFileType(input);
        return fileType === FileType.DOCKERFILE;
    }

    /**
     * Checks if a file is a Bicep file
     */
    public static isBicepFile(input: string | vscode.TextDocument): boolean {
        const fileType = this.getFileType(input);
        return fileType === FileType.BICEP;
    }

    /**
     * Gets file extension without the dot
     */
    public static getFileExtension(filePath: string): string {
        return path.extname(filePath).slice(1);
    }

    /**
     * Returns all supported file extensions
     */
    public static getSupportedExtensions(): string[] {
        return [...this.IAC_EXTENSIONS];
    }

    /**
     * Checks if a file matches any of the provided patterns
     * DRY: Delegates to unified PatternMatcher for consistent behavior
     */
    public static matchesPatterns(filePath: string, patterns: string[]): boolean {
        return PatternMatcher.fileTypeDetectorCompatible(filePath, patterns);
    }

    /**
     * Gets the default file patterns for scanning
     */
    public static getDefaultFilePatterns(): string[] {
        return [...this.DEFAULT_FILE_PATTERNS];
    }
}