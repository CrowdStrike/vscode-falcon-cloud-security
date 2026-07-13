import * as assert from 'assert';
import { ErrorHandler, ErrorContext, ErrorHandlingOptions } from '../../utils/errorHandler';
import { FcsError, CliError, ConfigurationError } from '../../types';

suite('ErrorHandler Tests', () => {

    test('Should standardize different error types', () => {
        // Error instance
        const error = new Error('Test error');
        assert.strictEqual(ErrorHandler.standardizeError(error), error);

        // String error
        const stringError = ErrorHandler.standardizeError('String error');
        assert.ok(stringError instanceof Error);
        assert.strictEqual(stringError.message, 'String error');

        // Object error
        const objError = ErrorHandler.standardizeError({ code: 404, message: 'Not found' });
        assert.ok(objError instanceof Error);
        assert.ok(objError.message.includes('404'));

        // Unknown type
        const unknownError = ErrorHandler.standardizeError(123);
        assert.ok(unknownError instanceof Error);
        assert.strictEqual(unknownError.message, 'Unknown error: 123');
    });

    test('Should sanitize axios errors to prevent credential leakage', () => {
        const axiosError = {
            isAxiosError: true,
            message: 'Request failed with status code 401',
            config: {
                method: 'POST',
                url: 'https://api.crowdstrike.com/oauth2/token',
                data: {
                    client_id: 'abc123',
                    client_secret: 'SUPER_SECRET_KEY_12345',
                    grant_type: 'client_credentials'
                },
                headers: {
                    'Authorization': 'Bearer secret_token',
                    'Content-Type': 'application/json'
                }
            },
            response: {
                status: 401,
                statusText: 'Unauthorized',
                data: { error: 'invalid_client' }
            }
        };

        const sanitized = ErrorHandler.standardizeError(axiosError);

        assert.ok(sanitized instanceof Error);
        assert.ok(!sanitized.message.includes('client_secret'), 'Should not leak client_secret');
        assert.ok(!sanitized.message.includes('SUPER_SECRET'), 'Should not leak credentials');
        assert.ok(!sanitized.message.includes('secret_token'), 'Should not leak auth tokens');
        assert.ok(sanitized.message.includes('401'), 'Should include status code');
        assert.ok(sanitized.message.includes('Unauthorized'), 'Should include status text');
        assert.ok(sanitized.message.includes('POST'), 'Should include HTTP method');
        assert.ok(sanitized.message.includes('oauth2/token'), 'Should include URL');
    });

    test('Should create appropriate error types based on context', () => {
        // CLI error
        const cliContext: ErrorContext = { component: 'CLI', operation: 'scanning' };
        const cliError = ErrorHandler.createError('CLI failed', cliContext);
        assert.ok(cliError instanceof CliError);

        // Configuration error
        const configContext: ErrorContext = { component: 'Configuration', operation: 'validation' };
        const configError = ErrorHandler.createError('Config invalid', configContext);
        assert.ok(configError instanceof ConfigurationError);

        // Generic FCS error
        const genericContext: ErrorContext = { component: 'Scanner', operation: 'file processing' };
        const genericError = ErrorHandler.createError('Generic error', genericContext);
        assert.ok(genericError instanceof FcsError);
        assert.ok(!(genericError instanceof CliError));
        assert.ok(!(genericError instanceof ConfigurationError));
    });

    test('Should handle CLI errors with exit codes and stderr', () => {
        const cliError = ErrorHandler.handleCliError(
            new Error('Command failed'),
            1,
            'Permission denied',
            'file scanning'
        );

        assert.ok(cliError instanceof CliError);
        assert.ok(cliError.message.includes('CLI Error during file scanning'));
        assert.ok(cliError.message.includes('Command failed'));
        assert.ok(cliError.message.includes('exit code: 1'));
        assert.ok(cliError.message.includes('Permission denied'));
        assert.strictEqual(cliError.exitCode, 1);
        assert.strictEqual(cliError.stderr, 'Permission denied');
    });

    test('Should handle configuration errors with setting context', () => {
        const configError = ErrorHandler.handleConfigError(
            'Invalid path format',
            'fcs.scanPaths'
        );

        assert.ok(configError instanceof ConfigurationError);
        assert.ok(configError.message.includes('Configuration Error'));
        assert.ok(configError.message.includes("setting 'fcs.scanPaths'"));
        assert.ok(configError.message.includes('Invalid path format'));
    });

    test('Should handle async promises correctly', async () => {
        const context: ErrorContext = { component: 'Async Test', operation: 'promise handling' };

        // Successful promise
        const successPromise = Promise.resolve('success');
        const result = await ErrorHandler.handleAsync(successPromise, context);
        assert.strictEqual(result, 'success');

        // Failed promise
        const failedPromise = Promise.reject(new Error('Async failure'));

        try {
            await ErrorHandler.handleAsync(failedPromise, context);
            assert.fail('Should have thrown error');
        } catch (error) {
            assert.ok(error instanceof Error);
            assert.strictEqual(error.message, 'Async failure');
        }
    });

    test('Should handle edge cases and boundary conditions', () => {
        const context: ErrorContext = { component: 'Edge Case', operation: 'boundary testing' };

        // Null error - should not throw
        const nullError = ErrorHandler.standardizeError(null);
        assert.ok(nullError instanceof Error);

        // Undefined error - should not throw
        const undefinedError = ErrorHandler.standardizeError(undefined);
        assert.ok(undefinedError instanceof Error);

        // Empty string error - should work
        const emptyError = ErrorHandler.standardizeError('');
        assert.ok(emptyError instanceof Error);
        assert.strictEqual(emptyError.message, '');

        // Complex object error - should serialize
        const complexError = ErrorHandler.standardizeError({ nested: { error: 'complex' }, array: [1, 2, 3] });
        assert.ok(complexError instanceof Error);
        assert.ok(complexError.message.includes('nested'));
    });

    test('Should create CLI errors without optional parameters', () => {
        const cliError1 = ErrorHandler.handleCliError('Simple CLI error');
        assert.ok(cliError1 instanceof CliError);
        assert.ok(cliError1.message.includes('CLI Error:'));
        assert.ok(cliError1.message.includes('Simple CLI error'));

        const cliError2 = ErrorHandler.handleCliError(new Error('Error object'), 0);
        assert.ok(cliError2.message.includes('exit code: 0'));
    });

    test('Should create configuration errors without setting parameter', () => {
        const configError = ErrorHandler.handleConfigError('Missing configuration');
        assert.ok(configError instanceof ConfigurationError);
        assert.ok(configError.message.includes('Configuration Error:'));
        assert.ok(configError.message.includes('Missing configuration'));
        assert.ok(!configError.message.includes("setting '"));
    });

    test('Should handle different error context components', () => {
        // Case-insensitive CLI matching
        const cliContext1: ErrorContext = { component: 'cli', operation: 'test' };
        const cliError1 = ErrorHandler.createError('test', cliContext1);
        assert.ok(cliError1 instanceof CliError);

        const cliContext2: ErrorContext = { component: 'CLI Manager', operation: 'test' };
        const cliError2 = ErrorHandler.createError('test', cliContext2);
        assert.ok(cliError2 instanceof CliError);

        // Case-insensitive Configuration matching
        const configContext1: ErrorContext = { component: 'config', operation: 'test' };
        const configError1 = ErrorHandler.createError('test', configContext1);
        assert.ok(configError1 instanceof ConfigurationError);

        const configContext2: ErrorContext = { component: 'Configuration', operation: 'test' };
        const configError2 = ErrorHandler.createError('test', configContext2);
        assert.ok(configError2 instanceof ConfigurationError);
    });

    test('Should preserve original errors in FcsError cause field', () => {
        const originalError = new Error('Original error');
        const context: ErrorContext = { component: 'Generic', operation: 'test' };

        const fcsError = ErrorHandler.createError('Wrapped error', context, originalError);
        assert.ok(fcsError instanceof FcsError);
        assert.strictEqual(fcsError.cause, originalError);
    });
});