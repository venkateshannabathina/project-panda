import * as vscode from 'vscode';
import { PandaPanel } from './panel';

export function activate(context: vscode.ExtensionContext) {
  const provider = new PandaPanel(context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(PandaPanel.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('panda.start', () => {
      vscode.commands.executeCommand('panda.view.focus');
    })
  );
}

export function deactivate() {}
