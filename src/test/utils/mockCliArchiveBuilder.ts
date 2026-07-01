/**
 * Test utilities for creating dummy CLI archives and binaries for testing download/extraction
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as tar from 'tar';

export interface MockCliArchiveOptions {
    /** Structure of the archive */
    structure: 'flat' | 'single-nested' | 'multi-nested';
    /** Platform for the CLI binary */
    platform: 'linux' | 'darwin' | 'windows';
    /** Version string to return when --version is called */
    version?: string;
}

export class MockCliArchiveBuilder {
    /**
     * Creates a mock CLI binary that responds to --version
     */
    public static async createMockCliBinary(
        outputPath: string,
        platform: 'linux' | 'darwin' | 'windows',
        version: string = '1.0.0'
    ): Promise<void> {
        const isWindows = platform === 'windows';
        const binaryName = isWindows ? 'fcs.exe' : 'fcs';
        const binaryPath = path.join(outputPath, binaryName);

        let content: string;

        if (isWindows) {
            // Simple Windows batch script
            content = `@echo off\nif "%1"=="--version" (\n    echo fcs ${version}\n) else (\n    echo Mock FCS CLI\n)\n`;
            await fs.promises.writeFile(binaryPath + '.bat', content, 'utf8');

            // Create a placeholder .exe file (non-functional but detectable)
            const placeholderExe = Buffer.from([
                0x4D, 0x5A, // MZ header for Windows executable
                ...Buffer.from(`Mock FCS CLI ${version} for ${platform}`, 'utf8')
            ]);
            await fs.promises.writeFile(binaryPath, placeholderExe);
        } else {
            // Unix shell script
            content = `#!/bin/bash\nif [ "$1" = "--version" ]; then\n    echo "fcs ${version}"\nelse\n    echo "Mock FCS CLI"\nfi\n`;
            await fs.promises.writeFile(binaryPath, content, 'utf8');
            await fs.promises.chmod(binaryPath, 0o755);
        }
    }

    /**
     * Creates a tar.gz archive with different directory structures
     */
    public static async createMockCliArchive(
        outputPath: string,
        options: MockCliArchiveOptions
    ): Promise<string> {
        const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mock-cli-'));
        const archiveName = `fcs-cli-${options.structure}-${options.platform}.tar.gz`;
        const archivePath = path.join(outputPath, archiveName);

        try {
            let binaryDir: string;

            // Create directory structure based on options
            switch (options.structure) {
                case 'flat':
                    // Binary directly in archive root
                    binaryDir = tempDir;
                    break;
                case 'single-nested':
                    // Binary in single subdirectory: fcs-cli/fcs
                    binaryDir = path.join(tempDir, 'fcs-cli');
                    await fs.promises.mkdir(binaryDir, { recursive: true });
                    break;
                case 'multi-nested':
                    // Binary in nested structure: fcs-cli-v1.0.0/bin/fcs
                    const version = options.version || '1.0.0';
                    binaryDir = path.join(tempDir, `fcs-cli-v${version}`, 'bin');
                    await fs.promises.mkdir(binaryDir, { recursive: true });
                    break;
                default:
                    throw new Error(`Unsupported archive structure: ${options.structure}`);
            }

            // Create mock CLI binary
            await this.createMockCliBinary(binaryDir, options.platform, options.version);

            // Add some additional files to make it realistic
            await fs.promises.writeFile(
                path.join(binaryDir, 'README.md'),
                `# FCS CLI ${options.version}\n\nMock CLI for testing purposes.\n`,
                'utf8'
            );

            if (options.structure !== 'flat') {
                // Add a license file in the parent directory
                const licenseDir = options.structure === 'multi-nested'
                    ? path.join(tempDir, `fcs-cli-v${options.version || '1.0.0'}`)
                    : path.join(tempDir, 'fcs-cli');

                await fs.promises.writeFile(
                    path.join(licenseDir, 'LICENSE'),
                    'Mock License for FCS CLI\n',
                    'utf8'
                );
            }

            // Create the tar.gz archive
            await tar.create({
                gzip: true,
                file: archivePath,
                cwd: tempDir
            }, ['.']);

            return archivePath;

        } finally {
            // Clean up temp directory
            await fs.promises.rm(tempDir, { recursive: true, force: true });
        }
    }

    /**
     * Creates multiple test archives with different structures
     */
    public static async createTestArchiveSet(outputDir: string): Promise<{
        flat: string;
        singleNested: string;
        multiNested: string;
    }> {
        await fs.promises.mkdir(outputDir, { recursive: true });

        const [flat, singleNested, multiNested] = await Promise.all([
            this.createMockCliArchive(outputDir, {
                structure: 'flat',
                platform: 'linux',
                version: '1.0.0'
            }),
            this.createMockCliArchive(outputDir, {
                structure: 'single-nested',
                platform: 'linux',
                version: '1.0.0'
            }),
            this.createMockCliArchive(outputDir, {
                structure: 'multi-nested',
                platform: 'linux',
                version: '1.0.0'
            })
        ]);

        return { flat, singleNested, multiNested };
    }

    /**
     * Validates that an archive contains a CLI binary
     */
    public static async validateArchive(archivePath: string): Promise<{
        hasCliBinary: boolean;
        structure: 'flat' | 'single-nested' | 'multi-nested' | 'unknown';
        binaryPath?: string;
    }> {
        const contents: string[] = [];

        await tar.list({
            file: archivePath,
            onentry: (entry) => {
                contents.push(entry.path);
            }
        });

        // Find CLI binary
        const cliBinary = contents.find(entry =>
            path.basename(entry) === 'fcs' || path.basename(entry) === 'fcs.exe'
        );

        if (!cliBinary) {
            return { hasCliBinary: false, structure: 'unknown' };
        }

        // Normalize path by removing leading './' and filter out directory entries
        const normalizedPath = cliBinary.replace(/^\.\//, '');
        const pathParts = normalizedPath.split('/').filter(part => part !== '');

        let structure: 'flat' | 'single-nested' | 'multi-nested' | 'unknown';

        if (pathParts.length === 1) {
            // Binary at root: fcs
            structure = 'flat';
        } else if (pathParts.length === 2) {
            // Binary in one subdirectory: fcs-cli/fcs
            structure = 'single-nested';
        } else if (pathParts.length > 2) {
            // Binary in multiple subdirectories: fcs-cli-v1.0.0/bin/fcs
            structure = 'multi-nested';
        } else {
            structure = 'unknown';
        }

        return {
            hasCliBinary: true,
            structure,
            binaryPath: cliBinary
        };
    }
}

export default MockCliArchiveBuilder;