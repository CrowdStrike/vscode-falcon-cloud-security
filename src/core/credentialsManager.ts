import * as vscode from 'vscode';
import { ApiCredentials } from '../types';
import { DownloadWebviewProvider } from '../providers/downloadWebviewProvider';

export class FcsCredentialsManager {
    constructor(private context: vscode.ExtensionContext) {}

    public async getDownloadCredentials(): Promise<ApiCredentials | null> {
        return DownloadWebviewProvider.show(this.context);
    }
}

export default FcsCredentialsManager;
