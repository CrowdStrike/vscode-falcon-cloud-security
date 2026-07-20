import * as assert from 'assert';
import { DownloadWebviewProvider } from '../../providers/downloadWebviewProvider';

suite('DownloadWebviewProvider Tests', () => {

    // --- Cloud label to API URL mapping ---

    test('resolveApiUrl: us-1 maps to api.crowdstrike.com', () => {
        assert.strictEqual(
            DownloadWebviewProvider.resolveApiUrl('us-1'),
            'https://api.crowdstrike.com'
        );
    });

    test('resolveApiUrl: us-2 maps to api.us-2.crowdstrike.com', () => {
        assert.strictEqual(
            DownloadWebviewProvider.resolveApiUrl('us-2'),
            'https://api.us-2.crowdstrike.com'
        );
    });

    test('resolveApiUrl: eu-1 maps to api.eu-1.crowdstrike.com', () => {
        assert.strictEqual(
            DownloadWebviewProvider.resolveApiUrl('eu-1'),
            'https://api.eu-1.crowdstrike.com'
        );
    });

    test('resolveApiUrl: us-gov-1 maps to GovCloud endpoint', () => {
        assert.strictEqual(
            DownloadWebviewProvider.resolveApiUrl('us-gov-1'),
            'https://api.laggar.gcw.crowdstrike.com'
        );
    });

    test('resolveApiUrl: us-gov-2 maps to .mil GovCloud endpoint', () => {
        assert.strictEqual(
            DownloadWebviewProvider.resolveApiUrl('us-gov-2'),
            'https://api.us-gov-2.crowdstrike.mil'
        );
    });

    test('resolveApiUrl: unknown value falls back to us-1 default', () => {
        assert.strictEqual(
            DownloadWebviewProvider.resolveApiUrl('unknown-region'),
            'https://api.crowdstrike.com'
        );
    });
});
