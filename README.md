# CrowdStrike FCS Security Linter

VS Code extension for scanning Infrastructure as Code (IaC) files with the CrowdStrike FCS CLI. Finds security issues in Terraform, Kubernetes, CloudFormation, Dockerfile, Azure Bicep, and more, and reports them as native VS Code diagnostics.

## Features

- Scans files on save or on demand (single files or full workspace)
- Supports Terraform, Kubernetes, CloudFormation, Dockerfile, Azure Bicep, Ansible, and more
- Finds the FCS CLI on your system PATH first, and falls back to a built-in download option
- Reports findings in the VS Code **Problems** panel, with configurable severity filtering
- Customizable scan paths, file patterns, and behavior through VS Code settings

## Requirements

- VS Code 1.82.0 or later
- To download the FCS CLI, you need a CrowdStrike API client key

## Installation

1. Install the plugin from the VS Code marketplace:
   1. Go to the [VS Code marketplace]([TODO: URL]).
   1. Search for **Falcon Cloud Security**.
   1. Click **Install**.
1. Install the FCS CLI with one of the two options below. 

### Option 1: Use a previously installed FCS CLI

If you already have the FCS CLI installed and on your PATH, the extension picks it up automatically.

1. To test whether the FCS CLI is installed, go to your terminal and run this command:

  ```bash
  fcs version
  ```

  If you see a version number, the FCS CLI is installed.

1. If you know you have the FCS CLI installed, but it isn't on your path, add it to your path and try test above again, or use Option 2 to download a copy specifically for VS Code.

### Option 2: Install the FCS CLI through the extension

To install the FCS CLI, you need a CrowdStrike API client and secret with the following scopes. Ask your Falcon Administrator for assistance.

- Falcon Container CLI : Read / Write
- Falcon Container Image : Read / Write
- Infrastructure as Code : Read / Write

1. In VS Code, open **View** > **Command Palette**, or use the keyboard shortcut **Cmd + Shift + P** on macOS or **Ctrl + Shift + P** on Windows.
1. Search for **FCS**, then click **FCS: Check CLI Status**.
1. From the popup, select **Download CLI**, then **Enter credentials**.
1. Enter your CrowdStrike API client key and secret, then click **Download**.

The downloaded binary is stored in VS Code's global storage directory. Run **FCS: Check CLI Status** from the **Command Palette** to see the path where it is stored.

## Start a scan

1. In VS Code, open a project that contains IaC files.
1. Open **View** > **Command Palette**, or use the keyboard shortcut **Cmd + Shift + P** on macOS or **Ctrl + Shift + P** on Windows.
1. Search for **FCS**, then run **FCS: Scan Current File** or **FCS: Scan Workspace**.

## See scan results

See scan results from the **Problems** panel:

1. Click **View > Problems** to see results in the **Problems** panel.
1. Use the search filter to search for particular areas of concern, such as `S3`, or to filter by severity, such as `critical`.
1. Click any identified problem to open the related file. The problem area is highlighted.
1. Or, right click on any identified problem to see options to get more information or send the context and resolution to a configured AI agent.

See scan results in individual files:

1. Open a file with an identified security concern. Problems areas are underlined with colors that match their severity. By default the colors are:
    - Red: Critical, High
    - Yellow: Medium, Low
    - Blue: Informational
1. Hover over an underlined problem to see the problem and resolution.
    1. If you have an AI agent configured, you may see a **Quick Fix** or **Fix** option to send the problem and resolution to the agent.
1. Or, click the affected line to see the **Code Action** icon (a lightbulb). Click the lightbulb to see options for suppressing the finding or getting more information.

## Commands

All FCS CLI IDE commands are available from the VS Code **Command Palette**. Open **View** > **Command Palette**, or use the keyboard shortcut **Cmd + Shift + P** on macOS or **Ctrl + Shift + P** on Windows and search for **FCS** to find them.

