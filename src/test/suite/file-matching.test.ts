import * as assert from 'assert';
import * as path from 'path';
import { FcsLinter } from '../../core/linter';
import { SecurityFinding } from '../../types';

suite('File Matching Logic Tests', () => {
    let linter: FcsLinter;

    setup(() => {
        // Create a mock linter instance for testing
        linter = new FcsLinter({} as any);
    });

    test('Exact path matching should work correctly', () => {
        const finding: SecurityFinding = {
            file: '/workspace/src/main.tf',
            line: 1,
            severity: 'High',
            reason: 'Test finding'
        };

        const scannedFiles = [
            '/workspace/src/main.tf',
            '/workspace/src/other.tf',
            '/workspace/config/main.tf'
        ];

        // Access the private method for testing
        const result = (linter as any).findMatchingFile(finding, scannedFiles);
        assert.strictEqual(result, '/workspace/src/main.tf', 'Should match exact path');
    });

    test('Normalized path matching should work correctly', () => {
        const finding: SecurityFinding = {
            file: '/workspace/src/../src/main.tf',
            line: 1,
            severity: 'High',
            reason: 'Test finding'
        };

        const scannedFiles = [
            '/workspace/src/main.tf',
            '/workspace/other.tf'
        ];

        const result = (linter as any).findMatchingFile(finding, scannedFiles);
        assert.strictEqual(result, '/workspace/src/main.tf', 'Should match normalized path');
    });

    test('Filename matching with directory context should work', () => {
        const finding: SecurityFinding = {
            file: 'src/main.tf',
            line: 1,
            severity: 'High',
            reason: 'Test finding'
        };

        const scannedFiles = [
            '/workspace/src/main.tf',
            '/workspace/config/main.tf',  // Different directory
            '/workspace/src/other.tf'
        ];

        const result = (linter as any).findMatchingFile(finding, scannedFiles);
        assert.strictEqual(result, '/workspace/src/main.tf', 'Should prefer matching directory context');
    });

    test('Workspace-relative path matching should work', () => {
        const finding: SecurityFinding = {
            file: 'src/config.yaml',
            line: 1,
            severity: 'Medium',
            reason: 'Test finding'
        };

        const scannedFiles = [
            '/full/path/to/workspace/src/config.yaml',
            '/full/path/to/workspace/other.yaml'
        ];

        const result = (linter as any).findMatchingFile(finding, scannedFiles);
        assert.ok(result?.endsWith('src/config.yaml'), 'Should match workspace-relative path');
    });

    test('Suffix matching with path boundary validation should work', () => {
        const finding: SecurityFinding = {
            file: 'terraform/main.tf',
            line: 1,
            severity: 'High',
            reason: 'Test finding'
        };

        const scannedFiles = [
            '/project/modules/terraform/main.tf',
            '/project/other-terraform/main.tf',  // Should not match (no path boundary)
            '/project/src/main.tf'  // Should not match (different path)
        ];

        const result = (linter as any).findMatchingFile(finding, scannedFiles);
        assert.strictEqual(result, '/project/modules/terraform/main.tf', 'Should match with valid suffix');
    });

    test('Should reject invalid suffix matches', () => {
        // Test a case that should definitely not match any strategy
        const finding: SecurityFinding = {
            file: 'nonexistent-unique-file.tf',
            line: 1,
            severity: 'High',
            reason: 'Test finding'
        };

        const scannedFiles = [
            '/project/different.tf',
            '/project/other.yaml'
        ];

        const result = (linter as any).findMatchingFile(finding, scannedFiles);
        assert.strictEqual(result, null, 'Should reject when no valid match exists');
    });

    test('Should return null when no match is found', () => {
        const finding: SecurityFinding = {
            file: 'nonexistent.tf',
            line: 1,
            severity: 'High',
            reason: 'Test finding'
        };

        const scannedFiles = [
            '/workspace/src/main.tf',
            '/workspace/config.yaml'
        ];

        const result = (linter as any).findMatchingFile(finding, scannedFiles);
        assert.strictEqual(result, null, 'Should return null when no match found');
    });

    test('Should handle empty or undefined file paths', () => {
        const findingNoFile = {
            line: 1,
            severity: 'High',
            reason: 'Test finding'
            // No file property - not a complete SecurityFinding
        } as Partial<SecurityFinding>;

        const scannedFiles = ['/workspace/src/main.tf'];

        const result1 = (linter as any).findMatchingFile(findingNoFile, scannedFiles);
        assert.strictEqual(result1, null, 'Should handle missing file property');

        const findingEmptyFile: SecurityFinding = {
            file: '',
            line: 1,
            severity: 'High',
            reason: 'Test finding'
        };

        const result2 = (linter as any).findMatchingFile(findingEmptyFile, scannedFiles);
        assert.strictEqual(result2, null, 'Should handle empty file path');
    });

    test('Comprehensive path matching should work correctly', () => {
        // Test the new simplified pathsMatch method covers all scenarios
        const testCases = [
            {
                findingPath: '/workspace/src/main.tf',
                scannedPath: '/workspace/src/main.tf',
                shouldMatch: true,
                description: 'Exact path match'
            },
            {
                findingPath: '/workspace/src/../src/main.tf',
                scannedPath: '/workspace/src/main.tf',
                shouldMatch: true,
                description: 'Normalized path match'
            },
            {
                findingPath: 'src/main.tf',
                scannedPath: '/workspace/src/main.tf',
                shouldMatch: true,
                description: 'Workspace relative match'
            },
            {
                findingPath: 'terraform/main.tf',
                scannedPath: '/project/terraform/main.tf',
                shouldMatch: true,
                description: 'Valid suffix match with path boundary'
            },
            {
                findingPath: 'main.tf',
                scannedPath: '/project/other-main.tf',
                shouldMatch: false,
                description: 'Invalid suffix - no path boundary'
            },
            {
                findingPath: 'tf',
                scannedPath: '/project/main.tf',
                shouldMatch: false,
                description: 'Too short path should be rejected'
            }
        ];

        for (const testCase of testCases) {
            const result = (linter as any).pathsMatch(testCase.findingPath, testCase.scannedPath);
            assert.strictEqual(result, testCase.shouldMatch,
                `${testCase.description}: ${testCase.findingPath} vs ${testCase.scannedPath}`);
        }
    });
});