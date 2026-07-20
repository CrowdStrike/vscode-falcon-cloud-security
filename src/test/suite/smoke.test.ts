import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

// Basic smoke tests for the extension
suite('Extension Smoke Tests', () => {
	test('Extension modules can be imported', async () => {
		// Test that we can import all main modules without throwing
		try {
			const extensionModule = await import('../../extension.js');
			const { FcsLinter } = await import('../../core/linter.js');
			const { FcsCliManager } = await import('../../core/cliManager.js');
			const { DiagnosticUtils } = await import('../../utils/diagnosticUtils.js');
			const { ConfigurationManager } = await import('../../utils/configUtils.js');
			const { FileUtils } = await import('../../utils/fileUtils.js');

			assert.ok(extensionModule.activate, 'activate function should exist');
			assert.ok(extensionModule.deactivate, 'deactivate function should exist');
			assert.ok(FcsLinter, 'FcsLinter class should exist');
			assert.ok(FcsCliManager, 'FcsCliManager class should exist');
			assert.ok(DiagnosticUtils, 'DiagnosticUtils class should exist');
			assert.ok(ConfigurationManager, 'ConfigurationManager class should exist');
			assert.ok(FileUtils, 'FileUtils class should exist');
		} catch (error) {
			assert.fail(`Failed to import extension modules: ${error}`);
		}
	});

	test('Package.json structure is valid', async () => {
		const packageJsonPath = path.resolve(__dirname, '../../../package.json');
		const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

		// Verify required fields
		assert.ok(packageJson.name, 'Package should have a name');
		assert.ok(packageJson.version, 'Package should have a version');
		assert.ok(packageJson.engines, 'Package should have engines requirement');
		assert.ok(packageJson.contributes, 'Package should contribute commands and settings');

		// Verify commands exist and count them dynamically
		assert.ok(packageJson.contributes.commands, 'Package should contribute commands');
		assert.ok(Array.isArray(packageJson.contributes.commands), 'Commands should be an array');
		assert.ok(packageJson.contributes.commands.length > 0, 'Should have at least one command');

		// Log actual count for debugging
		console.log(`Testing command count... Found ${packageJson.contributes.commands.length} commands`);

		// Verify each command has required properties
		packageJson.contributes.commands.forEach((command: any, index: number) => {
			assert.ok(command.command, `Command ${index} should have a command property`);
			assert.ok(command.title, `Command ${index} should have a title property`);
		});

		// Verify configuration
		assert.ok(packageJson.contributes.configuration, 'Package should contribute configuration');
		assert.ok(packageJson.contributes.configuration.properties, 'Configuration should have properties');
	});

	test('TypeScript compilation produces expected output', () => {
		// Check that compiled files exist
		const outDir = path.resolve(__dirname, '../../../out');
		const expectedFiles = [
			'extension.js',
			'core/linter.js',
			'core/cliManager.js',
			'utils/diagnosticUtils.js',
			'utils/configUtils.js',
			'utils/fileUtils.js',
			'types/index.js'
		];

		// Verify output directory exists
		assert.ok(fs.existsSync(outDir), 'Output directory should exist');

		expectedFiles.forEach(file => {
			const filePath = path.join(outDir, file);
			assert.ok(fs.existsSync(filePath), `${file} should exist in output directory at ${filePath}`);

			// Verify file is not empty
			const stats = fs.statSync(filePath);
			assert.ok(stats.size > 0, `${file} should not be empty`);
		});
	});

	test('Test runner configuration is correct', () => {
		// Verify this test file itself was compiled and can run
		assert.ok(true, 'Test runner is working correctly');

		// Verify we can access VS Code test environment
		assert.ok(typeof suite === 'function', 'Mocha suite function should be available');
		assert.ok(typeof test === 'function', 'Mocha test function should be available');
	});
});