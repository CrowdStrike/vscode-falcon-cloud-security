import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { FcsCliManager } from '../../core/cliManager';
import { MockCliArchiveBuilder } from '../utils/mockCliArchiveBuilder';

suite('Enhanced CLI Extraction Tests', () => {
    let tempDir: string;
    let mockArchivesDir: string;
    let testArchives: {
        flat: string;
        singleNested: string;
        multiNested: string;
    };
    let extractionTestDir: string;

    setup(async () => {
        // Create temporary directories for testing
        tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'enhanced-extraction-test-'));
        mockArchivesDir = path.join(tempDir, 'archives');
        extractionTestDir = path.join(tempDir, 'extractions');

        // Create mock archives with different structures
        testArchives = await MockCliArchiveBuilder.createTestArchiveSet(mockArchivesDir);
        await fs.promises.mkdir(extractionTestDir, { recursive: true });
    });

    teardown(async () => {
        // Clean up test directories
        if (tempDir) {
            await fs.promises.rm(tempDir, { recursive: true, force: true });
        }
    });

    test('Should calculate correct strip levels for different archive structures', async () => {
        // Mock the private methods to test the enhanced logic
        const cliManager = new FcsCliManager({
            globalStorageUri: { fsPath: tempDir }
        } as any);

        // Test calculateOptimalStripLevel method via reflection
        const calculateOptimalStripLevel = (cliManager as any).calculateOptimalStripLevel.bind(cliManager);

        // Test flat archive (fcs at root) - strip level 1 to remove './'
        const flatContents = ['./', './README.md', './fcs'];
        const flatStripLevel = calculateOptimalStripLevel(flatContents);
        assert.strictEqual(flatStripLevel, 1, 'Flat archive should have strip level 1 to remove ./');

        // Test single-nested archive (fcs-cli/fcs) - strip level 2 to get fcs at root
        const singleNestedContents = ['./', './fcs-cli/', './fcs-cli/LICENSE', './fcs-cli/README.md', './fcs-cli/fcs'];
        const singleNestedStripLevel = calculateOptimalStripLevel(singleNestedContents);
        assert.strictEqual(singleNestedStripLevel, 2, 'Single-nested archive should have strip level 2');

        // Test multi-nested archive (fcs-cli-v1.0.0/bin/fcs) - strip level 2 to get bin/fcs
        const multiNestedContents = ['./', './fcs-cli-v1.0.0/', './fcs-cli-v1.0.0/LICENSE', './fcs-cli-v1.0.0/bin/', './fcs-cli-v1.0.0/bin/README.md', './fcs-cli-v1.0.0/bin/fcs'];
        const multiNestedStripLevel = calculateOptimalStripLevel(multiNestedContents);
        assert.strictEqual(multiNestedStripLevel, 2, 'Multi-nested archive should have strip level 2');
    });

    test('Should extract flat archive correctly with intelligent stripping', async () => {
        const cliManager = new FcsCliManager({
            globalStorageUri: { fsPath: tempDir }
        } as any);

        const extractDir = path.join(extractionTestDir, 'flat-test');
        await fs.promises.mkdir(extractDir, { recursive: true });

        // Test the enhanced extraction method
        const extractCliArchive = (cliManager as any).extractCliArchive.bind(cliManager);
        await extractCliArchive(testArchives.flat, extractDir);

        // Verify CLI binary is at root level
        const cliBinaryPath = path.join(extractDir, 'fcs');
        assert.ok(await fs.promises.access(cliBinaryPath).then(() => true, () => false),
                  'CLI binary should be extracted to root level for flat archive');

        // Verify other files are also at root level
        const readmePath = path.join(extractDir, 'README.md');
        assert.ok(await fs.promises.access(readmePath).then(() => true, () => false),
                  'README should be at root level for flat archive');
    });

    test('Should extract single-nested archive correctly with strip level 2', async () => {
        const cliManager = new FcsCliManager({
            globalStorageUri: { fsPath: tempDir }
        } as any);

        const extractDir = path.join(extractionTestDir, 'single-nested-test');
        await fs.promises.mkdir(extractDir, { recursive: true });

        // Test the enhanced extraction method
        const extractCliArchive = (cliManager as any).extractCliArchive.bind(cliManager);
        await extractCliArchive(testArchives.singleNested, extractDir);

        // Verify CLI binary is at root level after stripping
        const cliBinaryPath = path.join(extractDir, 'fcs');
        assert.ok(await fs.promises.access(cliBinaryPath).then(() => true, () => false),
                  'CLI binary should be extracted to root level after stripping single-nested archive');

        // Verify LICENSE is also at root level
        const licensePath = path.join(extractDir, 'LICENSE');
        assert.ok(await fs.promises.access(licensePath).then(() => true, () => false),
                  'LICENSE should be at root level after stripping single-nested archive');
    });

    test('Should extract multi-nested archive correctly putting bin at root', async () => {
        const cliManager = new FcsCliManager({
            globalStorageUri: { fsPath: tempDir }
        } as any);

        const extractDir = path.join(extractionTestDir, 'multi-nested-test');
        await fs.promises.mkdir(extractDir, { recursive: true });

        // Test the enhanced extraction method
        const extractCliArchive = (cliManager as any).extractCliArchive.bind(cliManager);
        await extractCliArchive(testArchives.multiNested, extractDir);

        // For multi-nested (fcs-cli-v1.0.0/bin/fcs), strip level 2 puts bin/ at root
        const cliBinaryInBin = path.join(extractDir, 'bin', 'fcs');
        assert.ok(await fs.promises.access(cliBinaryInBin).then(() => true, () => false),
                  'CLI binary should be in bin/ subdirectory after strip level 2 for multi-nested archive');

        // Verify LICENSE is at root level
        const licensePath = path.join(extractDir, 'LICENSE');
        assert.ok(await fs.promises.access(licensePath).then(() => true, () => false),
                  'LICENSE should be at root level after stripping multi-nested archive');
    });

    test('Should handle ensureCliAtExpectedLocation with recursive search', async () => {
        const cliManager = new FcsCliManager({
            globalStorageUri: { fsPath: tempDir }
        } as any);

        // Create a directory structure where CLI is nested
        const testExtractDir = path.join(extractionTestDir, 'search-test');
        const binDir = path.join(testExtractDir, 'bin');
        await fs.promises.mkdir(binDir, { recursive: true });

        // Create mock CLI in bin directory
        const cliBinaryInBin = path.join(binDir, 'fcs');
        await MockCliArchiveBuilder.createMockCliBinary(binDir, 'linux', '1.0.0');

        // Test ensureCliAtExpectedLocation method
        const expectedCliPath = path.join(testExtractDir, 'fcs');
        const ensureCliAtExpectedLocation = (cliManager as any).ensureCliAtExpectedLocation.bind(cliManager);

        await ensureCliAtExpectedLocation(testExtractDir, expectedCliPath);

        // Verify CLI was moved to expected location
        assert.ok(await fs.promises.access(expectedCliPath).then(() => true, () => false),
                  'CLI should be moved from bin/ to expected location');

        // Original should be cleaned up
        assert.ok(!(await fs.promises.access(cliBinaryInBin).then(() => true, () => false)),
                  'Original CLI in bin/ should be cleaned up after successful move');
    });

    test('Should use copyFile instead of rename for cross-filesystem compatibility', async () => {
        const cliManager = new FcsCliManager({
            globalStorageUri: { fsPath: tempDir }
        } as any);

        // Create source and target in different directories to simulate cross-filesystem
        const sourceDir = path.join(tempDir, 'source');
        const targetDir = path.join(tempDir, 'target');

        await fs.promises.mkdir(sourceDir, { recursive: true });
        await fs.promises.mkdir(targetDir, { recursive: true });

        // Create mock CLI in source directory
        const sourceCliPath = path.join(sourceDir, 'fcs');
        await MockCliArchiveBuilder.createMockCliBinary(sourceDir, 'linux', '1.0.0');

        // Test ensureCliAtExpectedLocation method
        const expectedCliPath = path.join(targetDir, 'fcs');
        const ensureCliAtExpectedLocation = (cliManager as any).ensureCliAtExpectedLocation.bind(cliManager);

        await ensureCliAtExpectedLocation(sourceDir, expectedCliPath);

        // Verify CLI was copied to target location
        assert.ok(await fs.promises.access(expectedCliPath).then(() => true, () => false),
                  'CLI should be copied to expected location');

        // Original should be cleaned up after successful copy
        assert.ok(!(await fs.promises.access(sourceCliPath).then(() => true, () => false)),
                  'Original CLI should be cleaned up after successful copy');
    });
});