# Buddy VS Code Extension

## What it is
A VS Code voice companion using Groq APIs: Whisper STT → Llama 3.3 LLM → Orpheus TTS. The user clicks a box to speak; the extension records audio in the Extension Host, transcribes it, gets an LLM reply, synthesizes speech, and plays it back in the webview.

## Architecture
```
Extension Host (Node.js)          Webview (HTML/JS)
  panel.ts                  <-->   media/main.js
  groqClient.ts (Groq SDK)         media/style.css
  audioCapture.ts                  webview/index.html
  secretManager.ts
```
- All audio I/O is in the Extension Host — Web Speech API and getUserMedia do NOT work in VS Code webviews.
- API key stored via `context.secrets` (VS Code SecretStorage), never in settings or plaintext.
- Extension Host ↔ Webview communication is via `postMessage`.

## Key files
- `src/panel.ts` — main orchestrator (WebviewPanel, message routing)
- `src/groqClient.ts` — Groq API calls (STT, LLM streaming, TTS)
- `src/audioCapture.ts` — mic recording via node-record-lpcm16 → SoX
- `src/secretManager.ts` — context.secrets wrapper
- `media/main.js` — webview JS (screen rendering, UI state, audio playback)
- `media/style.css` — webview styles (CSS variables for VS Code theme integration)
- `webview/index.html` — HTML shell with CSP nonce injection

## Build commands
```bash
npm run compile     # tsc, outputs to out/
npm run watch       # tsc --watch
```
Press F5 in VS Code to launch Extension Development Host.

## Runtime dependency: SoX
`node-record-lpcm16` shells out to the `sox` binary.
- macOS: `brew install sox`
- Linux: `sudo apt install sox`
- Windows: download from sox.sourceforge.net

## Known design notes
- Nonce is injected into HTML via regex replace of `{{nonce}}` placeholder (global replace).
- CSS uses `--vscode-*` variables throughout for theme compatibility.
- Orpheus TTS requires one-time terms acceptance at: https://console.groq.com/playground?model=canopylabs%2Forpheus-v1-english
- `isBusy` flag in `panel.ts` prevents concurrent requests.
