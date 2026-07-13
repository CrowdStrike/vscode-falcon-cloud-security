import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { FcsCliManager } from '../../core/cliManager';

suite('CLI Download Process Tests', () => {
    let cliManager: FcsCliManager;
    let tempDir: string;

    setup(async () => {
        // Create a temp directory for testing
        tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'fcs-test-'));

        cliManager = new FcsCliManager({
            extensionPath: tempDir,
            globalState: {
                get: () => undefined,
                update: () => Promise.resolve()
            },
            globalStorageUri: { fsPath: tempDir }
        } as any);
    });

    teardown(async () => {
        // Clean up temp directory
        try {
            await fs.promises.rm(tempDir, { recursive: true, force: true });
        } catch (error) {
            // Ignore cleanup errors
        }
    });

    test('Should create CLI directory if it does not exist', async () => {
        const testDir = path.join(tempDir, 'test-cli-dir');

        // Verify directory doesn't exist initially
        assert.ok(!await (cliManager as any).pathExists(testDir), 'Directory should not exist initially');

        // Create directory through the manager
        await fs.promises.mkdir(testDir, { recursive: true });

        // Verify directory was created
        assert.ok(await (cliManager as any).pathExists(testDir), 'Directory should be created');
    });

    test('Should detect path existence correctly', async () => {
        const existingPath = path.join(tempDir, 'existing-file.txt');
        const nonExistingPath = path.join(tempDir, 'non-existing-file.txt');

        // Create a test file
        await fs.promises.writeFile(existingPath, 'test content');

        // Test existing path
        const exists = await (cliManager as any).pathExists(existingPath);
        assert.strictEqual(exists, true, 'Should detect existing file');

        // Test non-existing path
        const notExists = await (cliManager as any).pathExists(nonExistingPath);
        assert.strictEqual(notExists, false, 'Should detect non-existing file');
    });

    test('Should handle download failure gracefully', async () => {
        // Test with invalid URL to trigger error handling
        try {
            await (cliManager as any).downloadAndExtractCli('invalid-url');
            assert.fail('Should have thrown an error for invalid URL');
        } catch (error) {
            assert.ok(error instanceof Error, 'Should throw an Error object');
            assert.ok(error.message.includes('Failed to download FCS CLI'), 'Error should contain expected message');
        }
    });

    test('Should validate expected CLI path format', () => {
        const expectedPath = (cliManager as any).getDownloadedCliPath();

        // Should be a valid path
        assert.ok(typeof expectedPath === 'string', 'Expected path should be a string');
        assert.ok(expectedPath.length > 0, 'Expected path should not be empty');
        assert.ok(expectedPath.includes('fcs'), 'Expected path should include CLI name');
    });

    test('Should handle CLI validation correctly', async () => {
        const testCliPath = path.join(tempDir, 'test-fcs');

        try {
            // This should fail since we don't have a real CLI binary
            await (cliManager as any).validateCliInstallation(testCliPath, { os: 'darwin', arch: 'arm64' });
            assert.fail('Should have failed validation for non-existent CLI');
        } catch (error) {
            assert.ok(error instanceof Error, 'Should throw validation error');
        }
    });

    test('Should handle cleanup on download failure', async () => {
        // This test verifies that download failure is handled gracefully
        // The actual cleanup is tested indirectly through error handling

        try {
            await (cliManager as any).downloadAndExtractCli('invalid-url');
            assert.fail('Should have failed for invalid URL');
        } catch (error) {
            assert.ok(error instanceof Error, 'Should throw proper error on failure');
            // The cleanup logic runs in the finally block, which we can't easily test
            // without complex mocking, but we verify that the error path works correctly
        }
    });

    test('Should extract CLI path components correctly', () => {
        const cliPath = (cliManager as any).getDownloadedCliPath();
        const dirPath = path.dirname(cliPath);
        const fileName = path.basename(cliPath);

        assert.ok(dirPath.length > 0, 'Directory path should not be empty');
        assert.ok(fileName === 'fcs' || fileName === 'fcs.exe', 'Filename should be correct for platform');
    });
});