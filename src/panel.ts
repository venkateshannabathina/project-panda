import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
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

export class PandaPanel implements vscode.WebviewViewProvider {
  public static readonly viewType = 'panda.view';

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

    // Ensure the asset cache directory exists
    fs.mkdirSync(this._context.globalStorageUri.fsPath, { recursive: true });

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this._context.extensionUri, 'media'),
        vscode.Uri.joinPath(this._context.extensionUri, 'webview'),
        this._context.globalStorageUri,
      ]
    };

    this._updateHtml();

    webviewView.webview.onDidReceiveMessage(
      async (msg) => this.handleMessage(msg)
    );
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
      } else {
        this.postMessage({ type: 'SHOW_SCREEN', screen: 'API_KEY' });
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

        case 'WEBVIEW_READY':
          await this.checkInitialKey();
          break;

        case 'REQUEST_VRM':
          await this.sendVrmUri(msg.companion);
          break;

        case 'CLEAR_API_KEY':
          await this.secretManager.clearGroqKey();
          this.groqClient = null;
          this.isBusy = false;
          this.postMessage({ type: 'SHOW_SCREEN', screen: 'API_KEY' });
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

  // Download a single file from a URL (follows redirects) to a local path.
  private downloadFile(url: string, destPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const follow = (location: string) => {
        const mod = location.startsWith('https') ? https : http;
        mod.get(location, (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            follow(res.headers.location);
            return;
          }
          if (res.statusCode !== 200) {
            res.resume();
            reject(new Error(`HTTP ${res.statusCode} downloading ${location}`));
            return;
          }
          const out = fs.createWriteStream(destPath);
          res.pipe(out);
          out.on('finish', () => { out.close(); resolve(); });
          out.on('error', (err) => { try { fs.unlinkSync(destPath); } catch {} reject(err); });
          res.on('error', (err) => { try { fs.unlinkSync(destPath); } catch {} reject(err); });
        }).on('error', reject);
      };
      follow(url);
    });
  }

  // Downloads all VRM/VRMA assets from HuggingFace into globalStorageUri (cached).
  // On repeat launches the cached files are served directly — no re-download.
  private async sendVrmUri(companion?: string): Promise<void> {
    if (!this._view) return;

    const ASSETS_BASE = 'https://huggingface.co/datasets/venkateshannabathina/panda-assets/resolve/main';
    const cacheDir = this._context.globalStorageUri.fsPath;

    const vrmName   = companion === 'male' ? 'male.vrm' : 'female.vrm';
    const animNames = [
      'showfullbody.vrma',
      'greeting.vrma',
      'spin.vrma',
      'peacesign.vrma',
      'shoot.vrma',
      'VRMA_06.vrma',
      'VRMA_07.vrma',
    ];

    // Download any assets that aren't already cached
    for (const name of [vrmName, ...animNames]) {
      const dest = path.join(cacheDir, name);
      if (!fs.existsSync(dest)) {
        await this.downloadFile(`${ASSETS_BASE}/${name}`, dest);
      }
    }

    const toUri = (name: string) =>
      this._view!.webview.asWebviewUri(
        vscode.Uri.joinPath(this._context.globalStorageUri, name)
      ).toString();

    const animations = {
      intro:     toUri('showfullbody.vrma'),
      greeting:  toUri('greeting.vrma'),
      spin:      toUri('spin.vrma'),
      peacesign: toUri('peacesign.vrma'),
      shoot:     toUri('shoot.vrma'),
      vrma06:    toUri('VRMA_06.vrma'),
      vrma07:    toUri('VRMA_07.vrma'),
    };

    this.postMessage({ type: 'LOAD_VRM', vrmUri: toUri(vrmName), vrmaUri: animations.intro, animations });
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

      // Send full Yuriko reply to display in chat (clean text + detected emotion)
      const emotion = this.groqClient.getLastEmotion();
      this.postMessage({ type: 'YURIKO_SAID', text: fullText, emotion });

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
