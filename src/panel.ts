import * as vscode from 'vscode';
import * as fs from 'fs';
import { SecretManager } from './secretManager';
import { GroqClient } from './groqClient';
import { AudioCapture } from './audioCapture';

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

export class BuddyPanel implements vscode.WebviewViewProvider {
  public static readonly viewType = 'buddy.view';

  private _view?: vscode.WebviewView;
  private secretManager: SecretManager;
  private groqClient: GroqClient | null = null;
  private audioCapture: AudioCapture;
  private isBusy: boolean = false;

  constructor(private readonly _context: vscode.ExtensionContext) {
    this.secretManager = new SecretManager(_context.secrets);
    this.audioCapture = new AudioCapture();
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this._context.extensionUri, 'media'),
        vscode.Uri.joinPath(this._context.extensionUri, 'webview'),
        vscode.Uri.joinPath(this._context.extensionUri, 'modelfiles'),
      ]
    };

    this._updateHtml();

    webviewView.webview.onDidReceiveMessage(
      async (msg) => this.handleMessage(msg)
    );

    this.checkInitialKey();
  }

  private postMessage(msg: any): void {
    this._view?.webview.postMessage(msg);
  }

  private async checkInitialKey(): Promise<void> {
    try {
      const key = await this.secretManager.getGroqKey();
      if (key) {
        await this.showLoadingScreen();
        await this.initializeClient(key);
      }
    } catch (e: any) {
      this.postMessage({ type: 'SHOW_ERROR', message: e.message || 'Initialization error' });
    }
  }

  private async handleMessage(msg: any): Promise<void> {
    try {
      switch (msg.type) {
        case 'START_CLICKED':
          this.postMessage({ type: 'SHOW_SCREEN', screen: 'API_KEY' });
          break;

        case 'SAVE_API_KEY':
          await this.secretManager.saveGroqKey(msg.key);
          await this.showLoadingScreen();
          await this.initializeClient(msg.key);
          break;

        case 'REQUEST_VRM':
          this.sendVrmUri();
          break;

        case 'SEND_TEXT': {
          if (this.isBusy) return;
          const text = (msg.text ?? '').trim();
          if (!text) return;
          this.isBusy = true;
          this.postMessage({ type: 'USER_SAID', text });
          this.postMessage({ type: 'SET_STATE', state: 'processing' });
          await this.handleUserTranscript(text);
          break;
        }

        case 'START_LISTENING':
          if (this.isBusy) return;
          this.isBusy = true;
          this.postMessage({ type: 'SET_STATE', state: 'listening' });
          await this.audioCapture.startRecording();
          break;

        case 'STOP_LISTENING': {
          this.postMessage({ type: 'SET_STATE', state: 'processing' });
          const wavPath = await this.audioCapture.stopRecording();
          if (!wavPath) {
            this.handleError('No audio recorded.');
            return;
          }
          await this.processAudio(wavPath);
          break;
        }

        case 'TTS_DONE':
          this.isBusy = false;
          this.postMessage({ type: 'SET_STATE', state: 'idle' });
          break;

        case 'OPEN_SETTINGS':
          this.openSettings();
          break;
      }
    } catch (err: any) {
      this.handleError(err.message || 'An unexpected error occurred');
    }
  }

  private sendVrmUri(): void {
    if (!this._view) return;
    const vrmUri = this._view.webview.asWebviewUri(
      vscode.Uri.joinPath(this._context.extensionUri, 'modelfiles', 'female.vrm')
    );
    const vrmaUri = this._view.webview.asWebviewUri(
      vscode.Uri.joinPath(this._context.extensionUri, 'modelfiles', 'VRMA_MotionPack', 'vrma', 'showfullbody.vrma')
    );
    this.postMessage({ type: 'LOAD_VRM', vrmUri: vrmUri.toString(), vrmaUri: vrmaUri.toString() });
  }

  private async processAudio(wavPath: string): Promise<void> {
    try {
      if (!this.groqClient) throw new Error('Groq client not initialized.');

      const transcript = await this.groqClient.transcribeAudio(wavPath);
      this.audioCapture.cleanup(wavPath);

      if (!transcript || transcript.trim().length === 0) {
        this.postMessage({ type: 'SET_STATE', state: 'idle' });
        this.isBusy = false;
        return;
      }

      // Show what the user said in chat
      this.postMessage({ type: 'USER_SAID', text: transcript });
      await this.handleUserTranscript(transcript);

    } catch (e: any) {
      this.audioCapture.cleanup(wavPath);
      throw e;
    }
  }

  private async initializeClient(key: string): Promise<void> {
    try {
      this.groqClient = new GroqClient(key);
      await this.groqClient.initialize();
      this.postMessage({ type: 'SHOW_SCREEN', screen: 'VOICE_UI' });
    } catch (e: any) {
      await this.secretManager.clearGroqKey();
      this.postMessage({ type: 'SHOW_ERROR', message: 'Connection failed. Check your API key. ' + e.message });
      this.isBusy = false;
    }
  }

  private async showLoadingScreen(): Promise<void> {
    this.postMessage({ type: 'SHOW_SCREEN', screen: 'LOADING' });
  }

  private async handleUserTranscript(text: string): Promise<void> {
    if (!this.groqClient) return;

    try {
      const generator = this.groqClient.streamLLMResponse(text);
      let wordBuffer = '';

      for await (const chunk of generator) {
        wordBuffer += chunk;
        const words = wordBuffer.split(' ');
        if (words.length > 1) {
          for (let i = 0; i < words.length - 1; i++) {
            if (words[i].trim()) {
              this.postMessage({ type: 'LLM_WORD_CHUNK', word: words[i] });
            }
          }
          wordBuffer = words[words.length - 1];
        }
      }
      if (wordBuffer.trim()) {
        this.postMessage({ type: 'LLM_WORD_CHUNK', word: wordBuffer });
      }

      this.postMessage({ type: 'LLM_DONE' });
      await this.handleTTS();
    } catch (e: any) {
      if (e.message?.includes('429')) {
        this.handleError('Rate limit hit, please wait a moment.');
      } else {
        throw e;
      }
    }
  }

  private async handleTTS(): Promise<void> {
    if (!this.groqClient) return;
    this.postMessage({ type: 'SET_STATE', state: 'speaking' });
    try {
      const fullText = this.groqClient.getLastResponse();
      if (!fullText.trim()) {
        this.postMessage({ type: 'SET_STATE', state: 'idle' });
        this.isBusy = false;
        return;
      }

      // Send full buddy reply to display in chat (clean text + detected emotion)
      const emotion = this.groqClient.getLastEmotion();
      this.postMessage({ type: 'BUDDY_SAID', text: fullText, emotion });

      const audioBuffer = await this.groqClient.synthesizeSpeech(fullText);
      const audioBase64 = audioBuffer.toString('base64');
      this.postMessage({ type: 'PLAY_AUDIO', audioBase64, mimeType: 'audio/wav' });
    } catch (e: any) {
      if (e.message === 'TTS_TERMS_NOT_ACCEPTED') {
        this.handleError('Accept Orpheus terms at https://console.groq.com/playground?model=canopylabs%2Forpheus-v1-english first.');
      } else {
        throw e;
      }
    }
  }

  private handleError(message: string): void {
    this.postMessage({ type: 'ERROR', message });
    this.postMessage({ type: 'SET_STATE', state: 'error' });
    this.isBusy = false;
  }

  private async openSettings(): Promise<void> {
    const choice = await vscode.window.showQuickPick([
      'Change API Key',
      'Clear API Key & Restart',
      'Cancel'
    ]);

    if (choice === 'Change API Key') {
      await this.secretManager.clearGroqKey();
      this.postMessage({ type: 'SHOW_SCREEN', screen: 'API_KEY' });
    } else if (choice === 'Clear API Key & Restart') {
      await this.secretManager.clearGroqKey();
      this.postMessage({ type: 'SHOW_SCREEN', screen: 'START' });
    }
  }

  public dispose(): void {
    this.audioCapture.stopRecording().catch(() => {});
  }

  private _updateHtml(): void {
    if (!this._view) return;
    const webview = this._view.webview;

    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._context.extensionUri, 'media', 'style.css')
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._context.extensionUri, 'media', 'main.js')
    );
    const vrmBundleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._context.extensionUri, 'media', 'vrm-bundle.js')
    );

    const htmlPath = vscode.Uri.joinPath(this._context.extensionUri, 'webview', 'index.html');
    let html = fs.readFileSync(htmlPath.fsPath, 'utf8');
    const nonce = getNonce();

    const cspSource = webview.cspSource;
    html = html
      .replace(/\{\{styleUri\}\}/g,     styleUri.toString())
      .replace(/\{\{scriptUri\}\}/g,    scriptUri.toString())
      .replace(/\{\{vrmBundleUri\}\}/g, vrmBundleUri.toString())
      .replace(/\{\{cspSource\}\}/g,    cspSource)
      .replace(/\{\{nonce\}\}/g,        nonce);

    this._view.webview.html = html;
  }
}
