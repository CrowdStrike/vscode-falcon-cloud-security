// .vscode-test.js
const { defineConfig } = require('@vscode/test-cli');

module.exports = defineConfig({
  files: 'out/test/**/*.test.js',
  workspaceFolder: '.',
  extensionDevelopmentPath: '.',
  version: '1.120.0'
});
