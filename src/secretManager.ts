import * as vscode from 'vscode';

export class SecretManager {
  constructor(private secrets: vscode.SecretStorage) {}

  async saveGroqKey(key: string): Promise<void> {
    await this.secrets.store('buddy.groqKey', key);
  }

  async getGroqKey(): Promise<string | undefined> {
    return this.secrets.get('buddy.groqKey');
  }

  async clearGroqKey(): Promise<void> {
    await this.secrets.delete('buddy.groqKey');
  }
}
