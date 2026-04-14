const vscode = acquireVsCodeApi();
const app    = document.getElementById('app');

let audioCtx = null;

// ── SCREEN RENDERS ────────────────────────────────────────

function renderStartScreen() {
  app.innerHTML = `
    <div class="start-screen">
      <div class="start-orb">
        <div class="start-mic">
          <svg viewBox="0 0 24 24" fill="none">
            <rect x="8" y="2" width="8" height="13" rx="4"
              stroke="currentColor" stroke-width="1.5"/>
            <path d="M5 11a7 7 0 0 0 14 0"
              stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            <line x1="12" y1="18" x2="12" y2="22"
              stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            <line x1="8" y1="22" x2="16" y2="22"
              stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </div>
      </div>
      <div class="start-title">yuriko</div>
      <div class="start-sub">voice ai · groq powered</div>
      <div style="height:8px"></div>
      <button class="btn" id="start-btn">get started</button>
    </div>
  `;
  document.getElementById('start-btn').addEventListener('click', () => {
    vscode.postMessage({ type: 'START_CLICKED' });
  });
}

function renderApiKeyScreen() {
  app.innerHTML = `
    <div class="apikey-screen">
      <span class="lock-icon">🔒</span>
      <div class="field-label">groq api key</div>
      <input class="input-field" id="api-key-input" type="password"
        placeholder="gsk_••••••••••••" autocomplete="off" spellcheck="false" />
      <div class="field-hint">stored in vscode SecretStorage<br/>never leaves your machine</div>
      <div class="error-msg" id="api-error" style="display:none"></div>
      <button class="btn" id="submit-key-btn" style="margin-top:4px">confirm</button>
    </div>
  `;

  document.getElementById('submit-key-btn').addEventListener('click', () => {
    const input   = document.getElementById('api-key-input').value.trim();
    const errorEl = document.getElementById('api-error');
    if (!input || !input.startsWith('gsk_')) {
      errorEl.textContent   = 'must start with gsk_';
      errorEl.style.display = 'block';
      return;
    }
    errorEl.style.display = 'none';
    vscode.postMessage({ type: 'SAVE_API_KEY', key: input });
  });

  document.getElementById('api-key-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') document.getElementById('submit-key-btn').click();
  });
}

function renderLoadingScreen() {
  app.innerHTML = `
    <div class="loading-screen">
      <div class="loading-orb"><div class="loading-spin"></div></div>
      <div class="loading-txt">initializing...</div>
    </div>
  `;
}

// ── VOICE UI ──────────────────────────────────────────────

function renderVoiceUI() {
  app.dataset.state = 'idle';
  app.innerHTML = `
    <!-- VRM canvas — fills all space above input bar -->
    <div class="vrm-viewport" id="vrm-viewport">
      <canvas id="vrm-canvas"></canvas>
      <div class="vrm-loading" id="vrm-loading">
        <div class="loading-spin"></div>
        <span id="vrm-pct">loading model…</span>
      </div>

      <!-- Floating toast messages overlaid on VRM -->
      <div class="toast-overlay" id="toast-overlay"></div>

      <!-- Settings gear — top-right corner -->
      <button class="gear-btn" id="settings-btn" title="settings">
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <circle cx="6.5" cy="6.5" r="2" stroke="currentColor" stroke-width="1.1"/>
          <path d="M6.5 1v1.2M6.5 10.8V12M1 6.5h1.2M10.8 6.5H12
                   M2.4 2.4l.85.85M9.75 9.75l.85.85
                   M10.6 2.4l-.85.85M3.25 9.75l-.85.85"
            stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        </svg>
      </button>
    </div>

    <!-- Bottom input bar -->
    <div class="input-bar">
      <div class="input-inner">

        <!-- Mic icon — tap to speak -->
        <button class="icon-btn mic-btn" id="mic-btn" title="speak">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <rect x="8" y="2" width="8" height="13" rx="4"
              stroke="currentColor" stroke-width="1.5"/>
            <path d="M5 11a7 7 0 0 0 14 0"
              stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            <line x1="12" y1="18" x2="12" y2="22"
              stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            <line x1="8" y1="22" x2="16" y2="22"
              stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>

        <!-- Text input -->
        <input class="text-input" id="text-input"
          type="text" placeholder="Ask anything…"
          autocomplete="off" spellcheck="false" />

        <!-- Send / up arrow -->
        <button class="send-btn" id="send-btn">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <path d="M12 19V5M5 12l7-7 7 7"
              stroke="currentColor" stroke-width="2.2"
              stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>

      </div>
    </div>
  `;

  document.getElementById('settings-btn').addEventListener('click', () => {
    vscode.postMessage({ type: 'OPEN_SETTINGS' });
  });
  document.getElementById('mic-btn').addEventListener('click', toggleMic);

  function sendText() {
    const input = document.getElementById('text-input');
    const text = input?.value?.trim();
    if (!text) return;
    input.value = '';
    vscode.postMessage({ type: 'SEND_TEXT', text });
  }

  document.getElementById('send-btn').addEventListener('click', sendText);
  document.getElementById('text-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(); }
  });

  // VRM progress event from scene loader
  window.addEventListener('vrm-progress', (e) => {
    const pct = document.getElementById('vrm-pct');
    if (pct) pct.textContent = `loading model… ${e.detail}%`;
  });

  initVRM();
}

