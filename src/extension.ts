import * as vscode from 'vscode';
import { BuddyPanel } from './panel';

export function activate(context: vscode.ExtensionContext) {
  const provider = new BuddyPanel(context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(BuddyPanel.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('buddy.start', () => {
      vscode.commands.executeCommand('buddy.view.focus');
    })
  );
}

export function deactivate() {}
