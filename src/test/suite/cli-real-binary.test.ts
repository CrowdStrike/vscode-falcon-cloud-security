/**
 * Integration tests that invoke a real FCS CLI binary.
 *
 * These tests require the binary to be present on PATH (placed there by test-vscode.sh).
 * They will fail if the binary is not available — this is intentional.
 * Run via: bash scripts/test-vscode.sh from the repo root.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { FcsCliManager } from '../../core/cliManager';
import { FcsLinter } from '../../core/linter';
import { SecurityFinding } from '../../types';

const FIXTURES = path.resolve(__dirname, '../../../test-files');
const TF_FIXTURE = path.join(FIXTURES, 'terraform-example.tf');
const CFN_FIXTURE = path.join(FIXTURES, 'cloudformation-example.json');
const K8S_FIXTURE = path.join(FIXTURES, 'kubernetes-example.yaml');
const DOCKERFILE_FIXTURE = path.join(FIXTURES, 'Dockerfile');
const ANSIBLE_FIXTURE = path.join(FIXTURES, 'ansible-playbook.yml');
const ALL_FIXTURES = [TF_FIXTURE, CFN_FIXTURE, K8S_FIXTURE, DOCKERFILE_FIXTURE, ANSIBLE_FIXTURE];

const SCAN_TIMEOUT = 30000;

function makeManager(): FcsCliManager {
    return new FcsCliManager({
        extensionPath: __dirname,
        globalState: {
            get: () => undefined,
            update: () => Promise.resolve()
        },
        globalStorageUri: vscode.Uri.file('/tmp/test-storage-real-cli')
    } as any);
}

suite('Real FCS CLI — Binary Discovery', () => {
    let manager: FcsCliManager;

    setup(() => {
        manager = makeManager();
    });

    test('checkCliStatus() finds real binary on PATH', async function() {
        this.timeout(SCAN_TIMEOUT);
        const status = await manager.checkCliStatus();
        assert.strictEqual(status.isInstalled, true, 'FCS CLI must be installed on PATH — run via scripts/test-vscode.sh');
        assert.ok(status.version, 'version should be set');
        assert.ok(/^\d+\.\d+\.\d+$/.test(status.version!), `version "${status.version}" should match semver`);
        assert.ok(status.path, 'path should be set');
        console.log(`✅ Found FCS CLI ${status.version} at ${status.path}`);
    });

    test('getAvailableCliPath() returns a non-null path', async function() {
        this.timeout(SCAN_TIMEOUT);
        const cliPath = await (manager as any).getAvailableCliPath();
        assert.ok(cliPath, 'getAvailableCliPath() must return a path');
        assert.ok(typeof cliPath === 'string', 'path must be a string');
        assert.ok(cliPath.endsWith('fcs') || cliPath.endsWith('fcs.exe'), `path "${cliPath}" should end with fcs`);
    });

    test('isVersionCompatible() accepts the real binary version', async function() {
        this.timeout(SCAN_TIMEOUT);
        const status = await manager.checkCliStatus();
        assert.ok(status.version, 'version must be set');
        const compatible = (manager as any).isVersionCompatible(status.version);
        assert.strictEqual(compatible, true, `version ${status.version} should be within the supported range`);
    });
});

suite('Real FCS CLI — Scan Execution', () => {
    let manager: FcsCliManager;

    setup(() => {
        manager = makeManager();
    });

    test('scanFiles() on terraform fixture produces findings', async function() {
        this.timeout(SCAN_TIMEOUT);
        const findings = await manager.scanFiles([TF_FIXTURE]);
        assert.ok(findings.length > 0, 'terraform fixture should produce findings');
        const f = findings[0];
        assert.ok(f.severity, 'finding should have severity');
        assert.ok(f.file, 'finding should have file');
        assert.ok(f.reason, 'finding should have reason');
        assert.ok(f.rule_name, 'finding should have rule_name');
        console.log(`✅ terraform: ${findings.length} findings`);
    });

    test('scanFiles() on cloudformation fixture produces findings', async function() {
        this.timeout(SCAN_TIMEOUT);
        const findings = await manager.scanFiles([CFN_FIXTURE]);
        assert.ok(findings.length > 0, 'cloudformation fixture should produce findings');
        console.log(`✅ cloudformation: ${findings.length} findings`);
    });

    test('scanFiles() on kubernetes fixture produces findings', async function() {
        this.timeout(SCAN_TIMEOUT);
        const findings = await manager.scanFiles([K8S_FIXTURE]);
        assert.ok(findings.length > 0, 'kubernetes fixture should produce findings');
        console.log(`✅ kubernetes: ${findings.length} findings`);
    });

    test('scanFiles() on Dockerfile fixture produces findings', async function() {
        this.timeout(SCAN_TIMEOUT);
        const findings = await manager.scanFiles([DOCKERFILE_FIXTURE]);
        assert.ok(findings.length > 0, 'Dockerfile fixture should produce findings');
        console.log(`✅ Dockerfile: ${findings.length} findings`);
    });

    test('scanFiles() on ansible fixture produces findings', async function() {
        this.timeout(SCAN_TIMEOUT);
        const findings = await manager.scanFiles([ANSIBLE_FIXTURE]);
        assert.ok(findings.length > 0, 'ansible fixture should produce findings');
        console.log(`✅ ansible: ${findings.length} findings`);
    });

    test('scanFiles() on all 5 fixtures in one call returns findings', async function() {
        this.timeout(SCAN_TIMEOUT);
        const findings = await manager.scanFiles(ALL_FIXTURES);
        assert.ok(findings.length > 0, 'combined scan should produce findings');
        console.log(`✅ all fixtures combined: ${findings.length} findings`);
    });
});

suite('Real FCS CLI — JSON Parsing', () => {
    let manager: FcsCliManager;
    let terraformFindings: SecurityFinding[];

    suiteSetup(async function() {
        this.timeout(SCAN_TIMEOUT);
        manager = makeManager();
        terraformFindings = await manager.scanFiles([TF_FIXTURE]);
    });

    test('findings have correct shape from real CLI output', () => {
        assert.ok(terraformFindings.length > 0, 'should have findings');
        const validSeverities = ['Critical', 'High', 'Medium', 'Low', 'Informational'];
        for (const f of terraformFindings) {
            assert.ok(validSeverities.includes(f.severity), `severity "${f.severity}" should be in valid set`);
            assert.ok(f.file, 'finding should have file');
            assert.ok(typeof f.line === 'number' && f.line > 0, `line ${f.line} should be a positive number`);
            assert.ok(f.reason, 'finding should have reason');
            assert.ok(f.rule_name, 'finding should have rule_name');
        }
        assert.ok(
            terraformFindings.some(f => f.file.includes('terraform-example.tf')),
            'at least one finding should reference terraform-example.tf'
        );
    });

    test('Critical S3 ACL finding is correctly mapped from rule_detections', () => {
        const critical = terraformFindings.find(f =>
            f.severity === 'Critical' && f.resource_type === 'aws_s3_bucket'
        );
        assert.ok(critical, 'should find a Critical aws_s3_bucket finding');
        assert.strictEqual(critical!.severity, 'Critical');
        assert.strictEqual(critical!.resource_type, 'aws_s3_bucket');
        assert.strictEqual(critical!.resource_name, 'my-insecure-bucket');
        assert.strictEqual(critical!.issue_type, 'IncorrectValue');
        assert.strictEqual(critical!.line, 6);
    });

    test('finding.platform is populated from rule_detections', () => {
        const withPlatform = terraformFindings.find(f => f.platform === 'terraform');
        assert.ok(withPlatform, 'at least one finding should have platform === "terraform"');
    });

    test('total finding count matches CLI-reported summary (84 for terraform fixture)', () => {
        assert.strictEqual(
            terraformFindings.length,
            84,
            `expected 84 findings from terraform fixture, got ${terraformFindings.length}`
        );
    });
});

suite('Real FCS CLI — Severity Filtering', () => {
    let manager: FcsCliManager;
    let linter: FcsLinter;
    let terraformFindings: SecurityFinding[];

    suiteSetup(async function() {
        this.timeout(SCAN_TIMEOUT);
        manager = makeManager();
        linter = new FcsLinter(manager);
        terraformFindings = await manager.scanFiles([TF_FIXTURE]);
    });

    test('filterFindingsBySeverity("critical") on real findings returns only Critical', () => {
        const filtered = (linter as any).filterFindingsBySeverity(terraformFindings, 'critical');
        assert.ok(filtered.length > 0, 'should have critical findings');
        assert.strictEqual(filtered.length, 1, `expected 1 critical finding, got ${filtered.length}`);
        for (const f of filtered) {
            assert.strictEqual(f.severity, 'Critical', `all filtered findings should be Critical, got "${f.severity}"`);
        }
    });

    test('filterFindingsBySeverity("high") on real findings returns Critical + High only', () => {
        const filtered = (linter as any).filterFindingsBySeverity(terraformFindings, 'high');
        assert.strictEqual(filtered.length, 67, `expected 67 Critical+High findings, got ${filtered.length}`);
        for (const f of filtered) {
            assert.ok(
                f.severity === 'Critical' || f.severity === 'High',
                `all filtered findings should be Critical or High, got "${f.severity}"`
            );
        }
    });
});

suite('Real FCS CLI — Error Handling', () => {
    let manager: FcsCliManager;

    setup(() => {
        manager = makeManager();
    });

    test('scanFiles() on non-existent file throws', async function() {
        this.timeout(SCAN_TIMEOUT);
        await assert.rejects(
            () => manager.scanFiles(['/tmp/does-not-exist-xyzzy.tf']),
            'scanning a non-existent file should throw'
        );
    });

    test('runCliCommand() with real binary exits 0 for version command', async function() {
        this.timeout(SCAN_TIMEOUT);
        const cliPath = await (manager as any).getAvailableCliPath();
        assert.ok(cliPath, 'CLI must be available');
        const result = await (manager as any).runCliCommand(cliPath, ['version'], {});
        assert.strictEqual(result.exitCode, 0, 'fcs version should exit 0');
        assert.ok(result.stdout.toLowerCase().includes('fcs'), 'stdout should contain "fcs"');
    });
});

// Expected fixed field lists — update these if the CLI format intentionally changes.
const EXPECTED_TOP_LEVEL_FIELDS = [
    'fcs_version', 'path', 'project_name', 'scan_type', 'flags', 'stats',
    'scan_uuid', 'scan_performed_at', 'scan_duration_seconds',
    'detection_summary', 'rule_detections', 'project_owners', 'module_resolution'
];
const EXPECTED_RULE_DETECTION_FIELDS = [
    'rule_name', 'rule_uuid', 'rule_category', 'description', 'severity',
    'platform', 'cloud_provider', 'service', 'rule_type', 'detections'
];
const EXPECTED_DETECTION_FIELDS = [
    'file', 'file_sha256', 'line', 'resource_type', 'resource_name',
    'issue_type', 'reason', 'recommendation'
];
// Optional fields that appear on some detections but not all
const OPTIONAL_DETECTION_FIELDS = [
    'remediation', 'remediation_type'  // added in CLI 4.1.0 — not yet used by the extension
];
const ALL_KNOWN_DETECTION_FIELDS = new Set([...EXPECTED_DETECTION_FIELDS, ...OPTIONAL_DETECTION_FIELDS]);

suite('Real FCS CLI — JSON Schema & Completeness', () => {
    let manager: FcsCliManager;
    let rawJson: any;
    let parsedFindings: any[];
    let rawTempDir: string;

    suiteSetup(async function() {
        this.timeout(SCAN_TIMEOUT);
        manager = makeManager();
        const cliPath = await (manager as any).getAvailableCliPath();
        assert.ok(cliPath, 'CLI must be available');
        rawTempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'fcs-schema-test-'));
        const args = ['scan', 'iac', '--report-formats', 'json',
                      '--output-path', rawTempDir, '--policy-rule', 'local',
                      '--path', TF_FIXTURE];
        await (manager as any).runCliCommand(cliPath, args, { strictMode: false });
        const jsonFile = await (manager as any).findJsonReport(rawTempDir);
        assert.ok(jsonFile, 'JSON report should be generated');
        rawJson = JSON.parse(await fs.promises.readFile(jsonFile!, 'utf8'));
        parsedFindings = await manager.scanFiles([TF_FIXTURE]);
    });

    suiteTeardown(async () => {
        await fs.promises.rm(rawTempDir, { recursive: true, force: true });
    });

    test('raw JSON has all expected top-level fields', () => {
        const actualFields = Object.keys(rawJson).sort();
        const expectedFields = [...EXPECTED_TOP_LEVEL_FIELDS].sort();
        assert.deepStrictEqual(
            actualFields,
            expectedFields,
            `CLI JSON top-level fields changed. ` +
            `Added: [${actualFields.filter(f => !EXPECTED_TOP_LEVEL_FIELDS.includes(f)).join(', ')}] ` +
            `Removed: [${EXPECTED_TOP_LEVEL_FIELDS.filter(f => !(f in rawJson)).join(', ')}]. ` +
            `Update EXPECTED_TOP_LEVEL_FIELDS and decide whether the plugins should use new fields.`
        );
    });

    test('rule_detections entries have all expected fields', () => {
        assert.ok(Array.isArray(rawJson.rule_detections), 'rule_detections should be an array');
        assert.ok(rawJson.rule_detections.length > 0, 'rule_detections should not be empty');
        for (const rd of rawJson.rule_detections) {
            const actualFields = Object.keys(rd).sort();
            const expectedFields = [...EXPECTED_RULE_DETECTION_FIELDS].sort();
            assert.deepStrictEqual(
                actualFields,
                expectedFields,
                `rule_detection fields changed in rule "${rd.rule_name}". ` +
                `Added: [${actualFields.filter(f => !EXPECTED_RULE_DETECTION_FIELDS.includes(f)).join(', ')}] ` +
                `Removed: [${EXPECTED_RULE_DETECTION_FIELDS.filter(f => !(f in rd)).join(', ')}]. ` +
                `Update EXPECTED_RULE_DETECTION_FIELDS and decide whether the plugins should use new fields.`
            );
        }
    });

    test('detections entries have all expected fields', () => {
        for (const rd of rawJson.rule_detections) {
            assert.ok(Array.isArray(rd.detections), 'detections should be an array');
            for (const det of rd.detections) {
                // All required fields must be present
                for (const f of EXPECTED_DETECTION_FIELDS) {
                    assert.ok(
                        f in det,
                        `required detection field "${f}" is missing in rule "${rd.rule_name}". ` +
                        `Update EXPECTED_DETECTION_FIELDS.`
                    );
                }
                // No field outside the known set (required + optional) should appear
                const unknown = Object.keys(det).filter(f => !ALL_KNOWN_DETECTION_FIELDS.has(f));
                assert.deepStrictEqual(
                    unknown, [],
                    `unknown detection fields in rule "${rd.rule_name}": [${unknown.join(', ')}]. ` +
                    `Add them to EXPECTED_DETECTION_FIELDS or OPTIONAL_DETECTION_FIELDS and decide whether the plugins should use them.`
                );
            }
        }
    });

    test('parser maps every detection in raw JSON to a finding (no silent drops)', () => {
        const rawCount = rawJson.rule_detections.reduce(
            (sum: number, rd: any) => sum + (rd.detections?.length ?? 0), 0
        );
        assert.strictEqual(
            parsedFindings.length,
            rawCount,
            `parser returned ${parsedFindings.length} findings but raw JSON contains ${rawCount} detections. ` +
            `Some detections were silently dropped during parsing.`
        );
    });
});