function renderErrorScreen(message) {
  app.innerHTML = `
    <div class="error-screen">
      <div class="error-screen-msg">${message}</div>
      <button class="btn-ghost" id="retry-btn">try again</button>
    </div>
  `;
  document.getElementById('retry-btn').addEventListener('click', renderApiKeyScreen);
}

// ── VRM INIT ──────────────────────────────────────────────

function initVRM() {
  const canvas   = document.getElementById('vrm-canvas');
  const viewport = document.getElementById('vrm-viewport');
  if (!canvas || !viewport) return;

  canvas.width  = viewport.clientWidth  || 300;
  canvas.height = viewport.clientHeight || 480;

  if (window.YurikoVRM) {
    window.YurikoVRM.init(canvas);
  }

  vscode.postMessage({ type: 'REQUEST_VRM' });
}

async function loadVRM(vrmUri, vrmaUri) {
  if (!window.YurikoVRM) return;
  const loadingEl = document.getElementById('vrm-loading');
  try {
    await window.YurikoVRM.load(vrmUri);
    if (loadingEl) loadingEl.style.display = 'none';
    if (vrmaUri) await window.YurikoVRM.loadAnimation(vrmaUri);
  } catch (err) {
    console.error('VRM load failed:', err);
    if (loadingEl) {
      loadingEl.querySelector('#vrm-pct').textContent = 'model load failed';
    }
  }
}

// ── MIC LOGIC ─────────────────────────────────────────────

function toggleMic() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();

  const state = app.dataset.state;
  if (state === 'idle' || state === 'error') {
    vscode.postMessage({ type: 'START_LISTENING' });
  } else if (state === 'listening') {
    vscode.postMessage({ type: 'STOP_LISTENING' });
  }
}

// ── UI STATE ──────────────────────────────────────────────

function setUIState(state) {
  app.dataset.state = state;

  const input = document.getElementById('text-input');
  if (input) {
    const busy = state === 'listening' || state === 'processing' || state === 'speaking';
    input.disabled = busy;
    input.placeholder = {
      idle:       'Ask anything…',
      listening:  'Listening…',
      processing: 'Thinking…',
      speaking:   'Speaking…',
      error:      'Something went wrong',
    }[state] ?? 'Ask anything…';
  }

  if (window.YurikoVRM) window.YurikoVRM.setExpression(state);
}

// ── TOAST MESSAGES ────────────────────────────────────────

