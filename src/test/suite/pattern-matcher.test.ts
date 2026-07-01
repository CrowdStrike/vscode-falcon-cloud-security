import * as assert from 'assert';
import { PatternMatcher, MatchOptions } from '../../utils/patternMatcher';

suite('PatternMatcher Tests', () => {

    test('Should handle empty or undefined patterns', () => {
        assert.strictEqual(PatternMatcher.matches('file.tf', undefined), false, 'Should handle undefined patterns');
        assert.strictEqual(PatternMatcher.matches('file.tf', []), false, 'Should handle empty patterns array');
        assert.strictEqual(PatternMatcher.matches('file.tf', null), false, 'Should handle null patterns');
    });

    test('Should match extension patterns (*.ext)', () => {
        assert.ok(PatternMatcher.matches('file.tf', ['*.tf']), 'Should match .tf extension');
        assert.ok(PatternMatcher.matches('dir/file.yaml', ['*.yaml']), 'Should match .yaml extension in subdirectory');
        assert.ok(PatternMatcher.matches('deeply/nested/path/config.json', ['*.json']), 'Should match .json in deep path');

        // Multiple patterns
        assert.ok(PatternMatcher.matches('file.tf', ['*.yaml', '*.tf', '*.json']), 'Should match one of multiple extensions');
        assert.ok(!PatternMatcher.matches('file.py', ['*.tf', '*.yaml']), 'Should not match unspecified extension');
    });

    test('Should match exact filenames', () => {
        assert.ok(PatternMatcher.matches('Dockerfile', ['Dockerfile']), 'Should match exact filename');
        assert.ok(PatternMatcher.matches('path/to/Dockerfile', ['Dockerfile']), 'Should match filename in subdirectory');
        assert.ok(PatternMatcher.matches('/absolute/path/to/package.json', ['package.json']), 'Should match specific filename');

        // Multiple exact patterns
        assert.ok(PatternMatcher.matches('Dockerfile', ['README.md', 'Dockerfile', 'package.json']), 'Should match one of multiple filenames');
        assert.ok(!PatternMatcher.matches('README.txt', ['README.md', 'Dockerfile']), 'Should not match similar but different filename');
    });

    test('Should handle case sensitivity option', () => {
        // Case insensitive (default)
        assert.ok(PatternMatcher.matches('File.TF', ['*.tf'], { caseSensitive: false }), 'Should match different case extension (case insensitive)');
        assert.ok(PatternMatcher.matches('DOCKERFILE', ['dockerfile'], { caseSensitive: false }), 'Should match different case filename (case insensitive)');

        // Case sensitive
        assert.ok(!PatternMatcher.matches('FILE.TF', ['*.tf'], { caseSensitive: true }), 'Should not match different case extension (case sensitive)');
        assert.ok(!PatternMatcher.matches('DOCKERFILE', ['dockerfile'], { caseSensitive: true }), 'Should not match different case filename (case sensitive)');
        assert.ok(PatternMatcher.matches('file.tf', ['*.tf'], { caseSensitive: true }), 'Should match same case (case sensitive)');
    });

    test('Should handle directory patterns when enabled', () => {
        const options: MatchOptions = { includeDirectoryPatterns: true };

        assert.ok(PatternMatcher.matches('node_modules/file.js', ['node_modules/'], options), 'Should match directory pattern with trailing slash');
        assert.ok(PatternMatcher.matches('src/node_modules/package.json', ['node_modules/'], options), 'Should match directory pattern in subdirectory');
        assert.ok(PatternMatcher.matches('project\\\\build\\\\file.exe', ['build\\\\'], options), 'Should match Windows directory pattern');

        // Should not match partial directory names
        assert.ok(!PatternMatcher.matches('node_modules_backup/file.js', ['node_modules/'], options), 'Should not match similar directory name');
    });

    test('Should ignore directory patterns when disabled', () => {
        const options: MatchOptions = { includeDirectoryPatterns: false };

        assert.ok(!PatternMatcher.matches('node_modules/file.js', ['node_modules/'], options), 'Should ignore directory pattern when disabled');
        assert.ok(!PatternMatcher.matches('build/output.exe', ['build/'], options), 'Should ignore directory pattern when disabled');
    });

    test('Should handle mixed pattern types', () => {
        const patterns = ['*.tf', 'Dockerfile', 'node_modules/', '*.yaml'];
        const options: MatchOptions = { includeDirectoryPatterns: true, caseSensitive: false };

        assert.ok(PatternMatcher.matches('main.tf', patterns, options), 'Should match extension in mixed patterns');
        assert.ok(PatternMatcher.matches('path/Dockerfile', patterns, options), 'Should match filename in mixed patterns');
        assert.ok(PatternMatcher.matches('node_modules/package.json', patterns, options), 'Should match directory in mixed patterns');
        assert.ok(PatternMatcher.matches('config.YAML', patterns, options), 'Should match case-insensitive extension in mixed patterns');

        assert.ok(!PatternMatcher.matches('main.py', patterns, options), 'Should not match unspecified pattern type');
    });

    test('Should maintain backward compatibility with FileUtils behavior', () => {
        // FileUtils.matchesPatterns() behavior: case-insensitive, supports directories
        const options: MatchOptions = { caseSensitive: false, includeDirectoryPatterns: true };

        // Test cases that should work the same as the original FileUtils.matchesPatterns()
        assert.strictEqual(PatternMatcher.matches('file.tf', ['*.tf'], options), true);
        assert.strictEqual(PatternMatcher.matches('FILE.TF', ['*.tf'], options), true);
        assert.strictEqual(PatternMatcher.matches('Dockerfile', ['Dockerfile'], options), true);
        assert.strictEqual(PatternMatcher.matches('node_modules/file.js', ['node_modules/'], options), true);
        assert.strictEqual(PatternMatcher.matches('file.py', ['*.tf'], options), false);
    });

    test('Should maintain backward compatibility with FileTypeDetector behavior', () => {
        // FileTypeDetector.matchesPatterns() behavior: case-insensitive, no directories
        const options: MatchOptions = { caseSensitive: false, includeDirectoryPatterns: false };

        // Test cases that should work the same as the original FileTypeDetector.matchesPatterns()
        assert.strictEqual(PatternMatcher.matches('file.tf', ['*.tf'], options), true);
        assert.strictEqual(PatternMatcher.matches('FILE.TF', ['*.tf'], options), true);
        assert.strictEqual(PatternMatcher.matches('dockerfile', ['Dockerfile'], options), true);
        assert.strictEqual(PatternMatcher.matches('node_modules/file.js', ['node_modules/'], options), false); // Directories ignored
    });

    test('Should handle edge cases and boundary conditions', () => {
        // Empty strings and special characters
        assert.ok(!PatternMatcher.matches('', ['*.tf']), 'Should handle empty file path');
        assert.ok(!PatternMatcher.matches('file.tf', ['']), 'Should handle empty pattern');

        // Files with multiple dots
        assert.ok(PatternMatcher.matches('config.test.yaml', ['*.yaml']), 'Should match extension on file with multiple dots');
        assert.ok(!PatternMatcher.matches('config.test.yaml', ['*.test.yaml']), 'Should not match complex extension pattern');

        // Files without extensions
        assert.ok(PatternMatcher.matches('Makefile', ['Makefile']), 'Should match files without extensions');
        assert.ok(!PatternMatcher.matches('Makefile', ['*.mk']), 'Should not match extension pattern for extensionless files');

        // Patterns with special characters
        assert.ok(PatternMatcher.matches('file-name.tf', ['*.tf']), 'Should handle filenames with hyphens');
        assert.ok(PatternMatcher.matches('file_name.tf', ['*.tf']), 'Should handle filenames with underscores');
    });

    test('Should handle default options correctly', () => {
        // Test with no options (should use defaults)
        assert.ok(PatternMatcher.matches('FILE.tf', ['*.tf']), 'Should be case-insensitive by default');
        assert.ok(!PatternMatcher.matches('node_modules/file.js', ['node_modules/']), 'Should not include directory patterns by default');

        // Test with partial options
        assert.ok(PatternMatcher.matches('file.TF', ['*.tf'], { caseSensitive: false }), 'Should use default for unspecified options');
    });
});