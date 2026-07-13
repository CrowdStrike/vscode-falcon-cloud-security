import * as vscode from 'vscode';
import { ApiCredentials } from '../types';

const CLOUD_OPTIONS: { label: string; value: string; apiUrl: string }[] = [
    { label: 'US-1 (Commercial)', value: 'us-1', apiUrl: 'https://api.crowdstrike.com' },
    { label: 'US-2 (Commercial)', value: 'us-2', apiUrl: 'https://api.us-2.crowdstrike.com' },
    { label: 'EU-1 (Commercial)', value: 'eu-1', apiUrl: 'https://api.eu-1.crowdstrike.com' },
    { label: 'US-GOV-1 (GovCloud)', value: 'us-gov-1', apiUrl: 'https://api.laggar.gcw.crowdstrike.com' },
    { label: 'US-GOV-2 (GovCloud)', value: 'us-gov-2', apiUrl: 'https://api.us-gov-2.crowdstrike.mil' }
];

export class DownloadWebviewProvider {
    public static show(context: vscode.ExtensionContext): Promise<ApiCredentials | null> {
        return new Promise((resolve) => {
            const panel = vscode.window.createWebviewPanel(
                'fcsDownloadCli',
                'Download FCS CLI',
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: false
                }
            );

            panel.webview.html = DownloadWebviewProvider.getHtml();

            let resolved = false;

            panel.webview.onDidReceiveMessage((message) => {
                if (resolved) { return; }

                if (message.command === 'submit') {
                    resolved = true;
                    const { clientId, clientSecret, cloud, version, proxyUrl } = message.data;
                    const cloudOption = CLOUD_OPTIONS.find(o => o.value === cloud) ?? CLOUD_OPTIONS[0];
                    resolve({
                        clientId,
                        clientSecret,
                        apiUrl: cloudOption.apiUrl,
                        version: version || undefined,
                        proxyUrl: proxyUrl || undefined
                    });
                    panel.dispose();
                } else if (message.command === 'cancel') {
                    resolved = true;
                    resolve(null);
                    panel.dispose();
                }
            });

            panel.onDidDispose(() => {
                if (!resolved) {
                    resolved = true;
                    resolve(null);
                }
            });
        });
    }

    // Exposed for testing cloud label→URL mapping
    public static resolveApiUrl(cloudValue: string): string {
        return (CLOUD_OPTIONS.find(o => o.value === cloudValue) ?? CLOUD_OPTIONS[0]).apiUrl;
    }

    private static getHtml(): string {
        const cloudOptionsHtml = CLOUD_OPTIONS.map(o =>
            `<option value="${o.value}">${o.label}</option>`
        ).join('\n');

        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Download FCS CLI</title>
<style>
  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background-color: var(--vscode-editor-background);
    padding: 24px 32px;
    margin: 0;
    max-width: 520px;
  }
  h2 {
    margin: 0 0 16px 0;
    font-size: 1.2em;
    font-weight: 600;
    color: var(--vscode-foreground);
  }
  .warning {
    background-color: var(--vscode-inputValidation-warningBackground, rgba(255,200,0,0.15));
    border: 1px solid var(--vscode-inputValidation-warningBorder, #b89500);
    border-radius: 4px;
    padding: 8px 12px;
    margin-bottom: 20px;
    font-size: 0.9em;
  }
  .form-row {
    margin-bottom: 14px;
  }
  label {
    display: block;
    margin-bottom: 4px;
    font-weight: 500;
    font-size: 0.9em;
  }
  .optional {
    font-weight: 400;
    color: var(--vscode-descriptionForeground);
    font-size: 0.85em;
    margin-left: 4px;
  }
  input[type="text"],
  input[type="password"],
  select {
    width: 100%;
    box-sizing: border-box;
    background-color: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    padding: 6px 8px;
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    border-radius: 2px;
    outline: none;
  }
  input:focus, select:focus {
    border-color: var(--vscode-focusBorder);
  }
  .error-text {
    color: var(--vscode-inputValidation-errorForeground, #f48771);
    font-size: 0.85em;
    margin-top: 4px;
    display: none;
  }
  .actions {
    display: flex;
    gap: 8px;
    margin-top: 24px;
  }
  button {
    padding: 6px 16px;
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    border: none;
    border-radius: 2px;
    cursor: pointer;
  }
  button[type="submit"] {
    background-color: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }
  button[type="submit"]:hover {
    background-color: var(--vscode-button-hoverBackground);
  }
  button[type="button"] {
    background-color: var(--vscode-button-secondaryBackground, transparent);
    color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
    border: 1px solid var(--vscode-button-border, var(--vscode-input-border, transparent));
  }
  button[type="button"]:hover {
    background-color: var(--vscode-button-secondaryHoverBackground, rgba(128,128,128,0.1));
  }
  .env-hints {
    margin-top: 24px;
    padding-top: 16px;
    border-top: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.3));
    font-size: 0.85em;
    color: var(--vscode-descriptionForeground);
  }
  .env-hints code {
    font-family: var(--vscode-editor-font-family, monospace);
    background-color: var(--vscode-textCodeBlock-background, rgba(128,128,128,0.15));
    padding: 1px 4px;
    border-radius: 2px;
  }