function showToast(role, text) {
  const overlay = document.getElementById('toast-overlay');
  if (!overlay) return;

  const el = document.createElement('div');
  el.className = `toast-msg toast-msg--${role}`;
  el.textContent = text;
  overlay.appendChild(el);

  // Auto-remove after 4 s
  setTimeout(() => {
    el.style.animation = 'toastOut 0.4s ease-out forwards';
    el.addEventListener('animationend', () => el.remove());
  }, 4000);

  // Keep only last 3 toasts
  const all = overlay.querySelectorAll('.toast-msg');
  if (all.length > 3) all[0].remove();
}

// ── MESSAGE HANDLER ───────────────────────────────────────

window.addEventListener('message', async (e) => {
  const msg = e.data;
  switch (msg.type) {

    case 'SHOW_SCREEN':
      if      (msg.screen === 'START')    renderStartScreen();
      else if (msg.screen === 'API_KEY')  renderApiKeyScreen();
      else if (msg.screen === 'LOADING')  renderLoadingScreen();
      else if (msg.screen === 'VOICE_UI') renderVoiceUI();
      break;

    case 'SHOW_ERROR':
      renderErrorScreen(msg.message);
      break;

    case 'SET_STATE':
      setUIState(msg.state);
      if (msg.state === 'idle' && window.YurikoVRM) window.YurikoVRM.setSentiment(null);
      break;

    case 'LOAD_VRM':
      await loadVRM(msg.vrmUri, msg.vrmaUri);
      break;

    case 'USER_SAID':
      showToast('user', msg.text);
      break;

    case 'LLM_WORD_CHUNK':
      // no-op: full reply sent via BUDDY_SAID
      break;

    case 'LLM_DONE':
      break;

    case 'YURIKO_SAID':
      showToast('yuriko', msg.text);
      if (window.YurikoVRM) {
        // Use the emotion tag the LLM embedded in its reply.
        // Fall back to keyword analysis if the model didn't include a tag.
        const emotion = msg.emotion || analyzeSentiment(msg.text);
        window.YurikoVRM.setSentiment(emotion);
      }
      break;

    case 'PLAY_AUDIO':
      await playAudio(msg.audioBase64);
      break;

    case 'ERROR': {
      console.error('Extension error:', msg.message);
      const ph = document.getElementById('input-placeholder');
      if (ph) { ph.textContent = msg.message; ph.classList.add('active'); }
      setUIState('error');
      break;
    }
  }
});

// ── AUDIO PLAYBACK ────────────────────────────────────────

async function playAudio(base64Data) {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  const binary = atob(base64Data);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  try {
    const decoded = await audioCtx.decodeAudioData(bytes.buffer);
    const source  = audioCtx.createBufferSource();
    source.buffer = decoded;

    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;          // smaller = ~6ms window, much more responsive
    analyser.smoothingTimeConstant = 0; // no built-in smoothing, we handle it ourselves
    source.connect(analyser);
    analyser.connect(audioCtx.destination);

    const data = new Uint8Array(analyser.fftSize);
    let isPlaying = true;

    function tick() {
      analyser.getByteTimeDomainData(data);
      // RMS amplitude — much smoother and more accurate than raw max
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128.0;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      if (window.YurikoVRM) window.YurikoVRM.setLipSync(rms);
      if (isPlaying) requestAnimationFrame(tick);
    }

    source.onended = () => {
      isPlaying = false;
      if (window.YurikoVRM) window.YurikoVRM.setLipSync(0);
      vscode.postMessage({ type: 'TTS_DONE' });
    };

    source.start(0);
    tick();

  } catch (err) {
    console.error('Audio decode error:', err);
    vscode.postMessage({ type: 'TTS_DONE' });
  }
}

