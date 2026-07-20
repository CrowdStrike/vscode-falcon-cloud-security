import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { promisify } from 'util';
import * as vscode from 'vscode';
import { FileUtils } from '../../utils/fileUtils';

const fsMkdir = promisify(fs.mkdir);
const fsWriteFile = promisify(fs.writeFile);
const fsSymlink = promisify(fs.symlink);

suite('FileUtils Tests', () => {
    let tempDir: string;

    setup(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fcs-fileutils-'));
    });

    teardown(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    // --- exists() ---

    test('exists() returns true for an existing file', async () => {
        const file = path.join(tempDir, 'test.tf');
        await fsWriteFile(file, '');
        assert.strictEqual(await FileUtils.exists(file), true);
    });

    test('exists() returns true for an existing directory', async () => {
        assert.strictEqual(await FileUtils.exists(tempDir), true);
    });

    test('exists() returns false for a missing path', async () => {
        assert.strictEqual(await FileUtils.exists(path.join(tempDir, 'nonexistent.tf')), false);
    });

    // --- findFiles() ---

    test('findFiles() discovers matching files recursively', async () => {
        await fsMkdir(path.join(tempDir, 'subdir'));
        await fsWriteFile(path.join(tempDir, 'main.tf'), '');
        await fsWriteFile(path.join(tempDir, 'subdir', 'vars.tf'), '');
        await fsWriteFile(path.join(tempDir, 'readme.md'), '');

        const files = await FileUtils.findFiles([tempDir], ['*.tf']);
        assert.strictEqual(files.length, 2);
        assert.ok(files.some(f => f.endsWith('main.tf')));
        assert.ok(files.some(f => f.endsWith('vars.tf')));
    });

    test('findFiles() skips node_modules and hidden directories', async () => {
        await fsMkdir(path.join(tempDir, 'node_modules'));
        await fsMkdir(path.join(tempDir, '.git'));
        await fsMkdir(path.join(tempDir, '.terraform'));
        await fsWriteFile(path.join(tempDir, 'node_modules', 'bad.tf'), '');
        await fsWriteFile(path.join(tempDir, '.git', 'hook.tf'), '');
        await fsWriteFile(path.join(tempDir, '.terraform', 'cached.tf'), '');
        await fsWriteFile(path.join(tempDir, 'legit.tf'), '');

        const files = await FileUtils.findFiles([tempDir], ['*.tf']);
        assert.strictEqual(files.length, 1);
        assert.ok(files[0].endsWith('legit.tf'));
    });

    test('findFiles() skips build output directories', async () => {
        for (const dir of ['dist', 'build', 'out', 'target']) {
            await fsMkdir(path.join(tempDir, dir));
            await fsWriteFile(path.join(tempDir, dir, 'file.tf'), '');
        }
        await fsWriteFile(path.join(tempDir, 'source.tf'), '');

        const files = await FileUtils.findFiles([tempDir], ['*.tf']);
        assert.strictEqual(files.length, 1);
        assert.ok(files[0].endsWith('source.tf'));
    });

    test('findFiles() skips symlinks', async () => {
        const real = path.join(tempDir, 'real.tf');
        const link = path.join(tempDir, 'link.tf');
        await fsWriteFile(real, '');
        await fsSymlink(real, link);

        const files = await FileUtils.findFiles([tempDir], ['*.tf']);
        assert.strictEqual(files.length, 1);
        assert.ok(files[0].endsWith('real.tf'));
    });

    test('findFiles() deduplicates when same scan path appears twice', async () => {
        await fsWriteFile(path.join(tempDir, 'main.tf'), '');
        const files = await FileUtils.findFiles([tempDir, tempDir], ['*.tf']);
        assert.strictEqual(files.length, 1);
    });

    test('findFiles() silently skips nonexistent scan paths', async () => {
        const files = await FileUtils.findFiles([path.join(tempDir, 'no-such-dir')], ['*.tf']);
        assert.deepStrictEqual(files, []);
    });

    test('findFiles() returns empty array when no files match patterns', async () => {
        await fsWriteFile(path.join(tempDir, 'readme.md'), '');
        const files = await FileUtils.findFiles([tempDir], ['*.tf']);
        assert.deepStrictEqual(files, []);
    });

    test('findFiles() accepts a direct file path as a scan target', async () => {
        const file = path.join(tempDir, 'main.tf');
        await fsWriteFile(file, '');
        const files = await FileUtils.findFiles([file], ['*.tf']);
        assert.strictEqual(files.length, 1);
        assert.ok(files[0].endsWith('main.tf'));
    });

    // --- matchesPatterns() ---

    test('matchesPatterns() matches by glob extension pattern', () => {
        assert.strictEqual(FileUtils.matchesPatterns('/project/main.tf', ['*.tf']), true);
        assert.strictEqual(FileUtils.matchesPatterns('/project/main.yaml', ['*.tf']), false);
    });

    test('matchesPatterns() matches Dockerfile by exact name', () => {
        assert.strictEqual(FileUtils.matchesPatterns('/project/Dockerfile', ['Dockerfile']), true);
        assert.strictEqual(FileUtils.matchesPatterns('/project/NotDockerfile', ['Dockerfile']), false);
    });

    test('matchesPatterns() returns false for undefined or empty patterns', () => {
        assert.strictEqual(FileUtils.matchesPatterns('/project/main.tf', undefined), false);
        assert.strictEqual(FileUtils.matchesPatterns('/project/main.tf', []), false);
    });

    test('matchesPatterns() returns true when any pattern in the list matches', () => {
        assert.strictEqual(FileUtils.matchesPatterns('/project/main.tf', ['*.yaml', '*.tf']), true);
    });

    // --- isInWorkspace() ---

    test('isInWorkspace() returns true for files inside the open workspace', () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) { return; }
        const root = workspaceFolders[0].uri.fsPath;
        assert.strictEqual(FileUtils.isInWorkspace(path.join(root, 'src', 'extension.ts')), true);
    });

    test('isInWorkspace() returns false for paths outside any workspace folder', () => {
        assert.strictEqual(FileUtils.isInWorkspace('/tmp/totally-outside.tf'), false);
    });

    test('isInWorkspace() rejects a sibling path that shares the workspace name as a prefix', () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) { return; }
        const root = workspaceFolders[0].uri.fsPath;
        assert.strictEqual(FileUtils.isInWorkspace(root + '-evil/payload.tf'), false);
    });

    // --- getFileExtension() ---

    test('getFileExtension() returns extension without the dot', () => {
        assert.strictEqual(FileUtils.getFileExtension('/path/to/main.tf'), 'tf');
        assert.strictEqual(FileUtils.getFileExtension('/path/to/config.yaml'), 'yaml');
        assert.strictEqual(FileUtils.getFileExtension('/path/to/Dockerfile'), '');
    });

    // --- isIacFile() ---

    test('isIacFile() returns true for supported IaC extensions', () => {
        assert.strictEqual(FileUtils.isIacFile('/path/main.tf'), true);
        assert.strictEqual(FileUtils.isIacFile('/path/k8s.yaml'), true);
        assert.strictEqual(FileUtils.isIacFile('/path/stack.json'), true);
        assert.strictEqual(FileUtils.isIacFile('/path/Dockerfile'), true);
    });

    test('isIacFile() returns false for unsupported file types', () => {
        assert.strictEqual(FileUtils.isIacFile('/path/readme.md'), false);
        assert.strictEqual(FileUtils.isIacFile('/path/image.png'), false);
        assert.strictEqual(FileUtils.isIacFile('/path/binary.exe'), false);
    });
});
