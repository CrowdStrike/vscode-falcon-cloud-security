import * as assert from 'assert';
import { FileTypeDetector, FileType } from '../../utils/fileTypeDetector';

suite('FileTypeDetector Tests', () => {

    // --- Bicep ---

    test('getFileType: detects .bicep by extension', () => {
        assert.strictEqual(FileTypeDetector.getFileType('main.bicep'), FileType.BICEP);
    });

    test('getFileType: detects .bicep by languageId', () => {
        const doc = { fileName: 'main.bicep', languageId: 'bicep' } as any;
        assert.strictEqual(FileTypeDetector.getFileType(doc), FileType.BICEP);
    });

    test('isBicepFile: returns true for .bicep', () => {
        assert.ok(FileTypeDetector.isBicepFile('infra/main.bicep'));
    });

    test('isBicepFile: returns false for .tf', () => {
        assert.ok(!FileTypeDetector.isBicepFile('main.tf'));
    });

    test('isIacFile: returns true for .bicep', () => {
        assert.ok(FileTypeDetector.isIacFile('main.bicep'));
    });

    test('DEFAULT_FILE_PATTERNS includes *.bicep', () => {
        assert.ok(FileTypeDetector.DEFAULT_FILE_PATTERNS.includes('*.bicep'));
    });

    test('matchesPatterns: matches *.bicep pattern', () => {
        assert.ok(FileTypeDetector.matchesPatterns('infra/main.bicep', ['*.bicep']));
    });

    test('matchesPatterns: does not match .bicep for *.tf pattern', () => {
        assert.ok(!FileTypeDetector.matchesPatterns('main.bicep', ['*.tf']));
    });

    // --- Existing types regression ---

    test('getFileType: detects .tf as TERRAFORM', () => {
        assert.strictEqual(FileTypeDetector.getFileType('main.tf'), FileType.TERRAFORM);
    });

    test('getFileType: detects .yaml as YAML', () => {
        assert.strictEqual(FileTypeDetector.getFileType('config.yaml'), FileType.YAML);
    });

    test('getFileType: detects .json as JSON', () => {
        assert.strictEqual(FileTypeDetector.getFileType('template.json'), FileType.JSON);
    });

    test('getFileType: detects Dockerfile as DOCKERFILE', () => {
        assert.strictEqual(FileTypeDetector.getFileType('Dockerfile'), FileType.DOCKERFILE);
    });

    test('getFileType: returns UNKNOWN for unsupported extension', () => {
        assert.strictEqual(FileTypeDetector.getFileType('main.toml'), FileType.UNKNOWN);
    });
});