| Command | Description |
|---------|-------------|
| FCS: Scan Current File | Scan the active editor |
| FCS: Scan Workspace | Scan the workspace or configured scan paths |
| FCS: Check CLI Status | Show CLI version, path, and installation status |
| FCS: Download CLI | Download the CLI using CrowdStrike API credentials |
| FCS: Show Configuration Instructions | View setup and path info |
| FCS: Clear All Diagnostics | Remove all findings from the Problems panel |
| FCS: Help & Documentation | Open help resources |
| FCS: Open Settings | Jump to extension settings |

By default, files are scanned automatically on save. Disable this by running **FCS: Open Settings** and disabling the `fcs.scanOnSave` setting.

## Configuration

You can change settings in any of these ways:

- Run **FCS: Open Settings** from the **Command Palette** to jump directly to the extension settings.
- Go to **Code > Settings > Settings** on macOS or **File > Preferences > Settings** on Windows (keyboard shortcut **Cmd + ,** on macOS or **Ctrl + ,** on Windows) to open VS Code **Settings**, then search for **fcs**.
- Edit your `settings.json` directly.

```json
{
  "fcs.enabled": true,
  "fcs.scanOnSave": true,
  "fcs.severity": "all",
  "fcs.scanPaths": [],
  "fcs.filePatterns": ["*.tf", "*.tfvars", "*.yaml", "*.yml", "*.json", "Dockerfile"],
  "fcs.proxyUrl": "",
  "fcs.scanTimeout": 300,
  "fcs.platforms": []
}
```

The settings control these functions:

`enabled`: Toggle the extension on or off.
`scanPaths`: Set paths to scan, relative to workspace root. Leave this list empty to scan everything.
`filePatterns`: Provide glob patterns for files to include.
`scanOnSave`: Toggle whether to scan files automatically when saved.
`severity`: Minimum severity to display. The available settings are `all`, `critical`, `high`, `medium`, `low`, and `informational`.
`proxyUrl`: Set proxy URL for CLI downloads.
`scanTimeout`: Timeout for CLI scans in seconds. Increase this for large workspaces or slow machines. Defaults to 300 seconds.
`platforms`: Restrict scans to specific IaC platforms. Leave empty to scan all platforms. Valid values are `Ansible`, `AzureResourceManager`, `CloudFormation`, `Crossplane`, `DockerCompose`, `Dockerfile`, `GoogleDeploymentManager`, `Kubernetes`, `OpenAPI`, `Pulumi`, `ServerlessFW`, and `Terraform`.

## Supported file types

The plugin supports these file types:

| Type | Extensions |
|------|-----------|
| Terraform | `.tf`, `.tfvars` |
| YAML (Kubernetes, Ansible, CloudFormation, etc.) | `.yaml`, `.yml` |
| JSON (CloudFormation, Azure ARM, OpenAPI, etc.) | `.json` |
| Docker | `Dockerfile`, `.dockerfile` |
| Docker Compose | `docker-compose.yml`, `compose.yml`, etc. |
| Azure Bicep | `.bicep` |

## Troubleshooting

Follow these steps to troubleshoot issues.

### CLI not found

Run **FCS: Check CLI Status** to check the installation. If you installed it on your system, make sure `fcs version` works in your terminal. If necessary, you can re-download the FCS CLI with **FCS: Download CLI**. 

The FCS CLI is supported on Windows, macOS, and Linux. See the [Falcon documentation](https://docs.crowdstrike.com/access?ft:originId=g9ebb316) for minimum versions.

### No scan results

Make sure your files match the configured `fcs.filePatterns` and aren't being filtered out by the `fcs.severity` setting. If you've set custom `fcs.scanPaths`, check that the files fall within those paths.

### Authentication issues

To download the FCS CLI, you need a CrowdStrike API client and secret. These are used once during download and not stored. Talk to your Falcon Administrator if you need access. For more info, see [Create an API client key](https://docs.crowdstrike.com/access?ft:originId=ufcd2496).

## Support

Check [existing issues](https://github.com/CrowdStrike/vscode-falcon-cloud-security/issues) before opening a new issue. If you need to open a new issue, include your extension version, VS Code version, and OS.

## License

See [LICENSE.txt](LICENSE.txt).
