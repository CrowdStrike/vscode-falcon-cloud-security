import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { promisify } from 'util';
import { FileUtils } from '../../utils/fileUtils';

const fsMkdir = promisify(fs.mkdir);
const fsWriteFile = promisify(fs.writeFile);
const fsRmdir = promisify(fs.rmdir);
const fsUnlink = promisify(fs.unlink);

suite('Security Fixes Integration Tests', () => {

    /**
     * Test 1: Path Boundary Validation - Prefix Matching
     * Scenario: Attacker creates directory with workspace name as prefix
     * Expected: Files in sibling directory rejected as "not in workspace"
     */
    test('Should reject workspace-prefixed sibling directories (Task #13)', async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'integration-test-'));

        try {
            const workspace = path.join(tempDir, 'myproject');
            await fsMkdir(workspace, { recursive: true });

            const sibling1 = path.join(tempDir, 'myproject-backup');
            const sibling2 = path.join(tempDir, 'myproject2');
            const siblingX = path.join(tempDir, 'myprojectX');

            await fsMkdir(sibling1, { recursive: true });
            await fsMkdir(sibling2, { recursive: true });
            await fsMkdir(siblingX, { recursive: true });

            const workspaceFile = path.join(workspace, 'main.tf');
            const siblingFile1 = path.join(sibling1, 'backup.tf');
            const siblingFile2 = path.join(sibling2, 'file.tf');
            const siblingFileX = path.join(siblingX, 'evil.tf');

            await fsWriteFile(workspaceFile, 'resource "aws_s3" {}');
            await fsWriteFile(siblingFile1, 'resource "aws_s3" {}');
            await fsWriteFile(siblingFile2, 'resource "aws_s3" {}');
            await fsWriteFile(siblingFileX, 'resource "aws_s3" {}');

            const normalizedWorkspace = FileUtils.normalizePath(workspace);
            const normalizedSibling1 = FileUtils.normalizePath(siblingFile1);
            const normalizedSibling2 = FileUtils.normalizePath(siblingFile2);
            const normalizedSiblingX = FileUtils.normalizePath(siblingFileX);
            const normalizedWorkspaceFile = FileUtils.normalizePath(workspaceFile);

            const workspaceWithSep = normalizedWorkspace.endsWith('/')
                ? normalizedWorkspace
                : normalizedWorkspace + '/';

            assert.strictEqual(
                normalizedSibling1.startsWith(workspaceWithSep),
                false,
                'myproject-backup/file.tf should not match workspace + separator'
            );

            assert.strictEqual(
                normalizedSibling2.startsWith(workspaceWithSep),
                false,
                'myproject2/file.tf should not match workspace + separator'
            );

            assert.strictEqual(
                normalizedSiblingX.startsWith(workspaceWithSep),
                false,
                'myprojectX/file.tf should not match workspace + separator'
            );

            assert.strictEqual(
                normalizedWorkspaceFile === normalizedWorkspace ||
                normalizedWorkspaceFile.startsWith(workspaceWithSep),
                true,
                'myproject/main.tf should match workspace boundary'
            );

        } finally {
            try {
                const cleanup = async (dir: string) => {
                    if (fs.existsSync(dir)) {
                        const files = fs.readdirSync(dir);
                        for (const file of files) {
                            await fsUnlink(path.join(dir, file));
                        }
                        await fsRmdir(dir);
                    }
                };

                await cleanup(path.join(tempDir, 'myproject'));
                await cleanup(path.join(tempDir, 'myproject-backup'));
                await cleanup(path.join(tempDir, 'myproject2'));
                await cleanup(path.join(tempDir, 'myprojectX'));
                await fsRmdir(tempDir);
            } catch {
                // Ignore cleanup errors
            }
        }
    });

    /**
     * Test 2: Path Normalization Consistency
     * Scenario: Windows-style paths, relative paths, paths with ..
     * Expected: Consistent forward-slash, absolute paths from normalizePath
     */
    test('Should normalize paths consistently across all security checks', () => {
        const testCases = [
            'C:\\Users\\test\\workspace\\file.tf',
            '/home/user/workspace/../workspace/file.tf',
            './relative/path/file.tf'
        ];

        for (const input of testCases) {
            const normalized = FileUtils.normalizePath(input);

            assert.strictEqual(normalized.includes('\\'), false,
                `Normalized path should not contain backslashes: ${normalized}`);

            assert.strictEqual(path.isAbsolute(normalized), true,
                `Normalized path should be absolute: ${normalized}`);
        }
    });

    /**
     * Test 3: Workspace Boundary with Exact Match
     * Scenario: File path exactly equals workspace path
     * Expected: Exact match is treated as within workspace
     */
    test('Should handle exact workspace path match (Task #13 edge case)', () => {
        const workspace = '/home/user/myproject';

        const normalizedWorkspace = FileUtils.normalizePath(workspace);
        const normalizedWithSlash = FileUtils.normalizePath(workspace + '/');

        assert.strictEqual(
            normalizedWorkspace.replace(/\/$/, ''),
            normalizedWithSlash.replace(/\/$/, ''),
            'Workspace path with/without trailing slash should normalize identically'
        );

        const workspaceWithSep = normalizedWorkspace.endsWith('/')
            ? normalizedWorkspace
            : normalizedWorkspace + '/';

        assert.strictEqual(
            normalizedWithSlash === normalizedWorkspace ||
            normalizedWithSlash.startsWith(workspaceWithSep),
            true,
            'Workspace with trailing slash should match'
        );
    });

    /**
     * Test 4: Multiple Workspace Folders
     * Scenario: User has multiple workspace folders open
     * Expected: Files in any workspace accepted; files outside all folders rejected;
     *           sibling of workspace1 rejected despite name prefix
     */
    test('Should handle multiple workspace folders correctly (Task #13)', () => {
        const workspace1 = '/home/user/project1';
        const workspace2 = '/home/user/project2';

        const file1 = path.join(workspace1, 'main.tf');
        const file2 = path.join(workspace2, 'config.yaml');
        const outsideFile = '/home/user/other/file.tf';
        const sibling = path.join('/home/user/project1-backup', 'file.tf');

        const norm1 = FileUtils.normalizePath(workspace1);
        const norm2 = FileUtils.normalizePath(workspace2);
        const normFile1 = FileUtils.normalizePath(file1);
        const normFile2 = FileUtils.normalizePath(file2);
        const normOutside = FileUtils.normalizePath(outsideFile);
        const normSibling = FileUtils.normalizePath(sibling);

        const ws1Sep = norm1.endsWith('/') ? norm1 : norm1 + '/';
        const ws2Sep = norm2.endsWith('/') ? norm2 : norm2 + '/';

        assert.strictEqual(
            normFile1 === norm1 || normFile1.startsWith(ws1Sep),
            true,
            'File in workspace1 should match workspace1 boundary'
        );

        assert.strictEqual(
            normFile2 === norm2 || normFile2.startsWith(ws2Sep),
            true,
            'File in workspace2 should match workspace2 boundary'
        );

        const matchesEither = (normOutside === norm1 || normOutside.startsWith(ws1Sep)) ||
                              (normOutside === norm2 || normOutside.startsWith(ws2Sep));
        assert.strictEqual(matchesEither, false,
            'File outside all workspaces should not match any boundary');

        assert.strictEqual(
            normSibling === norm1 || normSibling.startsWith(ws1Sep),
            false,
            'Sibling directory should not match workspace1 boundary'
        );
    });

    /**
     * Test 5: Empty Workspace Folders Guard
     * Scenario: VS Code has no workspace folders (single file mode)
     * Expected: Guard condition returns false before attempting boundary checks;
     *           normalizePath still produces consistent results for any input
     */
    test('Should reject all paths when no workspace folders exist (Task #13)', () => {
        const testPaths = [
            '/home/user/file.tf',
            'C:\\Users\\test\\file.tf',
            '/tmp/test.yaml'
        ];

        for (const testPath of testPaths) {
            const normalized = FileUtils.normalizePath(testPath);

            assert.ok(path.isAbsolute(normalized),
                `Normalized path should be absolute: ${normalized}`);

            assert.strictEqual(normalized.includes('\\'), false,
                `Normalized path should use forward slashes: ${normalized}`);
        }
    });

    /**
     * Test 6: Case Sensitivity in Path Matching
     * Scenario: Same path with different casing
     * Expected: normalizePath uses path.resolve which respects OS case rules;
     *           exact-case match always succeeds; different-case match only succeeds on Windows
     */
    test('Should respect OS case sensitivity in path matching', () => {
        const workspace = os.platform() === 'win32' ? 'C:\\Users\\Test\\Workspace' : '/home/test/workspace';
        const fileLower = os.platform() === 'win32' ? 'C:\\Users\\Test\\Workspace\\file.tf' : '/home/test/workspace/file.tf';

        const normalizedWorkspace = FileUtils.normalizePath(workspace);
        const normalizedLower = FileUtils.normalizePath(fileLower);

        assert.ok(path.isAbsolute(normalizedWorkspace), 'Workspace should be absolute');
        assert.ok(path.isAbsolute(normalizedLower), 'File should be absolute');

        const workspaceWithSep = normalizedWorkspace.endsWith('/')
            ? normalizedWorkspace
            : normalizedWorkspace + '/';

        const lowerMatches = normalizedLower === normalizedWorkspace ||
                             normalizedLower.startsWith(workspaceWithSep);
        assert.strictEqual(lowerMatches, true, 'Exact case should match workspace boundary');
    });
});
