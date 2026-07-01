import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as tar from 'tar';
import { MockCliArchiveBuilder } from '../utils/mockCliArchiveBuilder';

suite('Debug Archive Creation', () => {
    let tempDir: string;

    setup(async () => {
        tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'debug-archive-'));
    });

    teardown(async () => {
        if (tempDir) {
            await fs.promises.rm(tempDir, { recursive: true, force: true });
        }
    });

    test('Debug archive structures', async () => {
        const archivesDir = path.join(tempDir, 'archives');
        const testArchives = await MockCliArchiveBuilder.createTestArchiveSet(archivesDir);

        for (const [name, archivePath] of Object.entries(testArchives)) {
            console.log(`\n=== Debugging ${name} archive: ${archivePath} ===`);

            const contents: string[] = [];
            await tar.list({
                file: archivePath,
                onentry: (entry) => {
                    console.log(`Entry: ${entry.path} (type: ${entry.type})`);
                    contents.push(entry.path);
                }
            });

            console.log(`Total entries: ${contents.length}`);
            console.log(`Contents: ${contents.join(', ')}`);

            const validation = await MockCliArchiveBuilder.validateArchive(archivePath);
            console.log(`Validation: ${JSON.stringify(validation)}`);

            const needsStrip = contents.some(entry => entry.includes('/'));
            console.log(`Needs strip: ${needsStrip}`);
        }
    });
});