// ── SENTIMENT ANALYSIS ───────────────────────────────────
// Keyword pass over Yuriko's reply text.
// Returns an emotion NAME that maps to EMOTION_PROFILES in vrm-scene-src.js.
//
// Priority (highest → lowest): angry > suspicious > sad/apologetic >
//   excited > joy > fun > smirk > teasing > empathetic > confident > calm > question
//
// Rule: match the STRONGEST signal first and return immediately.
function analyzeSentiment(text) {
  const t = text.toLowerCase();

  // ── ANGRY — full rage/frustration ────────────────────────────────
  if (/\b(angry|furious|rage|outraged|infuriated|irritated|annoyed|mad at|hate|disgusted|unacceptable|ridiculous|outrage)\b/.test(t)) {
    return 'angry';
  }

  // ── SUSPICIOUS — sketchy vibe, judging, not buying it ────────────
  if (/\b(suspicious|fishy|sketchy|strange|weird|odd|doesn't add up|something's off|doubt|skeptical|not convinced|questionable|shady|sus|suss)\b/.test(t)) {
    return 'suspicious';
  }

  // ── APOLOGETIC — sorry with surprise ─────────────────────────────
  if (/\b(sorry|apologize|unfortunately|regret|failed|cannot|can't|unable|my bad|forgive|pardon|mistake|oops)\b/.test(t)) {
    return 'apologetic';
  }

  // ── SAD — genuine sadness ─────────────────────────────────────────
  if (/\b(sad|sorrow|cry|tear|weep|heartache|painful|tragic|awful|terrible|horrible|dreadful|grief|mourn|heartbroken|disappoint)\b/.test(t)) {
    return 'sad';
  }

  // ── EMPATHETIC — warm understanding of pain ───────────────────────
  if (/\b(understand|feel your|empathize|must be hard|difficult time|there for you|support you|with you|i hear you|that sounds rough|hang in there)\b/.test(t)) {
    return 'empathetic';
  }

  // ── EXCITED — omg / shock / disbelief ────────────────────────────
  if (/!!|wow|omg|oh my|unbelievable|mind-?blown|whoa|holy/.test(t) ||
      /\b(excited|thrilled|pumped|ecstatic|can't believe|no way|seriously)\b/.test(t)) {
    return 'excited';
  }

  // ── FUN — playing, goofing, entertainment ────────────────────────
  if (/\b(fun|game|play|joke|haha|lol|hilarious|entertaining|silly|goofy|prank|meme|laugh|cracking up|comedic)\b/.test(t)) {
    return 'fun';
  }

  // ── JOY — warm happiness, love, delight ──────────────────────────
  if (/\b(love|joy|delight|wonderful|amazing|awesome|fantastic|brilliant|perfect|great|happy|cheerful|gleeful|overjoyed|beautiful|incredible)\b/.test(t) ||
      /!/.test(t)) {
    return 'joy';
  }

  // ── SMIRK — sly, smug, clever, ironic ────────────────────────────
  if (/\b(obviously|clearly|of course|naturally|technically|ironic|irony|sarcastic|predictable|well actually|classic|typical|as expected)\b/.test(t)) {
    return 'smirk';
  }

  // ── TEASING — playful jab, gotcha ────────────────────────────────
  if (/\b(just kidding|jk|gotcha|teasing|playful|pulling your leg|kidding|tease|banter|cheeky)\b/.test(t)) {
    return 'teasing';
  }

  // ── CONFIDENT — matter-of-fact, assertive ────────────────────────
  if (/\b(definitely|absolutely|certainly|without a doubt|clearly|precisely|exactly|of course|i know|trust me|guaranteed)\b/.test(t)) {
    return 'confident';
  }

  // ── CALM — informational, composed ───────────────────────────────
  if (/\b(here is|here are|the following|in summary|to summarize|note that|please note|calm|relax|breathe|peace|serene|gentle|chill)\b/.test(t)) {
    return 'calm';
  }

  // ── QUESTION — curious, wondering ────────────────────────────────
  if (/\?/.test(t) || /\b(what|how|why|when|where|which|who|wonder|curious|interesting|fascinating|i wonder)\b/.test(t)) {
    return 'question';
  }

  return null; // no strong signal — state profile drives the face
}

// ── BOOT ─────────────────────────────────────────────────
// Remove diagnostic probe — proves JS is running
const _probe = document.getElementById('js-probe');
if (_probe) _probe.remove();
renderStartScreen();
