<div align="center">

# Project Panda
### *Animal Kingdom Series — Vol. 1*

**A 3D AI girl lives in your VS Code sidebar. She talks. She reacts. She keeps you company.**

![VS Code](https://img.shields.io/badge/VS%20Code-Extension-007ACC?style=for-the-badge&logo=visualstudiocode)
![Groq](https://img.shields.io/badge/Powered%20by-Groq-F55036?style=for-the-badge)
![Three.js](https://img.shields.io/badge/3D-Three.js-black?style=for-the-badge&logo=three.js)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

</div>

---

> *"Because coding alone at 2am shouldn't feel lonely."*

---

## What is this?

**Project Panda** is the first entry in the **Animal Kingdom** VS Code extension series.

It puts **Yuriko** — a sarcastic, emotionally reactive 3D AI companion — right inside your VS Code sidebar. Hold a button, speak to her, and she speaks back. Her face reacts in real time. She gets annoyed. She gets happy. She judges your code (lovingly).

This is not a chatbot widget. It is a full voice pipeline with a **living 3D VRM avatar** whose expressions, lip sync, blink, and gaze are all driven in real time.

---

## The Pipeline

```
Your Voice  (mic button held)
     |
  SoX binary  →  16kHz mono WAV on disk  (node-record-lpcm16)
     |
  Whisper STT  →  transcript text  (Groq: whisper-large-v3-turbo)
     |
  Llama 3.3 70B  →  streamed reply + [emotion:X] tag  (Groq: llama-3.3-70b-versatile)
     |
  Emotion tag parsed  →  avatar expression driven live
     |
  Orpheus TTS  →  WAV audio buffer  (Groq: canopylabs/orpheus-v1-english · voice: diana)
     |
  Web Audio API  →  decoded + played back in webview
     |
  RMS amplitude  →  live lip sync on avatar
```

Text input bypasses STT and feeds directly into the LLM step.

---

## Features

- **Push-to-talk mic input** — hold the mic button, release to process
- **Text input** — type instead of speaking anytime
- **Llama 3.3 70B** — streamed word by word in real time
- **Orpheus TTS** — expressive, natural-sounding voice (diana)
- **3D VRM avatar** — full Three.js scene inside the sidebar canvas
- **13-emotion system** — LLM tags its own reply, avatar reacts immediately
- **Lip sync** — RMS amplitude from Web Audio drives mouth phonemes in real time
- **Auto-blink** — randomized blink timing for a natural feel
- **Gaze system** — eye target shifts per conversation state (idle wander, direct contact on listening, thinking look on processing)
- **Micro-expressions** — brief high-intensity flickers layered on top of base expressions
- **Idle body motion** — subtle breathing and head sway after the intro animation finishes
- **Secure API key storage** — VS Code SecretStorage, never in settings or plaintext
- **Theme-aware UI** — CSS uses `--vscode-*` variables throughout, works in any theme
- **Conversation memory** — rolling 60-entry log in localStorage, surfaced in Settings
- **Onboarding flow** — animated splash → tagline → companion selection on first launch
- **Settings panel** — full-height slide-in overlay with 6 accordion sections
- **Companion switching** — swap between VRM models from Settings without reloading

---

## Meet Yuriko

Yuriko is the personality layer. She is:

- **Sarcastic** but caring
- **Expressive** — her avatar reacts emotionally to what she says
- **Opinionated** — max 2 sentences, no markdown, no fluff, plain spoken words only
- **Reactive** — she uses `[playful]` and `[whisper]` inline for delivery variation

Every reply she sends ends with one emotion tag (e.g. `[emotion:joy]`). The tag is stripped before TTS so she sounds natural, but her avatar reacts to it immediately.

---

## Requirements

### 1. SoX — Audio Capture Engine

`node-record-lpcm16` shells out to the `sox` / `rec` binary for mic recording.

| Platform | Install |
|---|---|
| macOS | `brew install sox` |
| Linux | `sudo apt install sox` |
| Windows | [sox.sourceforge.net](http://sox.sourceforge.net) |

> On macOS the extension auto-injects `/opt/homebrew/bin` and `/usr/local/bin` into `PATH` so VS Code can find the binary even when launched from the app icon.

### 2. Groq API Key

Free at [console.groq.com](https://console.groq.com). Paste it on first launch — it is stored in VS Code SecretStorage and never written to disk or settings.

### 3. Accept Orpheus TTS Terms

One-time step required before TTS works. Click here:
[Accept Orpheus Terms](https://console.groq.com/playground?model=canopylabs%2Forpheus-v1-english)

---

## Setup

```bash
# Install dependencies
npm install

# Build the VRM scene bundle (Three.js + @pixiv/three-vrm → single IIFE)
npm run bundle

# Compile TypeScript
npm run compile

# Or watch mode during development
npm run watch
```

Press **F5** in VS Code to launch the Extension Development Host. Yuriko appears in the sidebar.

> **Important:** any time you edit `media/vrm-scene-src.js`, you must re-run `npm run bundle` — the webview loads `media/vrm-bundle.js`, not the source file directly. If `window.YurikoVRM` is undefined at runtime, the bundle is stale.

---

## Build & Package

```bash
# Bundle VRM scene only
npm run bundle

# TypeScript only
npm run compile

# Full production build (bundle + compile)
npm run vscode:prepublish

# Package as .vsix for distribution
npm run package
```

---

## Architecture

```
Extension Host (Node.js)              Webview (HTML/JS sandbox)
──────────────────────────            ──────────────────────────
src/extension.ts                      webview/index.html
src/panel.ts          ←─ postMsg ─→   media/main.js
src/groqClient.ts                      media/vrm-bundle.js   ← esbuild IIFE
src/audioCapture.ts                    media/style.css
src/secretManager.ts
```

All mic I/O runs in the Extension Host (Node.js). `getUserMedia` and Web Speech API do not work inside VS Code webviews. The webview handles rendering, UI state, Web Audio playback, and the Three.js VRM scene only.

Communication is entirely via `postMessage` — the Extension Host and Webview are isolated and can only exchange serialisable JSON messages.

---

## UI Flow

### First Launch (onboarding)

```
Splash screen  →  (2.2s auto-advance)
     ↓
"made for developers" tagline  →  (2.2s auto-advance)
     ↓
Companion selection  →  (user picks a card)
     ↓
Main shell built  →  WEBVIEW_READY sent  →  checkInitialKey()
     ↓
  [no key]  →  API key overlay shown
  [key exists]  →  LOADING overlay  →  Groq init  →  VOICE_UI
```

`prefs.firstTimeDone` is written to localStorage when the user picks a companion. On subsequent launches, `buildShell()` is called directly, skipping onboarding entirely.

### Main Shell Layout

```
┌─────────────────────────────┐
│  VRM viewport (flex:1)      │  ← Three.js canvas fills this
│                             │
│  [settings ⚙]  top-right   │  ← 32px circular button
│                             │
│  [toast overlays]           │  ← user/yuriko speech bubbles
└─────────────────────────────┘
│  input-pill                 │  ← [🎤] [text input] [↑]
└─────────────────────────────┘
```

Overlays (API key card, loading spinner) sit above the viewport in the same stacking context. The shell DOM is built once and never torn down — overlays are toggled with `display:none/flex`.

### Settings Panel

Right-side full-height slide-in panel. Six accordion sections:

| Section | Controls |
|---|---|
| Companion | Rename companion, personality dropdown (Friendly / Professional / Casual / Sarcastic), change companion button |
| Memory | Enable/disable toggle, last 8 conversation lines preview, clear button |
| Voice | Enable/disable toggle, speed slider (0.5×–2×), voice dropdown (Diana, Tara, Leah, Jess, Zac) |
| Appearance | Theme chips (VS Code / Light / Dark), character size chips (S / M / L), background color swatches + custom color picker |
| API / Account | API key input + save, model dropdown (Llama 3.3 70B / Llama 3.1 8B / Mixtral 8x7B), clear key button |
| About | Version, Orpheus TTS terms link, Groq console link |

All preferences persist to `localStorage` under `panda_*` keys and are read back on every launch.

---

## Source Files

| File | What it does |
|---|---|
| `src/extension.ts` | Entry point — registers `PandaPanel` as a sidebar `WebviewViewProvider` and the `panda.start` command |
| `src/panel.ts` | Main orchestrator — routes all postMessages, manages STT → LLM → TTS pipeline, owns `isBusy` flag |
| `src/groqClient.ts` | All Groq API calls: Whisper transcription, Llama 3.3 streaming, Orpheus TTS synthesis, emotion tag parsing |
| `src/audioCapture.ts` | Mic recording via `node-record-lpcm16` → temp WAV file in `os.tmpdir()` |
| `src/secretManager.ts` | Thin wrapper around `vscode.SecretStorage` for storing and retrieving the Groq API key |
| `media/main.js` | Webview JS — onboarding flow, persistent shell DOM, settings panel, preferences system, conversation memory, VRM init, audio playback + RMS lip sync feed |
| `media/vrm-scene-src.js` | Three.js + `@pixiv/three-vrm` scene source — VRM loading, 5-layer expression engine, micro-expressions, auto-blink, gaze, idle body motion, VRMA animation |
| `media/vrm-bundle.js` | esbuild IIFE output of `vrm-scene-src.js` — what the webview actually loads. Exposes `window.YurikoVRM` |
| `media/style.css` | All webview styles — CSS custom properties, light/dark theme overrides, onboarding animations, companion cards, settings accordion |
| `webview/index.html` | HTML shell — CSP with nonce injection, loads `vrm-bundle.js` then `main.js` |

---

## postMessage Protocol

| Direction | Message type | Payload | What it does |
|---|---|---|---|
| Webview → Host | `WEBVIEW_READY` | — | Shell is built and ready; triggers `checkInitialKey()` |
| Webview → Host | `SAVE_API_KEY` | `{ key }` | Save API key to SecretStorage and reconnect |
| Webview → Host | `CLEAR_API_KEY` | — | Wipe key from SecretStorage, null client, show API_KEY screen |
| Webview → Host | `REQUEST_VRM` | `{ companion }` | Ask for webview-safe VRM + VRMA URIs for the given companion id |
| Webview → Host | `START_LISTENING` | — | Begin mic recording |
| Webview → Host | `STOP_LISTENING` | — | Stop recording, kick off STT → LLM → TTS |
| Webview → Host | `SEND_TEXT` | `{ text }` | Send typed text directly to LLM |
| Webview → Host | `TTS_DONE` | — | Audio playback finished, release `isBusy` |
| Webview → Host | `OPEN_SETTINGS` | — | (Legacy) open VS Code quick-pick for key management |
| Webview → Host | `START_CLICKED` | — | (Legacy) user hit get-started on old start screen |
| Host → Webview | `SHOW_SCREEN` | `{ screen }` | Navigate to `START`, `API_KEY`, `LOADING`, or `VOICE_UI` |
| Host → Webview | `SHOW_ERROR` | `{ message }` | Show error toast |
| Host → Webview | `LOAD_VRM` | `{ vrmUri, vrmaUri }` | Webview-safe URIs for the VRM model and intro VRMA animation |
| Host → Webview | `SET_STATE` | `{ state }` | Drive UI + avatar state: `idle`, `listening`, `processing`, `speaking`, `error` |
| Host → Webview | `USER_SAID` | `{ text }` | Show user's transcript as toast + write to memory |
| Host → Webview | `LLM_WORD_CHUNK` | `{ word }` | Individual streamed word (currently no-op in UI — reserved) |
| Host → Webview | `LLM_DONE` | — | Full LLM response is complete |
| Host → Webview | `YURIKO_SAID` | `{ text, emotion }` | Show Yuriko's reply as toast, write to memory, drive avatar emotion |
| Host → Webview | `PLAY_AUDIO` | `{ audioBase64, mimeType }` | Base64 WAV to decode and play; respects `prefs.voiceEnabled` and `prefs.voiceSpeed` |
| Host → Webview | `ERROR` | `{ message }` | Inline error shown as system toast |

---

## Preferences System

All user preferences live in `localStorage` under `panda_*` keys. The `prefs` object in `media/main.js` provides typed getters/setters that write through immediately.

| Key | Default | What it controls |
|---|---|---|
| `panda_ftd` | `'0'` | First-time done flag (skips onboarding) |
| `panda_companion` | `'yuriko'` | Active companion id |
| `panda_cname` | `'Yuriko'` | Display name (editable in Settings) |
| `panda_personality` | `'friendly'` | Personality tone (wired to LLM system prompt — future) |
| `panda_mem_on` | `'1'` | Memory enabled toggle |
| `panda_voice_on` | `'1'` | TTS playback toggle |
| `panda_vspeed` | `'1.0'` | Playback rate for Web Audio (0.5–2) |
| `panda_vname` | `'diana'` | Orpheus voice name |
| `panda_theme` | `'vscode'` | Theme: `vscode`, `light`, or `dark` |
| `panda_csize` | `'medium'` | Character size: `small`, `medium`, or `large` |
| `panda_bg` | `''` | Custom viewport background color |
| `panda_model` | `'llama-3.3-70b-versatile'` | LLM model (wired to Groq call — future) |
| `panda_memory` | `'[]'` | Rolling 60-entry conversation log (JSON array) |

---

## Conversation Memory

Memory is a rolling JSON array stored in `panda_memory`. Each entry is `{ role, text, t }`.

- Max 60 entries — oldest is dropped when the limit is reached.
- Both `USER_SAID` and `YURIKO_SAID` messages trigger a `memAdd()` call.
- The Settings → Memory section shows the last 8 exchanges as a live preview.
- `memClear()` wipes the array; the clear button in Settings is disabled when the array is empty.
- Memory is only written when `prefs.enableMemory` is `true`.

> Memory is stored client-side only. It is not sent to Groq unless explicitly passed with a `SEND_TEXT` message (future work).

---

## Emotion System

### How it works

1. The LLM system prompt instructs Yuriko to end every reply with exactly one `[emotion:X]` tag.
2. `groqClient.ts` parses the tag out of the full streamed response with a regex.
3. The clean text (tag stripped) goes to TTS. The emotion name goes to the webview as part of `YURIKO_SAID`.
4. If the LLM omits the tag, `main.js` runs `analyzeSentiment()` — a keyword regex fallback — over the reply text.
5. The webview calls `window.YurikoVRM.setSentiment(emotionName)` which blends the avatar's expressions toward that emotion's profile.

### Available emotions

| Tag | Face it drives | Typical trigger |
|---|---|---|
| `joy` | Big open smile (happy 0.9) | laughing, loving something |
| `excited` | Wide eyes + huge smile | wow, can't believe it |
| `fun` | Smirk / soft smile (relaxed 0.92) | goofing, jokes |
| `smirk` | Sly self-satisfied look | stating the obvious, smug |
| `suspicious` | Narrowed brow (angry 0.62) | judging, not buying it |
| `teasing` | Smirk + hint of surprise | playful jab, banter |
| `confident` | Composed smirk | assertive, matter-of-fact |
| `angry` | Furrowed brow (angry 0.9) | frustrated, mad |
| `sad` | Down-turned mouth (sad 0.82) | genuine sadness |
| `apologetic` | Sad + touch of surprise | sorry, can't do it |
| `empathetic` | Soft sadness + warmth | understanding pain |
| `calm` | Relaxed, composed | informational, explaining |
| `question` | Wide eyes, slightly happy | curious, wondering |

---

## VRM Expression Engine (5 Layers)

All expression blending happens in `media/vrm-scene-src.js` at ~60fps.

### Layer 1 — State Profile (ambient baseline)

A moderate baseline per conversation phase (`idle`, `listening`, `processing`, `speaking`, `error`). Each state has base slider values, oscillation frequencies, amplitude, and blend speed. Kept intentionally moderate (0.07–0.58) so the emotion layer can dominate when active.

### Layer 2 — Emotion Profile (dominant)

When `setSentiment()` is called, `_emotionBlend` ramps from 0 → 1 over ~300ms (rate: 3.5/s). The result is a lerp from the state profile toward the emotion profile. When cleared, it fades back at 1.5/s.

### Layer 3 — Organic Oscillation

A two-frequency sine oscillation is multiplied over both the state and emotion profiles so the face breathes and feels alive rather than locked.

### Layer 4 — Micro-Expressions

Brief high-intensity flickers (22ms–600ms) are layered on top additively, capped at 1.0. Each micro has:
- `states` — which conversation phases it can fire in
- `emotions` (optional) — only fires when that emotion is active and blended in past 40%
- `gap` range — randomised wait between micros
- `fadeIn` / `fadeOut` / `dur` timings

### Layer 5 — Lip Sync Mouth Isolation

While phonemes (`aa`, `ee`, `ih`, `oh`, `ou`) are active, mouth-affecting shapes (happy, sad, surprised, angry) are faded to 50% so the emotion still shows in the eyes and brows, but phonemes own the jaw opening.

### Blink

Randomised two-phase blink (close / open). Next blink fires 2.5–7.5s after the last. Speed randomised per blink (50–90ms per phase).

### Gaze

Per-state eye target positions. Smoothed with lerp at 2.5/s toward the desired position. In `idle` and `speaking` states the target drifts on a slow sine to simulate natural eye movement.

### Idle Body Motion

After the intro VRMA animation finishes (`_vrmaDone = true`), subtle procedural motion drives head, neck, chest, and spine bones with sine waves at different frequencies for a breathing/swaying feel.

---

## Models

| Task | Model | Notes |
|---|---|---|
| Speech-to-Text | `whisper-large-v3-turbo` | English only (`language: 'en'`) |
| Language Model | `llama-3.3-70b-versatile` | Streamed, max 150 tokens, system prompt enforces 2-sentence replies |
| Text-to-Speech | `canopylabs/orpheus-v1-english` | Voice: `diana`, output: WAV, `[playful]` and `[whisper]` tags supported |

Additional models selectable in Settings → API/Account (stored in `panda_model`, wired to Groq call in future):

| Option | Model ID |
|---|---|
| Llama 3.3 70B (default) | `llama-3.3-70b-versatile` |
| Llama 3.1 8B (fast) | `llama-3.1-8b-instant` |
| Mixtral 8x7B | `mixtral-8x7b-32768` |

---

## Security

- **API key** stored via `vscode.SecretStorage` under the key `panda.groqKey`. Never written to disk, settings, or environment variables.
- **CSP** is set on the webview HTML at render time via `webview.cspSource` and a per-session nonce. Scripts only execute with the correct nonce. `connect-src` covers only webview resource URIs, `blob:`, `data:`, and `https:` (needed for GLTFLoader fetches).
- **localResourceRoots** explicitly allows only `media/`, `webview/`, and `modelfiles/` — the webview cannot access anything else on disk.
- **Extension Host isolation** — all Groq API calls and mic access happen in Node.js, fully isolated from the webview sandbox.
- **API key validation** — the webview validates that keys start with `gsk_` before sending a `SAVE_API_KEY` message; a bad key clears itself from SecretStorage on failed init so it does not linger.

---

## File Structure

```
project-panda/
├── src/
│   ├── extension.ts          # VS Code entry point
│   ├── panel.ts              # Main orchestrator + message router
│   ├── groqClient.ts         # Groq API: STT + LLM + TTS + emotion parsing
│   ├── audioCapture.ts       # Mic recording via SoX → temp WAV
│   ├── secretManager.ts      # VS Code SecretStorage wrapper
│   └── node-record-lpcm16.d.ts
├── media/
│   ├── vrm-scene-src.js      # Three.js + VRM scene (source — edit this)
│   ├── vrm-bundle.js         # esbuild IIFE output — loaded by webview (rebuild after edits)
│   ├── main.js               # Webview UI: onboarding, shell, settings, audio playback
│   ├── style.css             # VS Code theme-aware styles
│   ├── icon.png
│   └── panda-icon.svg
├── webview/
│   └── index.html            # HTML shell with CSP nonce injection
├── modelfiles/
│   ├── female.vrm            # Yuriko's 3D VRM model
│   ├── male.vrm              # Male companion model
│   └── VRMA_MotionPack/
│       └── vrma/
│           ├── showfullbody.vrma   # Intro animation (plays once on load)
│           ├── greeting.vrma
│           ├── spin.vrma
│           └── ...
├── out/                      # tsc output (gitignored)
├── package.json
├── tsconfig.json
└── CLAUDE.md
```

---

## Known Gotchas

- **Rebuild the bundle after editing the VRM scene.** The webview loads `media/vrm-bundle.js` (the esbuild output). Editing `media/vrm-scene-src.js` has no effect until you run `npm run bundle` again. If `window.YurikoVRM` is `undefined` at runtime, the bundle is stale.
- **SoX must be on PATH.** If VS Code is launched from the app icon on macOS, it may not inherit your shell PATH. The extension injects `/opt/homebrew/bin` and `/usr/local/bin` automatically, but if SoX is installed elsewhere, mic input will silently fail.
- **Orpheus terms must be accepted once.** If TTS returns a 400 with a terms/consent message, the extension surfaces: *"Accept Orpheus terms at console.groq.com first."*
- **Rate limits.** Groq free tier has rate limits. If a 429 is hit mid-pipeline, the error is caught and shown as *"Rate limit hit, please wait a moment."*
- **`retainContextWhenHidden: true`** is set on the webview — the VRM scene and Web Audio context persist when the sidebar is hidden, avoiding a re-init cycle each time the panel is toggled.
- **WEBVIEW_READY timing.** `checkInitialKey()` is only triggered by the `WEBVIEW_READY` message (sent from `buildShell()` once the DOM is ready), not from `resolveWebviewView()`. This prevents a race where the host checks SecretStorage before the webview JS has run.
- **Screen queue.** If the host sends a `SHOW_SCREEN` message while onboarding is still running (before `buildShell()` completes), it is stored in `queuedScreen` and applied the moment the shell is ready.
- **Companion model switching.** Selecting a new companion from Settings sends `REQUEST_VRM` with the companion id. `panel.ts` maps `'male'` → `male.vrm` and anything else → `female.vrm`. The VRM scene calls `load()` again on the existing renderer — no page reload needed.

---

## Animal Kingdom Series

| # | Project | Status |
|---|---|---|
| Vol. 1 | **Panda** — Voice AI Companion | Active |
| Vol. 2 | Coming soon... | Locked |
| Vol. 3 | Coming soon... | Locked |

---

<div align="center">

Built by [Venkatesh Annabathina](https://venkateshannabathina.in) · [@venkateshannabathina](https://github.com/venkateshannabathina)

*Part of the Animal Kingdom VS Code Extension Series*

</div>
