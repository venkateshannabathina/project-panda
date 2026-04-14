# Panda — Voice Companion

A VS Code extension that gives you a voice-powered AI companion named **Yuriko**. Talk to her, she talks back — with personality.

**Pipeline:** Mic → Whisper STT → Llama 3.3 LLM → Orpheus TTS → Audio playback

---

## What it does

- Press and hold a button to speak into your mic
- Your speech is transcribed by Groq Whisper
- The transcript is sent to Llama 3.3 (70B) which responds as Yuriko — a sarcastic, expressive, emotionally reactive AI character
- The response is synthesized into speech using Orpheus TTS (voice: `diana`) and played back in the webview
- A 3D VRM avatar animates alongside the conversation
- Yuriko's replies carry emotion tags (`[emotion:joy]`, `[emotion:angry]`, etc.) used to drive avatar expressions

---

## Requirements

### SoX (required for mic recording)

`node-record-lpcm16` shells out to the `sox` binary. Install it for your platform:

| Platform | Command |
|---|---|
| macOS | `brew install sox` |
| Linux | `sudo apt install sox` |
| Windows | Download from [sox.sourceforge.net](http://sox.sourceforge.net) |

### Groq API Key

Get one free at [console.groq.com](https://console.groq.com). You'll enter it in the extension on first launch — it's stored securely via VS Code SecretStorage, never in plaintext.

### Orpheus TTS Terms

The Orpheus TTS model requires a one-time terms acceptance before use:
[Accept terms here](https://console.groq.com/playground?model=canopylabs%2Forpheus-v1-english)

---

## Setup & Running

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Or watch mode during development
npm run watch
```

Then press **F5** in VS Code to launch the Extension Development Host.

---

## Architecture

```
Extension Host (Node.js)            Webview (HTML/JS)
  src/extension.ts                    webview/index.html
  src/panel.ts          <-- post -->  media/main.js
  src/groqClient.ts                   media/style.css
  src/audioCapture.ts                 media/vrm-bundle.js (built)
  src/secretManager.ts
```

### Key files

| File | Role |
|---|---|
| `src/extension.ts` | Entry point — registers the webview provider and command |
| `src/panel.ts` | Main orchestrator — handles all webview ↔ host messaging, routes audio through STT → LLM → TTS pipeline |
| `src/groqClient.ts` | All Groq API calls: Whisper STT, Llama 3.3 streaming LLM, Orpheus TTS |
| `src/audioCapture.ts` | Mic recording via `node-record-lpcm16` → SoX, writes temp WAV to disk |
| `src/secretManager.ts` | Wraps VS Code `context.secrets` for safe API key storage |
| `media/main.js` | Webview JS — UI rendering, state machine, audio playback via Web Audio API |
| `media/style.css` | Styles using `--vscode-*` CSS variables for theme compatibility |
| `media/vrm-scene-src.js` | Three.js + `@pixiv/three-vrm` scene — loads and animates the VRM avatar |
| `webview/index.html` | HTML shell with CSP nonce injection placeholders |

### Message flow

```
[User holds button]
      |
   START_LISTENING → audioCapture.startRecording()
      |
   STOP_LISTENING  → audioCapture.stopRecording() → WAV file
      |
   groqClient.transcribeAudio(wav)   [Whisper large-v3-turbo]
      |
   groqClient.streamLLMResponse(transcript)  [Llama 3.3 70B]
      |  (streamed word-by-word to webview as LLM_WORD_CHUNK)
      |
   groqClient.synthesizeSpeech(text)  [Orpheus v1 diana]
      |
   PLAY_AUDIO → webview decodes base64 WAV and plays it
      |
   TTS_DONE → reset to idle
```

---

## Build

```bash
# Compile TypeScript only
npm run compile

# Bundle the VRM scene (Three.js + @pixiv/three-vrm → single IIFE)
npm run bundle

# Full production build (bundle + compile)
npm run vscode:prepublish

# Package as .vsix
npm run package
```

---

## Models used

| Task | Model |
|---|---|
| Speech-to-Text | `whisper-large-v3-turbo` |
| LLM | `llama-3.3-70b-versatile` |
| Text-to-Speech | `canopylabs/orpheus-v1-english` (voice: `diana`) |

---

## Notes

- Audio capture only works in the Extension Host — `getUserMedia` and Web Speech API are not available in VS Code webviews
- The `isBusy` flag in `panel.ts` prevents concurrent requests
- Yuriko's system prompt instructs max 2 sentences, no markdown, and a mandatory `[emotion:X]` tag at the end of every reply — this tag is stripped before TTS but used for avatar expression
- The VRM avatar and animation files go in `modelfiles/` (not included in repo — add your own `female.vrm` and VRMA motion pack)
- CSP nonces are injected at runtime via regex replace of `{{nonce}}` in `index.html`