</style>
</head>
<body>
<h2>Download CrowdStrike FCS CLI</h2>

<div class="warning">
  &#9888;&#65039; Credentials will not be stored — used for this download only
</div>

<form id="credForm" novalidate>
  <div class="form-row">
    <label for="clientId">Client ID</label>
    <input type="text" id="clientId" autocomplete="off" spellcheck="false" />
    <div class="error-text" id="clientIdError">Client ID is required</div>
  </div>

  <div class="form-row">
    <label for="clientSecret">Client Secret</label>
    <input type="password" id="clientSecret" autocomplete="new-password" />
    <div class="error-text" id="clientSecretError">Client Secret is required</div>
  </div>

  <div class="form-row">
    <label for="cloud">Cloud <span class="optional">(default: US-1)</span></label>
    <select id="cloud">
      ${cloudOptionsHtml}
    </select>
  </div>

  <div class="form-row">
    <label for="version">Version <span class="optional">(optional)</span></label>
    <input type="text" id="version" placeholder="Leave blank for latest compatible" autocomplete="off" spellcheck="false" />
  </div>

  <div class="form-row">
    <label for="proxyUrl">Proxy URL <span class="optional">(optional)</span></label>
    <input type="text" id="proxyUrl" placeholder="http://proxy.example.com:8080" autocomplete="off" spellcheck="false" />
  </div>

  <div class="actions">
    <button type="submit">Download</button>
    <button type="button" id="cancelBtn">Cancel</button>
  </div>
</form>

<div class="env-hints">
  <strong>Tip:</strong> You can also set credentials via environment variables:
  <code>FALCON_CLIENT_ID</code>, <code>FALCON_CLIENT_SECRET</code>, <code>FALCON_CLOUD</code>,
  <code>FCS_VERSION</code>, <code>HTTPS_PROXY</code>
</div>

<script>
  const vscode = acquireVsCodeApi();

  document.getElementById('credForm').addEventListener('submit', (e) => {
    e.preventDefault();

    const clientId = document.getElementById('clientId').value.trim();
    const clientSecret = document.getElementById('clientSecret').value.trim();
    let valid = true;

    if (!clientId) {
      document.getElementById('clientIdError').style.display = 'block';
      valid = false;
    } else {
      document.getElementById('clientIdError').style.display = 'none';
    }

    if (!clientSecret) {
      document.getElementById('clientSecretError').style.display = 'block';
      valid = false;
    } else {
      document.getElementById('clientSecretError').style.display = 'none';
    }

    if (!valid) { return; }

    vscode.postMessage({
      command: 'submit',
      data: {
        clientId,
        clientSecret,
        cloud: document.getElementById('cloud').value,
        version: document.getElementById('version').value.trim(),
        proxyUrl: document.getElementById('proxyUrl').value.trim()
      }
    });
  });

  document.getElementById('cancelBtn').addEventListener('click', () => {
    vscode.postMessage({ command: 'cancel' });
  });
</script>
</body>
</html>`;
    }
}
