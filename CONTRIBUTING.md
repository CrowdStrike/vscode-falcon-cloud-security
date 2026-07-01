# Contributing

## Setup

```bash
git clone https://github.com/CrowdStrike/vscode-falcon-cloud-security
cd fcs-vscode

nvm install 22 && nvm use 22
npm install
```

## Building and testing

```bash
npm run compile      # Type-check (tsc --noEmit) + bundle (esbuild)
npm run watch        # Watch mode for both — recommended during development
npm test             # Compile then run the full test suite
npm run package      # Build a .vsix for distribution
```

Press F5 in VS Code to launch the Extension Development Host. `Ctrl+Shift+F5` runs the tests with the debugger attached. Both launch configs are defined in `.vscode/launch.json`.

## Project structure

```
src/
├── extension.ts              # Entry point — registers commands, providers, events
├── core/
│   ├── linter.ts             # Scan orchestration (FcsLinter)
│   ├── cliManager.ts         # CLI resolution, execution, download (FcsCliManager)
│   ├── credentialsManager.ts # Credential prompts for CLI downloads
│   └── helpManager.ts        # Help and setup UI
├── utils/
│   ├── diagnosticUtils.ts    # SecurityFinding → VS Code Diagnostic
│   ├── configUtils.ts        # Reads and validates fcs.* settings
│   ├── fileUtils.ts          # Path normalization, directory traversal
│   ├── errorHandler.ts       # Typed error handling (FcsError, CliError, ConfigError)
│   ├── constants.ts          # Timeouts, limits, delays
│   ├── fileTypeDetector.ts   # Terraform/YAML/JSON/Dockerfile detection
│   └── patternMatcher.ts     # Glob matching for file filters
├── providers/
│   ├── codeActionProvider.ts  # Quick-fix code actions
│   └── hoverProvider.ts       # Hover tooltips with remediation guidance
├── types/
│   └── index.ts               # All interfaces — SecurityFinding is the core type
└── test/
    ├── suite/                 # Mocha test files
    └── utils/                 # Test helpers (mock CLI archive builder, etc.)
```

## Things worth knowing

- The extension looks for `fcs` on PATH first. If it's not there, it can download a copy into VS Code's `globalStorageUri`.
- Exit code 40 from the CLI means "scan finished with findings." That's success, not an error. The valid exit codes are `[0, 1, 2, 40]`.
- Workspace scans pass directories to the CLI, not individual files.
- Scans are debounced (2 seconds) with per-document concurrency guards so rapid saves don't pile up.
- Diagnostics highlight from the first non-whitespace character to the end of the line.

## Testing

Tests are in `src/test/suite/` and run through Mocha via `@vscode/test-cli`. They execute inside a VS Code instance, which means there's no way to run a single test file from the CLI. The runner loads all `out/test/**/*.test.js`.

When adding features, add tests. Run `npm run compile && npm test` before opening a PR.

## Code conventions

- ES6 imports only — no `require()` in `src/`
- Class names use the `Fcs` prefix: `FcsLinter`, `FcsCliManager`, `FcsCredentialsManager`
- Keep the `core/`, `utils/`, `providers/`, `types/` directory layout

## Submitting changes

1. Fork the repo and create a feature branch
2. Write your code and add tests
3. Run `npm run compile && npm test` to make sure everything passes
4. Test manually in the Extension Development Host (F5) if you're touching UI or commands
5. Open a PR with a clear description of what changed and why

Before requesting review, check:

- [ ] Follows existing architecture patterns and directory layout
- [ ] Includes tests for new functionality
- [ ] Uses ES6 imports (no `require()`) and `Fcs` class naming
- [ ] Documentation updated if behavior changed
- [ ] Error cases handled with appropriate user feedback

## Debugging

Set breakpoints in the TypeScript source and launch the Extension Development Host (F5). Use the Developer Tools console in the dev instance and the Output panel for extension logs.

Common things to check when something isn't working:

- **Compilation errors:** `npm run compile` gives you the full output.
- **Test failures:** Read the test output carefully; most failures include the expected vs. actual values.
- **Extension won't load:** Usually a `package.json` issue — check activation events and command registrations.
- **CLI problems:** Test the CLI directly in your terminal first, then check exit code handling in `cliManager.ts`.

## Releases

The project follows semver. The VS Code Marketplace convention is odd minor versions for pre-releases (e.g. `0.1.x`, `0.3.x`) and even minor versions for GA releases (e.g. `0.2.x`, `0.4.x`).

### Two-repo strategy

Day-to-day development lives in the internal Bitbucket repository. The public GitHub repository (https://github.com/CrowdStrike/vscode-falcon-cloud-security) exists solely as the public-facing home for the extension and is what customers see on the Marketplace listing.

Code review, feature branches, and all internal work happen in Bitbucket. Nothing gets pushed directly to GitHub except finished, reviewed, merged code ready for customers.

### One-time setup prerequisites

Before the first release, the following must be in place:

1. **GitHub repository created** — https://github.com/CrowdStrike/vscode-falcon-cloud-security. Requires a CrowdStrike GitHub account approved through ProdSec (PRODOSEC-137555).
2. **`vsce` installed** — `npm install -g @vscode/vsce`
3. **VS Code Marketplace access** — The publisher account must be accessible to whoever is performing the release.

### Releasing a new version

**Step 1 — Confirm main is ready.** Verify that `main` in Bitbucket contains everything intended for this release and that all tests pass locally (`npm test`).

**Step 2 — Bump the version.** Update the `version` field in `package.json` on `main` in Bitbucket. Commit and push to Bitbucket `main`.

**Step 3 — Build the package.**

```bash
npm run package
```

This produces a `.vsix` file in the repo root (e.g. `fcs-vscode-0.2.2.vsix`).

**Step 4 — Publish to the Marketplace.**

```bash
# Pre-release
npx vsce publish --pre-release

# GA release
npx vsce publish
```

You will be prompted for your Marketplace credentials if not already authenticated. Alternatively, publish with a PAT:

```bash
npx vsce publish --pat <your-pat>
```

**Step 5 — Mirror to GitHub.** Push the current state of Bitbucket `main` to the public GitHub repository so the source is up to date:

```bash
git push github main
```

If this is your first time, add the GitHub remote first:

```bash
git remote add github https://github.com/CrowdStrike/vscode-falcon-cloud-security.git
```

**Step 6 — Verify on the Marketplace.** Within a few minutes the extension should be live. For pre-releases, users will see a "Switch to Pre-Release Version" toggle on the extension page.

Before publishing, make sure:

- [ ] All tests pass
- [ ] Version bumped in `package.json`
- [ ] Documentation reflects any user-facing changes
- [ ] Package builds cleanly with `npm run package`

### CI/CD automation

Publishing is currently manual. Automated publishing via GitHub Actions was explored but not approved by ProdSec due to constraints around self-hosted runners and secrets management. GitLab CI and Microsoft Entra ID workload identity federation are under investigation as future alternatives.

On the Bitbucket side, run `npm run check-types && npm test` locally before merging — there is no automated CI on Bitbucket.

## License

Contributions are licensed under the same terms as the project. See [LICENSE.txt](LICENSE.txt).
