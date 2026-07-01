import * as assert from 'assert';
import * as vscode from 'vscode';
import { DiagnosticUtils } from '../../utils/diagnosticUtils';
import { SecurityFinding } from '../../types';

suite('Simplified Diagnostic Positioning Tests', () => {

    /**
     * Create a mock VS Code document for testing
     */
    function createMockDocument(content: string, fileName: string = 'test.yaml'): any {
        return {
            fileName,
            lineCount: 1,
            lineAt: (line: number) => ({
                text: content,
                range: new vscode.Range(0, 0, 0, content.length),
                rangeIncludingLineBreak: new vscode.Range(0, 0, 0, content.length),
                firstNonWhitespaceCharacterIndex: 0,
                isEmptyOrWhitespace: false
            }),
            getText: (range?: vscode.Range) => {
                if (range) {
                    return content.substring(range.start.character, range.end.character);
                }
                return content;
            },
            validateRange: (range: vscode.Range) => range,
            validatePosition: (position: vscode.Position) => position,
            offsetAt: (position: vscode.Position) => 0,
            positionAt: (offset: number) => new vscode.Position(0, 0),
            save: () => Promise.resolve(true),
            isDirty: false,
            isUntitled: false,
            languageId: 'yaml',
            version: 1,
            uri: vscode.Uri.file(`/${fileName}`)
        };
    }

    test('Simplified Rule: All findings highlight from first non-whitespace to end of line', async () => {
        const testCases = [
            {
                name: 'YAML password value with comment',
                line: 'db_password: "admin123"  # Password in YAML',
                file: 'test.yaml'
            },
            {
                name: 'JSON API key value with comment',
                line: '"ApiKey": "AKIAIOSFODNN7EXAMPLE",  // AWS access key',
                file: 'cloudformation.json'
            },
            {
                name: 'Terraform secret value with comment',
                line: 'secret_token = "WJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"  # Secret',
                file: 'main.tf'
            },
            {
                name: 'Indented YAML line',
                line: '  amazon.aws.s3_bucket:  # S3 resource in YAML',
                file: 'ansible-playbook.yml'
            }
        ];

        for (const testCase of testCases) {
            const mockDocument = createMockDocument(testCase.line, testCase.file);
            const mockFinding: SecurityFinding = {
                line: 1,
                severity: 'High',
                reason: 'Security issue detected',
                rule_category: 'Secret Management',
                platform: 'Generic',
                issue_type: 'RedundantAttribute',
                file: testCase.file
            };

            const range = DiagnosticUtils['createRange'](mockDocument, mockFinding);
            const highlightedText = testCase.line.substring(range.start.character, range.end.character);

            console.log(`✓ ${testCase.name}: "${highlightedText}"`);

            // Verify it starts from first non-whitespace character
            const firstNonWhitespace = testCase.line.length - testCase.line.trimStart().length;
            assert.strictEqual(range.start.character, firstNonWhitespace,
                `Should start from first non-whitespace character (${firstNonWhitespace})`);

            // Verify it ends at the end of the line
            assert.strictEqual(range.end.character, testCase.line.length,
                'Should end at the end of the line');

            // Verify the highlighted text matches expectation
            const expectedText = testCase.line.substring(firstNonWhitespace);
            assert.strictEqual(highlightedText, expectedText,
                'Highlighted text should be from first non-whitespace to end of line');
        }
    });

    test('Consistent behavior across different file types', async () => {
        const testCases = [
            {
                platform: 'Generic',
                file: 'ansible-playbook.yml',
                line: 'api_key: "AKIAIOSFODNN7EXAMPLE"  # AWS access key'
            },
            {
                platform: 'Generic',
                file: 'cloudformation.json',
                line: '"MasterUserPassword": "hardcoded-password",  // RDS password'
            },
            {
                platform: 'Generic',
                file: 'main.tf',
                line: 'database_password = "SuperSecret123!"  # DB password'
            }
        ];

        for (const testCase of testCases) {
            const mockDocument = createMockDocument(testCase.line, testCase.file);
            const mockFinding: SecurityFinding = {
                line: 1,
                severity: 'High',
                reason: 'Hardcoded secret key appears in source',
                rule_category: 'Secret Management',
                platform: testCase.platform,
                issue_type: 'RedundantAttribute',
                file: testCase.file
            };

            const range = DiagnosticUtils['createRange'](mockDocument, mockFinding);
            const highlightedText = testCase.line.substring(range.start.character, range.end.character);

            console.log(`✓ ${testCase.file}: "${highlightedText}"`);

            // All should follow the same simple rule
            const firstNonWhitespace = testCase.line.length - testCase.line.trimStart().length;
            assert.strictEqual(range.start.character, firstNonWhitespace,
                'Should start from first non-whitespace character consistently');
            assert.strictEqual(range.end.character, testCase.line.length,
                'Should end at line end consistently');
        }
    });

    test('Handle lines with only whitespace or empty lines', async () => {
        const testCases = [
            {
                name: 'Line with leading spaces',
                line: '    some_config: value'
            },
            {
                name: 'Line with tabs',
                line: '\t\tconfig = "value"'
            },
            {
                name: 'Mixed whitespace',
                line: ' \t  setting: true'
            }
        ];

        for (const testCase of testCases) {
            const mockDocument = createMockDocument(testCase.line);
            const mockFinding: SecurityFinding = {
                line: 1,
                severity: 'Medium',
                reason: 'Configuration issue',
                file: 'test.yaml'
            };

            const range = DiagnosticUtils['createRange'](mockDocument, mockFinding);
            const highlightedText = testCase.line.substring(range.start.character, range.end.character);

            console.log(`✓ ${testCase.name}: "${highlightedText}"`);

            // Should skip leading whitespace
            const expectedStart = testCase.line.length - testCase.line.trimStart().length;
            assert.strictEqual(range.start.character, expectedStart,
                'Should skip leading whitespace');

            // Should include everything from first non-whitespace to end
            const expectedText = testCase.line.trimStart();
            assert.strictEqual(highlightedText, expectedText,
                'Should highlight from first non-whitespace to end');
        }
    });

    test('Boundary conditions and edge cases', async () => {
        const testCases = [
            {
                name: 'Single character line',
                line: 'x'
            },
            {
                name: 'Line with only whitespace at end',
                line: 'config: value   '
            },
            {
                name: 'Very long line',
                line: 'very_long_configuration_key: "very_long_configuration_value_that_might_exceed_normal_length_limits_but_should_still_work_correctly"'
            }
        ];

        for (const testCase of testCases) {
            const mockDocument = createMockDocument(testCase.line);
            const mockFinding: SecurityFinding = {
                line: 1,
                severity: 'Informational',
                reason: 'Test case',
                file: 'test.yaml'
            };

            const range = DiagnosticUtils['createRange'](mockDocument, mockFinding);

            console.log(`✓ ${testCase.name}: Range ${range.start.character}-${range.end.character}`);

            // Basic validation
            assert.ok(range.start.character >= 0, 'Start should be non-negative');
            assert.ok(range.end.character <= testCase.line.length, 'End should not exceed line length');
            assert.ok(range.start.character <= range.end.character, 'Start should be <= end');
            assert.strictEqual(range.start.line, range.end.line, 'Should be on same line');
            assert.strictEqual(range.start.line, 0, 'Should be on line 0');
        }
    });
});