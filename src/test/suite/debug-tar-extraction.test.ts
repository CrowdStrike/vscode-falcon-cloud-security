import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as tar from 'tar';
import { MockCliArchiveBuilder } from '../utils/mockCliArchiveBuilder';

suite('Debug Tar Extraction Behavior', () => {
    let tempDir: string;

    setup(async () => {
        tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'debug-tar-'));
    });

    teardown(async () => {
        if (tempDir) {
            await fs.promises.rm(tempDir, { recursive: true, force: true });
        }
    });

    test('Debug tar.extract strip behavior', async () => {
        // Create test archives
        const archivesDir = path.join(tempDir, 'archives');
        const testArchives = await MockCliArchiveBuilder.createTestArchiveSet(archivesDir);

        for (const [name, archivePath] of Object.entries(testArchives)) {
            console.log(`\n=== Testing ${name} archive ===`);

            // Test different strip levels
            for (let stripLevel = 0; stripLevel <= 2; stripLevel++) {
                const extractDir = path.join(tempDir, `extract-${name}-strip${stripLevel}`);
                await fs.promises.mkdir(extractDir, { recursive: true });

                console.log(`\nExtracting with strip level ${stripLevel}:`);
                await tar.extract({
                    file: archivePath,
                    cwd: extractDir,
                    strip: stripLevel
                });

                // List extracted contents
                const extractedFiles = await fs.promises.readdir(extractDir, { recursive: true });
                console.log(`  Extracted files: ${extractedFiles.join(', ')}`);

                // Check if fcs is at root level
                const fcsAtRoot = await fs.promises.access(path.join(extractDir, 'fcs')).then(() => true, () => false);
                console.log(`  FCS at root: ${fcsAtRoot}`);
            }
        }
    });
});