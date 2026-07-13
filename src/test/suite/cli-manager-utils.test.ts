import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { promisify } from 'util';
import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { FcsCliManager } from '../../core/cliManager';
import { FcsCliScanResult } from '../../types';

const fsWriteFile = promisify(fs.writeFile);

suite('FcsCliManager Utility Function Tests', () => {
    let tempDir: string;
    let manager: FcsCliManager;

    setup(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fcs-climgr-'));
        manager = new FcsCliManager({} as vscode.ExtensionContext);
    });

    teardown(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    // --- redactCredentials() ---

    test('redactCredentials: strips username and password from http URL', () => {
        const redact = (FcsCliManager as any).redactCredentials;
        const result = redact('Connecting via http://admin:s3cr3t@proxy.example.com:8080');
        assert.ok(!result.includes('admin'), 'Should remove username');
        assert.ok(!result.includes('s3cr3t'), 'Should remove password');
        assert.ok(result.includes('http://'), 'Should preserve scheme');
        assert.ok(result.includes('proxy.example.com'), 'Should preserve host');
    });

    test('redactCredentials: strips credentials from https URL', () => {
        const redact = (FcsCliManager as any).redactCredentials;
        const result = redact('Error at https://user:TOKEN123@api.crowdstrike.com/endpoint');
        assert.ok(!result.includes('TOKEN123'));
        assert.ok(!result.includes('user:'));
        assert.ok(result.includes('https://'));
        assert.ok(result.includes('api.crowdstrike.com'));
    });

    test('redactCredentials: leaves plain URLs without credentials unchanged', () => {
        const redact = (FcsCliManager as any).redactCredentials;
        const plain = 'Request to https://api.example.com/path failed';
        assert.strictEqual(redact(plain), plain);
    });

    test('redactCredentials: leaves non-URL text unchanged', () => {
        const redact = (FcsCliManager as any).redactCredentials;
        const text = 'CLI exited with code 1: permission denied';
        assert.strictEqual(redact(text), text);
    });

    test('redactCredentials: handles multiple credential-bearing URLs in one string', () => {
        const redact = (FcsCliManager as any).redactCredentials;
        const result = redact('http://u1:p1@host1.com and https://u2:p2@host2.com');
        assert.ok(!result.includes('u1') && !result.includes('p1'));
        assert.ok(!result.includes('u2') && !result.includes('p2'));
        assert.ok(result.includes('host1.com') && result.includes('host2.com'));
    });

    test('redactCredentials: does not match port numbers as credentials', () => {
        const redact = (FcsCliManager as any).redactCredentials;
        const url = 'https://api.example.com:8080/path';
        assert.strictEqual(redact(url), url);
    });

    // --- validateDownloadUrl() ---

    test('validateDownloadUrl: accepts HTTPS URL on same root domain as API URL', () => {
        const validate = (manager as any).validateDownloadUrl.bind(manager);
        assert.doesNotThrow(() =>
            validate('https://downloads.crowdstrike.com/fcs/binary', 'https://api.crowdstrike.com')
        );
    });

    test('validateDownloadUrl: accepts URL on the exact root domain', () => {
        const validate = (manager as any).validateDownloadUrl.bind(manager);
        assert.doesNotThrow(() =>
            validate('https://crowdstrike.com/fcs/binary', 'https://api.crowdstrike.com')
        );
    });

    test('validateDownloadUrl: rejects URL on a different domain', () => {
        const validate = (manager as any).validateDownloadUrl.bind(manager);
        assert.throws(
            () => validate('https://evil.com/fcs/backdoored', 'https://api.crowdstrike.com'),
            /trusted domain/
        );
    });

    test('validateDownloadUrl: rejects non-HTTPS download URLs', () => {
        const validate = (manager as any).validateDownloadUrl.bind(manager);
        assert.throws(
            () => validate('http://downloads.crowdstrike.com/fcs', 'https://api.crowdstrike.com'),
            /HTTPS/
        );
    });

    test('validateDownloadUrl: throws on malformed URLs', () => {
        const validate = (manager as any).validateDownloadUrl.bind(manager);
        assert.throws(() => validate('not-a-url', 'https://api.crowdstrike.com'));
    });

    // --- calculateFileHash() / verifyFileHash() ---

    test('calculateFileHash: returns correct SHA-256 hex digest for file contents', async () => {
        const file = path.join(tempDir, 'test.bin');
        await fsWriteFile(file, 'known content');
        const expected = crypto.createHash('sha256').update('known content').digest('hex');
        const actual = await (manager as any).calculateFileHash(file);
        assert.strictEqual(actual, expected);
    });

    test('verifyFileHash: resolves when actual hash matches expected hash', async () => {
        const file = path.join(tempDir, 'binary.bin');
        await fsWriteFile(file, 'binary content');
        const expected = crypto.createHash('sha256').update('binary content').digest('hex');
        await assert.doesNotReject(() => (manager as any).verifyFileHash(file, expected));
    });

    test('verifyFileHash: rejects when hash does not match', async () => {
        const file = path.join(tempDir, 'tampered.bin');
        await fsWriteFile(file, 'real content');
        await assert.rejects(
            () => (manager as any).verifyFileHash(file, 'aaaaaa'),
            /integrity check failed/i
        );
    });

    test('verifyFileHash: hash comparison is case-insensitive', async () => {
        const file = path.join(tempDir, 'binary2.bin');
        await fsWriteFile(file, 'some data');
        const hash = crypto.createHash('sha256').update('some data').digest('hex');
        await assert.doesNotReject(() => (manager as any).verifyFileHash(file, hash.toUpperCase()));
    });

    // --- findJsonReport() ---

    test('findJsonReport: returns path to .json file in the directory', async () => {
        const jsonFile = path.join(tempDir, 'report.json');
        await fsWriteFile(jsonFile, '{}');
        const result = await (manager as any).findJsonReport(tempDir);
        assert.strictEqual(result, jsonFile);
    });

    test('findJsonReport: returns null when directory contains no .json file', async () => {
        await fsWriteFile(path.join(tempDir, 'output.txt'), '');
        const result = await (manager as any).findJsonReport(tempDir);
        assert.strictEqual(result, null);
    });

    test('findJsonReport: returns null for a nonexistent directory', async () => {
        const result = await (manager as any).findJsonReport(path.join(tempDir, 'no-such-dir'));
        assert.strictEqual(result, null);
    });

    // --- parseSecurityFindings() ---

    test('parseSecurityFindings: maps rule_detections to SecurityFinding array', async () => {
        const scanResult: FcsCliScanResult = {
            fcs_version: '1.0.0',
            path: '/tmp/test',
            scan_uuid: 'scan-001',
            detection_summary: { total: 1, critical: 0, high: 1, medium: 0, informational: 0 },
            rule_detections: [{
                rule_name: 'S3 Bucket ACL Too Permissive',
                rule_uuid: 'rule-001',
                rule_category: 'Access Control',
                description: 'ACL allows public read',
                severity: 'High',
                platform: 'terraform',
                detections: [{
                    file: '/path/to/main.tf',
                    line: 15,
                    resource_type: 'aws_s3_bucket',
                    resource_name: 'example',
                    issue_type: 'IncorrectValue',
                    reason: 'ACL is set to public-read',
                    recommendation: 'Set ACL to private'
                }]
            }]
        };
        const jsonFile = path.join(tempDir, 'scan.json');
        await fsWriteFile(jsonFile, JSON.stringify(scanResult));

        const findings = await (manager as any).parseSecurityFindings(jsonFile);
        assert.strictEqual(findings.length, 1);
        assert.strictEqual(findings[0].rule_name, 'S3 Bucket ACL Too Permissive');
        assert.strictEqual(findings[0].rule_uuid, 'rule-001');
        assert.strictEqual(findings[0].severity, 'High');
        assert.strictEqual(findings[0].file, '/path/to/main.tf');
        assert.strictEqual(findings[0].line, 15);
        assert.strictEqual(findings[0].reason, 'ACL is set to public-read');
        assert.strictEqual(findings[0].platform, 'terraform');
    });

    test('parseSecurityFindings: expands multiple detections per rule into individual findings', async () => {
        const scanResult: FcsCliScanResult = {
            fcs_version: '1.0.0',
            path: '/tmp',
            scan_uuid: 'scan-002',
            detection_summary: { total: 2, critical: 0, high: 2, medium: 0, informational: 0 },
            rule_detections: [{
                rule_name: 'Public Access',
                rule_uuid: 'rule-002',
                rule_category: 'Access Control',
                description: 'desc',
                severity: 'High',
                platform: 'terraform',
                detections: [
                    { file: 'a.tf', line: 1, reason: 'reason A', recommendation: 'fix A' },
                    { file: 'b.tf', line: 2, reason: 'reason B', recommendation: 'fix B' }
                ]
            }]
        };
        const jsonFile = path.join(tempDir, 'multi.json');
        await fsWriteFile(jsonFile, JSON.stringify(scanResult));

        const findings = await (manager as any).parseSecurityFindings(jsonFile);
        assert.strictEqual(findings.length, 2);
        assert.strictEqual(findings[0].file, 'a.tf');
        assert.strictEqual(findings[1].file, 'b.tf');
    });

    test('parseSecurityFindings: returns empty array for empty rule_detections', async () => {
        const scanResult = {
            fcs_version: '1.0.0',
            path: '/tmp',
            scan_uuid: 'scan-003',
            detection_summary: { total: 0, critical: 0, high: 0, medium: 0, informational: 0 },
            rule_detections: []
        };
        const jsonFile = path.join(tempDir, 'empty.json');
        await fsWriteFile(jsonFile, JSON.stringify(scanResult));

        const findings = await (manager as any).parseSecurityFindings(jsonFile);
        assert.deepStrictEqual(findings, []);
    });

    test('parseSecurityFindings: returns empty array for malformed JSON', async () => {
        const jsonFile = path.join(tempDir, 'bad.json');
        await fsWriteFile(jsonFile, 'not valid json {{{');
        const findings = await (manager as any).parseSecurityFindings(jsonFile);
        assert.deepStrictEqual(findings, []);
    });

    test('parseSecurityFindings: maps resource_type, resource_name, and issue_type from detection', async () => {
        const scanResult: FcsCliScanResult = {
            fcs_version: '1.0.0',
            path: '/tmp',
            scan_uuid: 'scan-005',
            detection_summary: { total: 1, critical: 0, high: 1, medium: 0, informational: 0 },
            rule_detections: [{
                rule_name: 'Unencrypted S3 Bucket',
                rule_uuid: 'rule-005',
                rule_category: 'Encryption',
                description: 'desc',
                severity: 'High',
                platform: 'terraform',
                detections: [{
                    file: 'main.tf',
                    line: 10,
                    reason: 'encryption disabled',
                    resource_type: 'aws_s3_bucket',
                    resource_name: 'my-bucket',
                    issue_type: 'IncorrectValue'
                }]
            }]
        };
        const jsonFile = path.join(tempDir, 'resource.json');
        await fsWriteFile(jsonFile, JSON.stringify(scanResult));

        const findings = await (manager as any).parseSecurityFindings(jsonFile);
        assert.strictEqual(findings[0].resource_type, 'aws_s3_bucket');
        assert.strictEqual(findings[0].resource_name, 'my-bucket');
        assert.strictEqual(findings[0].issue_type, 'IncorrectValue');
    });

    test('parseSecurityFindings: resource fields are undefined when absent from detection', async () => {
        const scanResult: FcsCliScanResult = {
            fcs_version: '1.0.0',
            path: '/tmp',
            scan_uuid: 'scan-006',
            detection_summary: { total: 1, critical: 1, high: 0, medium: 0, informational: 0 },
            rule_detections: [{
                rule_name: 'Missing Tag',
                rule_uuid: 'rule-006',
                rule_category: 'Best Practices',
                description: 'desc',
                severity: 'Critical',
                platform: 'cloudformation',
                detections: [{ file: 'template.yaml', line: 5, reason: 'tag missing' }]
            }]
        };
        const jsonFile = path.join(tempDir, 'no-resource.json');
        await fsWriteFile(jsonFile, JSON.stringify(scanResult));

        const findings = await (manager as any).parseSecurityFindings(jsonFile);
        assert.strictEqual(findings[0].resource_type, undefined);
        assert.strictEqual(findings[0].resource_name, undefined);
        assert.strictEqual(findings[0].issue_type, undefined);
    });

    test('parseSecurityFindings: sets legacy compatibility fields derived from rule-level data', async () => {
        const scanResult: FcsCliScanResult = {
            fcs_version: '1.0.0',
            path: '/tmp',
            scan_uuid: 'scan-004',
            detection_summary: { total: 1, critical: 0, high: 1, medium: 0, informational: 0 },
            rule_detections: [{
                rule_name: 'Test Rule',
                rule_uuid: 'uuid-999',
                rule_category: 'Test Category',
                description: 'desc',
                severity: 'High',
                platform: 'cloudformation',
                detections: [{ file: 'stack.yaml', line: 10, reason: 'bad config' }]
            }]
        };
        const jsonFile = path.join(tempDir, 'legacy.json');
        await fsWriteFile(jsonFile, JSON.stringify(scanResult));

        const findings = await (manager as any).parseSecurityFindings(jsonFile);
        assert.strictEqual(findings[0].id, 'uuid-999');           // id = rule_uuid
        assert.strictEqual(findings[0].title, 'Test Rule');        // title = rule_name
        assert.strictEqual(findings[0].ruleId, 'uuid-999');        // ruleId = rule_uuid
        assert.strictEqual(findings[0].category, 'Test Category'); // category = rule_category
    });
});
