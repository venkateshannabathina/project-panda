'use strict';
const vscode = acquireVsCodeApi();

// ─── PREFERENCES (localStorage) ──────────────────────────────────────────────
function pget(k, def) { const v = localStorage.getItem('panda_' + k); return v === null ? def : v; }
function pset(k, v)   { localStorage.setItem('panda_' + k, String(v)); }

const prefs = {
  get firstTimeDone()   { return pget('ftd', '0') === '1'; },
  set firstTimeDone(v)  { pset('ftd', v ? '1' : '0'); },
  get companion()       { return pget('companion', 'yuriko'); },
  set companion(v)      { pset('companion', v); },
  get companionName()   { return pget('cname', 'Yuriko'); },
  set companionName(v)  { pset('cname', v); },
  get personality()     { return pget('personality', 'friendly'); },
  set personality(v)    { pset('personality', v); },
  get enableMemory()    { return pget('mem_on', '1') !== '0'; },
  set enableMemory(v)   { pset('mem_on', v ? '1' : '0'); },
  get voiceEnabled()    { return pget('voice_on', '1') !== '0'; },
  set voiceEnabled(v)   { pset('voice_on', v ? '1' : '0'); },
  get voiceSpeed()      { return parseFloat(pget('vspeed', '1.0')); },
  set voiceSpeed(v)     { pset('vspeed', String(v)); },
  get voiceName()       { return pget('vname', 'diana'); },
  set voiceName(v)      { pset('vname', v); },
  get theme()           { return pget('theme', 'vscode'); },
  set theme(v)          { pset('theme', v); applyTheme(v); },
  get charSize()        { return pget('csize', 'medium'); },
  set charSize(v)       { pset('csize', v); applyCharSize(v); },
  get bgColor()         { return pget('bg', ''); },
  set bgColor(v)        { pset('bg', v); applyBgColor(v); },
  get model()           { return pget('model', 'llama-3.3-70b-versatile'); },
  set model(v)          { pset('model', v); },
};

// ─── RUNTIME STATE ────────────────────────────────────────────────────────────
let audioCtx       = null;
let clientReady    = false;        // groqClient initialised on host side
let shellReady     = false;        // shell DOM built
let queuedScreen   = null;         // SHOW_SCREEN received before shell was ready
let settingsOpen   = false;
let isBusy         = false;        // mirrors host isBusy
let currentUIState = 'idle';
let vrmAnimations  = {};           // all animation URLs keyed by name (from LOAD_VRM)

// ─── MEMORY ───────────────────────────────────────────────────────────────────
function memGet()           { try { return JSON.parse(localStorage.getItem('panda_memory') || '[]'); } catch { return []; } }
function memAdd(role, text) { if (!prefs.enableMemory) return; const m = memGet(); m.push({ role, text, t: Date.now() }); if (m.length > 60) m.shift(); localStorage.setItem('panda_memory', JSON.stringify(m)); }
function memClear()         { localStorage.removeItem('panda_memory'); }
function memSummary() {
  const m = memGet();
  if (!m.length) return 'No conversations remembered yet.';
  return m.slice(-8).map(e => `${e.role === 'user' ? 'You' : prefs.companionName}: ${e.text}`).join('\n');
}

// ─── THEME / SIZE / BG ───────────────────────────────────────────────────────
function applyTheme(t) {
  const app = document.getElementById('app');
  if (!app) return;
  app.dataset.theme = t;
}
function applyCharSize(s) {
  const vp = document.getElementById('vrm-viewport');
  if (!vp) return;
  vp.dataset.csize = s;
}
function applyBgColor(c) {
  const vp = document.getElementById('vrm-viewport');
  if (vp && c) vp.style.setProperty('--vrm-bg', c);
}

// ─── COMPANIONS ───────────────────────────────────────────────────────────────
const COMPANIONS = [
  { id: 'yuriko', name: 'Yuriko', file: 'female.vrm',
    gradient: 'linear-gradient(145deg,#fce4e4 0%,#f5b8b8 55%,#e88080 100%)' },
];

// ─── ONBOARDING ───────────────────────────────────────────────────────────────
function runOnboarding() {
  const app = document.getElementById('app');
  app.innerHTML = '<div id="ob" class="ob-layer"></div>';
  showSplash();
}

function showSplash() {
  const ob = document.getElementById('ob');
  ob.innerHTML = `
    <div class="ob-screen ob-splash" id="ob-splash">
      <div class="ob-logo">
        <span class="ob-logo-text">
          P<span class="ob-logo-a">a</span><span class="ob-logo-n">n</span>d<span class="ob-logo-a">a</span>
        </span>
        <div class="ob-logo-sub">3 D &nbsp;·&nbsp; A I &nbsp;·&nbsp; C O M P A N I O N</div>
      </div>
    </div>`;
  const el = document.getElementById('ob-splash');
  requestAnimationFrame(() => el.classList.add('ob-visible'));
  setTimeout(() => {
    el.classList.remove('ob-visible');
    el.classList.add('ob-out');
    setTimeout(showTagline, 400);
  }, 2200);
}

function showTagline() {
  const ob = document.getElementById('ob');
  ob.innerHTML = `
    <div class="ob-screen ob-tagline" id="ob-tag">
      <p class="ob-tagline-text">&ldquo;made for developers&rdquo;</p>
    </div>`;
  const el = document.getElementById('ob-tag');
  requestAnimationFrame(() => el.classList.add('ob-visible'));
  setTimeout(() => {
    el.classList.remove('ob-visible');
    el.classList.add('ob-out');
    setTimeout(showCompanionSelect, 400);
  }, 2200);
}

function showCompanionSelect(fromSettings) {
  const container = fromSettings
    ? document.getElementById('companion-select-overlay')
    : document.getElementById('ob');

  const html = `
    <div class="ob-screen ob-companions ${fromSettings ? 'ob-companions--settings' : ''}" id="ob-comp">
      ${!fromSettings ? '<p class="ob-comp-title">choose your companion</p>' : ''}
      <div class="ob-comp-grid">
        ${COMPANIONS.map(c => `
          <div class="companion-card" data-id="${c.id}" data-file="${c.file}" style="--card-bg:${c.gradient}">
            <div class="companion-card-circle">
              <span class="companion-card-initial">${c.name[0]}</span>
            </div>
            <span class="companion-card-name">${c.name}</span>
          </div>`).join('')}
        <div class="companion-card companion-card--add" title="Coming soon">
          <div class="companion-card-circle companion-card-circle--add">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </div>
          <span class="companion-card-name">add new</span>
          <span class="companion-card-soon">coming soon</span>
        </div>
      </div>
    </div>`;

  if (fromSettings) {
    container.innerHTML = html;
    container.style.display = 'flex';
    const el = document.getElementById('ob-comp');
    requestAnimationFrame(() => el.classList.add('ob-visible'));
  } else {
    container.innerHTML = html;
    const el = document.getElementById('ob-comp');
    requestAnimationFrame(() => el.classList.add('ob-visible'));
  }

  document.querySelectorAll('.companion-card:not(.companion-card--add)').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.id;
      prefs.companion = id;
      prefs.companionName = COMPANIONS.find(c => c.id === id)?.name || 'Yuriko';
      if (fromSettings) {
        document.getElementById('companion-select-overlay').style.display = 'none';
        vscode.postMessage({ type: 'REQUEST_VRM', companion: id });
      } else {
        prefs.firstTimeDone = true;
        buildShell();
      }
    });
  });

  document.querySelectorAll('.companion-card--add').forEach(card => {
    card.addEventListener('click', () => {
      const tip = card.querySelector('.companion-card-soon');
      if (tip) { tip.style.opacity = '1'; setTimeout(() => { tip.style.opacity = ''; }, 2000); }
    });
  });
}

// ─── SHELL ────────────────────────────────────────────────────────────────────
function buildShell() {
  const app = document.getElementById('app');
  applyTheme(prefs.theme);

  app.innerHTML = `
    <!-- Settings panel -->
    <div id="settings-panel" class="settings-panel" aria-hidden="true">
      <div class="settings-header">
        <span class="settings-title">settings</span>
        <button id="settings-close" class="settings-close" title="Close">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="1" y1="1" x2="13" y2="13"/><line x1="13" y1="1" x2="1" y2="13"/>
          </svg>
        </button>
      </div>
      <div id="settings-body" class="settings-body"></div>
    </div>
    <div id="settings-backdrop" class="settings-backdrop"></div>

    <!-- Companion select overlay (used from settings) -->
    <div id="companion-select-overlay" class="companion-select-overlay" style="display:none"></div>

    <!-- API key overlay -->
    <div id="apikey-overlay" class="apikey-overlay" style="display:none">
      <div class="apikey-card">
        <div class="apikey-icon">🔑</div>
        <p class="apikey-title">groq api key</p>
        <p class="apikey-hint">stored securely in VS Code · never leaves your machine</p>
        <input id="apikey-input" class="apikey-input" type="password"
          placeholder="gsk_••••••••••••" autocomplete="off" spellcheck="false"/>
        <p id="apikey-err" class="apikey-err" style="display:none"></p>
        <button id="apikey-submit" class="btn-primary">save key</button>
        <a class="apikey-link" href="https://console.groq.com" target="_blank">get a free key ↗</a>
      </div>
    </div>

    <!-- Loading overlay -->
    <div id="loading-overlay" class="loading-overlay" style="display:none">
      <div class="loading-spin"></div>
      <p class="loading-txt">connecting…</p>
    </div>

    <!-- VRM viewport -->
    <div id="vrm-viewport" class="vrm-viewport">
      <canvas id="vrm-canvas"></canvas>
      <div id="vrm-loading" class="vrm-loading">
        <div class="loading-spin"></div>
        <span id="vrm-pct">loading model…</span>
      </div>
      <div id="toast-overlay" class="toast-overlay"></div>

      <!-- Settings button -->
      <button id="settings-btn" class="settings-btn" title="Settings">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
          <circle cx="12" cy="12" r="3.2"/>
          <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22
                   M4.93 4.93l1.77 1.77M17.3 17.3l1.77 1.77
                   M19.07 4.93l-1.77 1.77M6.7 17.3l-1.77 1.77"/>
        </svg>
      </button>
    </div>

    <!-- Input bar -->
    <div class="input-bar">
      <div class="input-pill" id="input-pill">
        <button class="mic-btn icon-btn" id="mic-btn" title="Hold to speak">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <rect x="8" y="2" width="8" height="13" rx="4" stroke="currentColor" stroke-width="1.6"/>
            <path d="M5 11a7 7 0 0 0 14 0" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
            <line x1="12" y1="18" x2="12" y2="22" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
            <line x1="8" y1="22" x2="16" y2="22" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          </svg>
        </button>
        <input id="text-input" class="text-input" type="text"
          placeholder="Ask anything…" autocomplete="off" spellcheck="false" disabled/>
        <button id="send-btn" class="send-btn">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" stroke-width="2.2"
              stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
    </div>`;

  // Wire up events
  document.getElementById('settings-btn').addEventListener('click', openSettings);
  document.getElementById('settings-close').addEventListener('click', closeSettings);
  document.getElementById('settings-backdrop').addEventListener('click', closeSettings);
  document.getElementById('mic-btn').addEventListener('click', toggleMic);

  const textInput = document.getElementById('text-input');
  const sendBtn   = document.getElementById('send-btn');

  function sendText() {
    const val = textInput.value.trim();
    if (!val || !clientReady || isBusy) return;
    textInput.value = '';
    vscode.postMessage({ type: 'SEND_TEXT', text: val });
  }
  sendBtn.addEventListener('click', sendText);
  textInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(); }
  });

  window.addEventListener('vrm-progress', e => {
    const el = document.getElementById('vrm-pct');
    if (el) el.textContent = `loading model… ${e.detail}%`;
  });

  // API key overlay wiring
  const akInput  = document.getElementById('apikey-input');
  const akSubmit = document.getElementById('apikey-submit');
  const akErr    = document.getElementById('apikey-err');

  function submitKey() {
    const key = akInput.value.trim();
    if (!key || !key.startsWith('gsk_')) {
      akErr.textContent = 'key must start with gsk_';
      akErr.style.display = 'block';
      return;
    }
    akErr.style.display = 'none';
    akSubmit.disabled = true;
    vscode.postMessage({ type: 'SAVE_API_KEY', key });
  }
  akSubmit.addEventListener('click', submitKey);
  akInput.addEventListener('keydown', e => { if (e.key === 'Enter') submitKey(); });

  // Apply persisted prefs
  applyCharSize(prefs.charSize);
  applyBgColor(prefs.bgColor);

  shellReady = true;
  initVRM();
  vscode.postMessage({ type: 'WEBVIEW_READY' });

  // Apply any screen message that arrived before shell was ready
  if (queuedScreen) {
    applyScreen(queuedScreen);
    queuedScreen = null;
  }
}

// ─── SCREENS ─────────────────────────────────────────────────────────────────
function applyScreen(screen) {
  const loadingOv = document.getElementById('loading-overlay');
  const apikeyOv  = document.getElementById('apikey-overlay');
  const akSubmit  = document.getElementById('apikey-submit');

  switch (screen) {
    case 'START':
      if (loadingOv) loadingOv.style.display = 'none';
      if (apikeyOv)  apikeyOv.style.display  = 'none';
      setClientReady(false);
      break;

    case 'API_KEY':
      if (loadingOv) loadingOv.style.display = 'none';
      if (apikeyOv)  { apikeyOv.style.display = 'flex'; if (akSubmit) akSubmit.disabled = false; }
      setClientReady(false);
      break;

    case 'LOADING':
      if (loadingOv) loadingOv.style.display = 'flex';
      if (apikeyOv)  apikeyOv.style.display  = 'none';
      break;

    case 'VOICE_UI':
      if (loadingOv) loadingOv.style.display = 'none';
      if (apikeyOv)  apikeyOv.style.display  = 'none';
      setClientReady(true);
      break;
  }
}

function setClientReady(ready) {
  clientReady = ready;
  const input = document.getElementById('text-input');
  const mic   = document.getElementById('mic-btn');
  if (input) input.disabled = !ready;
  if (mic)   mic.disabled   = !ready;
  if (input) input.placeholder = ready ? 'Ask anything…' : 'Connecting…';
}

// ─── SETTINGS PANEL ──────────────────────────────────────────────────────────
function openSettings() {
  settingsOpen = true;
  const panel    = document.getElementById('settings-panel');
  const backdrop = document.getElementById('settings-backdrop');
  renderSettingsBody();
  panel.classList.add('settings-panel--open');
  panel.setAttribute('aria-hidden', 'false');
  backdrop.classList.add('settings-backdrop--visible');
}

function closeSettings() {
  settingsOpen = false;
  const panel    = document.getElementById('settings-panel');
  const backdrop = document.getElementById('settings-backdrop');
  panel.classList.remove('settings-panel--open');
  panel.setAttribute('aria-hidden', 'true');
  backdrop.classList.remove('settings-backdrop--visible');
  // Close companion overlay if open
  const co = document.getElementById('companion-select-overlay');
  if (co) co.style.display = 'none';
}

function renderSettingsBody() {
  const body = document.getElementById('settings-body');
  if (!body) return;

  const sections = [
    { id: 'companion', icon: '🧍', label: 'Companion', render: renderCompanionSection },
    { id: 'memory',    icon: '🧠', label: 'Memory',    render: renderMemorySection    },
    { id: 'voice',     icon: '🔊', label: 'Voice',     render: renderVoiceSection     },
    { id: 'appearance',icon: '🎨', label: 'Appearance',render: renderAppearanceSection},
    { id: 'api',       icon: '🔑', label: 'API / Account', render: renderApiSection   },
    { id: 'about',     icon: 'ℹ️', label: 'About',     render: renderAboutSection     },
  ];

  body.innerHTML = sections.map(s => `
    <div class="settings-section" id="ss-${s.id}">
      <button class="settings-section-hdr" data-section="${s.id}">
        <span class="ss-icon">${s.icon}</span>
        <span class="ss-label">${s.label}</span>
        <span class="ss-chevron">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
            <polyline points="2,3.5 5,6.5 8,3.5"/>
          </svg>
        </span>
      </button>
      <div class="settings-section-body" id="ssb-${s.id}" style="display:none"></div>
    </div>`).join('');

  // Accordion toggle
  body.querySelectorAll('.settings-section-hdr').forEach(btn => {
    btn.addEventListener('click', () => {
      const id  = btn.dataset.section;
      const sb  = document.getElementById('ssb-' + id);
      const open = sb.style.display !== 'none';
      // Close all
      body.querySelectorAll('.settings-section-body').forEach(b => { b.style.display = 'none'; });
      body.querySelectorAll('.settings-section-hdr').forEach(b => b.classList.remove('ss-open'));
      if (!open) {
        sb.style.display = 'block';
        btn.classList.add('ss-open');
        sections.find(s => s.id === id)?.render(sb);
      }
    });
  });

  // Auto-open first section
  const firstHdr = body.querySelector('.settings-section-hdr');
  if (firstHdr) firstHdr.click();
}

// ── Section renderers ──────────────────────────────────────────────────────

function renderCompanionSection(el) {
  el.innerHTML = `
    <div class="ss-row">
      <span class="ss-row-label">name</span>
      <input id="ss-cname" class="ss-input" type="text" value="${escHtml(prefs.companionName)}" maxlength="24"/>
    </div>
    <div class="ss-row">
      <span class="ss-row-label">personality</span>
      <select id="ss-cpersonality" class="ss-select">
        <option value="friendly"     ${prefs.personality === 'friendly'     ? 'selected' : ''}>Friendly</option>
        <option value="professional" ${prefs.personality === 'professional' ? 'selected' : ''}>Professional</option>
        <option value="casual"       ${prefs.personality === 'casual'       ? 'selected' : ''}>Casual</option>
        <option value="sarcastic"    ${prefs.personality === 'sarcastic'    ? 'selected' : ''}>Sarcastic</option>
      </select>
    </div>
    <button id="ss-change-companion" class="ss-btn">change companion</button>`;

  el.querySelector('#ss-cname').addEventListener('change', e => { prefs.companionName = e.target.value.trim() || 'Yuriko'; });
  el.querySelector('#ss-cpersonality').addEventListener('change', e => { prefs.personality = e.target.value; });
  el.querySelector('#ss-change-companion').addEventListener('click', () => showCompanionSelect(true));
}

function renderMemorySection(el) {
  const summary = escHtml(memSummary());
  el.innerHTML = `
    <div class="ss-row ss-row--between">
      <span class="ss-row-label">enable memory</span>
      <label class="ss-toggle">
        <input type="checkbox" id="ss-mem-toggle" ${prefs.enableMemory ? 'checked' : ''}/>
        <span class="ss-toggle-track"></span>
      </label>
    </div>
    <div class="ss-mem-summary" id="ss-mem-summary">${summary.replace(/\n/g, '<br>')}</div>
    <button id="ss-clear-mem" class="ss-btn ss-btn--danger" ${memGet().length === 0 ? 'disabled' : ''}>clear memory</button>`;

  el.querySelector('#ss-mem-toggle').addEventListener('change', e => { prefs.enableMemory = e.target.checked; });
  el.querySelector('#ss-clear-mem').addEventListener('click', () => {
    if (!confirm('Clear all conversation memory?')) return;
    memClear();
    el.querySelector('#ss-mem-summary').textContent = 'No conversations remembered yet.';
    el.querySelector('#ss-clear-mem').disabled = true;
  });
}

function renderVoiceSection(el) {
  el.innerHTML = `
    <div class="ss-row ss-row--between">
      <span class="ss-row-label">voice responses</span>
      <label class="ss-toggle">
        <input type="checkbox" id="ss-voice-toggle" ${prefs.voiceEnabled ? 'checked' : ''}/>
        <span class="ss-toggle-track"></span>
      </label>
    </div>
    <div class="ss-row">
      <span class="ss-row-label">speed</span>
      <div class="ss-slider-wrap">
        <input type="range" id="ss-vspeed" class="ss-slider"
          min="0.5" max="2" step="0.1" value="${prefs.voiceSpeed}"/>
        <span id="ss-vspeed-val" class="ss-slider-val">${prefs.voiceSpeed.toFixed(1)}x</span>
      </div>
    </div>
    <div class="ss-row">
      <span class="ss-row-label">voice</span>
      <select id="ss-vname" class="ss-select">
        <option value="diana"   ${prefs.voiceName === 'diana'   ? 'selected' : ''}>Diana</option>
        <option value="tara"    ${prefs.voiceName === 'tara'    ? 'selected' : ''}>Tara</option>
        <option value="leah"    ${prefs.voiceName === 'leah'    ? 'selected' : ''}>Leah</option>
        <option value="jess"    ${prefs.voiceName === 'jess'    ? 'selected' : ''}>Jess</option>
        <option value="zac"     ${prefs.voiceName === 'zac'     ? 'selected' : ''}>Zac</option>
      </select>
    </div>`;

  el.querySelector('#ss-voice-toggle').addEventListener('change', e => { prefs.voiceEnabled = e.target.checked; });
  const speedSlider = el.querySelector('#ss-vspeed');
  const speedVal    = el.querySelector('#ss-vspeed-val');
  speedSlider.addEventListener('input', () => {
    const v = parseFloat(speedSlider.value);
    prefs.voiceSpeed = v;
    speedVal.textContent = v.toFixed(1) + 'x';
  });
  el.querySelector('#ss-vname').addEventListener('change', e => { prefs.voiceName = e.target.value; });
}

function renderAppearanceSection(el) {
  const themes = [
    { val: 'vscode', label: 'VS Code' },
    { val: 'light',  label: 'Light'   },
    { val: 'dark',   label: 'Dark'    },
  ];
  const sizes = [
    { val: 'small',  label: 'S' },
    { val: 'medium', label: 'M' },
    { val: 'large',  label: 'L' },
  ];
  const bgPresets = ['', '#f0f0f5', '#1a1a2e', '#0f2027', '#faf7f2', '#e8f4f8'];

  el.innerHTML = `
    <div class="ss-row ss-row--col">
      <span class="ss-row-label">theme</span>
      <div class="ss-chip-group" id="ss-themes">
        ${themes.map(t => `
          <button class="ss-chip ${prefs.theme === t.val ? 'ss-chip--active' : ''}"
            data-val="${t.val}">${t.label}</button>`).join('')}
      </div>
    </div>
    <div class="ss-row ss-row--col">
      <span class="ss-row-label">character size</span>
      <div class="ss-chip-group" id="ss-sizes">
        ${sizes.map(s => `
          <button class="ss-chip ${prefs.charSize === s.val ? 'ss-chip--active' : ''}"
            data-val="${s.val}">${s.label}</button>`).join('')}
      </div>
    </div>
    <div class="ss-row ss-row--col">
      <span class="ss-row-label">background</span>
      <div class="ss-swatches" id="ss-bg">
        ${bgPresets.map(c => `
          <button class="ss-swatch ${prefs.bgColor === c ? 'ss-swatch--active' : ''}"
            data-val="${c}" style="background:${c || 'linear-gradient(135deg,#f0f0f5,#e0e0ec)'}"
            title="${c || 'default'}"></button>`).join('')}
        <input type="color" id="ss-bg-custom" class="ss-color-pick"
          value="${prefs.bgColor || '#f0f0f5'}" title="Custom color"/>
      </div>
    </div>`;

  el.querySelectorAll('#ss-themes .ss-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      el.querySelectorAll('#ss-themes .ss-chip').forEach(b => b.classList.remove('ss-chip--active'));
      btn.classList.add('ss-chip--active');
      prefs.theme = btn.dataset.val;
    });
  });
  el.querySelectorAll('#ss-sizes .ss-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      el.querySelectorAll('#ss-sizes .ss-chip').forEach(b => b.classList.remove('ss-chip--active'));
      btn.classList.add('ss-chip--active');
      prefs.charSize = btn.dataset.val;
    });
  });
  el.querySelectorAll('#ss-bg .ss-swatch').forEach(btn => {
    btn.addEventListener('click', () => {
      el.querySelectorAll('.ss-swatch').forEach(b => b.classList.remove('ss-swatch--active'));
      btn.classList.add('ss-swatch--active');
      prefs.bgColor = btn.dataset.val;
    });
  });
  el.querySelector('#ss-bg-custom').addEventListener('input', e => {
    el.querySelectorAll('.ss-swatch').forEach(b => b.classList.remove('ss-swatch--active'));
    prefs.bgColor = e.target.value;
  });
}

function renderApiSection(el) {
  el.innerHTML = `
    <div class="ss-row ss-row--col">
      <span class="ss-row-label">groq api key</span>
      <div class="ss-apikey-wrap">
        <input id="ss-apikey" class="ss-input ss-input--mono" type="password"
          placeholder="gsk_••••••••••••" autocomplete="off" spellcheck="false"/>
        <button id="ss-apikey-save" class="ss-btn">save</button>
      </div>
      <span id="ss-apikey-msg" class="ss-hint"></span>
    </div>
    <div class="ss-row">
      <span class="ss-row-label">model</span>
      <select id="ss-model" class="ss-select">
        <option value="llama-3.3-70b-versatile" ${prefs.model === 'llama-3.3-70b-versatile' ? 'selected' : ''}>Llama 3.3 70B</option>
        <option value="llama-3.1-8b-instant"    ${prefs.model === 'llama-3.1-8b-instant'    ? 'selected' : ''}>Llama 3.1 8B (fast)</option>
        <option value="mixtral-8x7b-32768"       ${prefs.model === 'mixtral-8x7b-32768'       ? 'selected' : ''}>Mixtral 8x7B</option>
      </select>
    </div>
    <button id="ss-clear-key" class="ss-btn ss-btn--danger">clear api key</button>`;

  const keyInput = el.querySelector('#ss-apikey');
  const keyMsg   = el.querySelector('#ss-apikey-msg');

  el.querySelector('#ss-apikey-save').addEventListener('click', () => {
    const key = keyInput.value.trim();
    if (!key || !key.startsWith('gsk_')) {
      keyMsg.textContent = 'must start with gsk_';
      keyMsg.style.color = 'var(--red)';
      return;
    }
    vscode.postMessage({ type: 'SAVE_API_KEY', key });
    keyMsg.textContent = 'saved — reconnecting…';
    keyMsg.style.color = 'var(--muted)';
    keyInput.value = '';
  });
  el.querySelector('#ss-model').addEventListener('change', e => { prefs.model = e.target.value; });
  el.querySelector('#ss-clear-key').addEventListener('click', () => {
    if (!confirm('Clear API key? You will need to re-enter it.')) return;
    vscode.postMessage({ type: 'CLEAR_API_KEY' });
    closeSettings();
  });
}

function renderAboutSection(el) {
  el.innerHTML = `
    <div class="ss-about">
      <p class="ss-about-name">Panda <span class="ss-about-ver">v0.1.0</span></p>
      <p class="ss-about-desc">3D AI companion · Animal Kingdom Vol. 1</p>
      <a class="ss-about-link" href="https://console.groq.com/playground?model=canopylabs%2Forpheus-v1-english"
        target="_blank">accept orpheus tts terms ↗</a>
      <a class="ss-about-link" href="https://console.groq.com" target="_blank">groq console ↗</a>
    </div>`;
}

// ─── VRM ─────────────────────────────────────────────────────────────────────
function initVRM() {
  const canvas   = document.getElementById('vrm-canvas');
  const viewport = document.getElementById('vrm-viewport');
  if (!canvas || !viewport) return;
  canvas.width  = viewport.clientWidth  || 300;
  canvas.height = viewport.clientHeight || 480;
  if (window.YurikoVRM) window.YurikoVRM.init(canvas);
  vscode.postMessage({ type: 'REQUEST_VRM', companion: prefs.companion });
}

async function loadVRM(vrmUri, vrmaUri, animations) {
  if (!window.YurikoVRM) return;
  if (animations) vrmAnimations = animations;
  const loadingEl = document.getElementById('vrm-loading');
  try {
    await window.YurikoVRM.load(vrmUri);
    if (loadingEl) loadingEl.style.display = 'none';
    if (vrmaUri) await window.YurikoVRM.loadAnimation(vrmaUri);
  } catch (err) {
    console.error('VRM load failed:', err);
    if (loadingEl) { const pct = loadingEl.querySelector('#vrm-pct'); if (pct) pct.textContent = 'model load failed'; }
  }
}

// ─── MIC ─────────────────────────────────────────────────────────────────────
function toggleMic() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  if (!clientReady || isBusy && currentUIState !== 'listening') return;
  if (currentUIState === 'idle' || currentUIState === 'error') {
    vscode.postMessage({ type: 'START_LISTENING' });
  } else if (currentUIState === 'listening') {
    vscode.postMessage({ type: 'STOP_LISTENING' });
  }
}

// ─── UI STATE ─────────────────────────────────────────────────────────────────
function setUIState(state) {
  currentUIState = state;
  const app = document.getElementById('app');
  if (app) app.dataset.state = state;

  const input = document.getElementById('text-input');
  if (input && clientReady) {
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

// ─── TOASTS ───────────────────────────────────────────────────────────────────
function showToast(role, text) {
  const overlay = document.getElementById('toast-overlay');
  if (!overlay) return;
  const el = document.createElement('div');
  el.className = `toast-msg toast-msg--${role}`;
  el.textContent = text;
  overlay.appendChild(el);
  setTimeout(() => {
    el.style.animation = 'toastOut 0.4s ease-out forwards';
    el.addEventListener('animationend', () => el.remove());
  }, 4500);
  const all = overlay.querySelectorAll('.toast-msg');
  if (all.length > 3) all[0].remove();
}

// ─── AUDIO ────────────────────────────────────────────────────────────────────
async function playAudio(base64Data) {
  if (!prefs.voiceEnabled) { vscode.postMessage({ type: 'TTS_DONE' }); return; }
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  const binary = atob(base64Data);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  try {
    const decoded = await audioCtx.decodeAudioData(bytes.buffer);
    const source  = audioCtx.createBufferSource();
    source.buffer = decoded;
    source.playbackRate.value = prefs.voiceSpeed;

    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0;
    source.connect(analyser);
    analyser.connect(audioCtx.destination);

    const data = new Uint8Array(analyser.fftSize);
    let isPlaying = true;

    function tick() {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128.0; sum += v * v; }
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

// ─── UTIL ─────────────────────────────────────────────────────────────────────
function escHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

// ─── MESSAGE HANDLER ──────────────────────────────────────────────────────────
window.addEventListener('message', async (e) => {
  const msg = e.data;
  switch (msg.type) {

    case 'SHOW_SCREEN':
      if (!shellReady) { queuedScreen = msg.screen; return; }
      applyScreen(msg.screen);
      break;

    case 'SHOW_ERROR':
      if (!shellReady) { buildShell(); }
      showToast('system', msg.message);
      break;

    case 'SET_STATE':
      isBusy = msg.state !== 'idle' && msg.state !== 'error';
      setUIState(msg.state);
      if (msg.state === 'idle' && window.YurikoVRM) window.YurikoVRM.setSentiment(null);
      break;

    case 'LOAD_VRM':
      await loadVRM(msg.vrmUri, msg.vrmaUri, msg.animations);
      break;

    case 'USER_SAID':
      memAdd('user', msg.text);
      showToast('user', msg.text);
      break;

    case 'LLM_WORD_CHUNK':
      break;

    case 'LLM_DONE':
      break;

    case 'YURIKO_SAID':
      memAdd('yuriko', msg.text);
      showToast('yuriko', msg.text);
      if (window.YurikoVRM) {
        const emotion = msg.emotion || analyzeSentiment(msg.text);
        window.YurikoVRM.setSentiment(emotion);
      }
      break;

    case 'PLAY_AUDIO':
      await playAudio(msg.audioBase64);
      break;

    case 'ERROR': {
      console.error('Extension error:', msg.message);
      showToast('system', msg.message);
      setUIState('error');
      isBusy = false;
      break;
    }
  }
});

// ─── SENTIMENT ANALYSIS ───────────────────────────────────────────────────────
function analyzeSentiment(text) {
  const t = text.toLowerCase();
  if (/\b(angry|furious|rage|outraged|infuriated|irritated|annoyed|mad at|hate|disgusted|unacceptable|ridiculous|outrage)\b/.test(t)) return 'angry';
  if (/\b(suspicious|fishy|sketchy|strange|weird|odd|doesn't add up|something's off|doubt|skeptical|not convinced|questionable|shady|sus|suss)\b/.test(t)) return 'suspicious';
  if (/\b(sorry|apologize|unfortunately|regret|failed|cannot|can't|unable|my bad|forgive|pardon|mistake|oops)\b/.test(t)) return 'apologetic';
  if (/\b(sad|sorrow|cry|tear|weep|heartache|painful|tragic|awful|terrible|horrible|dreadful|grief|mourn|heartbroken|disappoint)\b/.test(t)) return 'sad';
  if (/\b(understand|feel your|empathize|must be hard|difficult time|there for you|support you|with you|i hear you|that sounds rough|hang in there)\b/.test(t)) return 'empathetic';
  if (/!!|wow|omg|oh my|unbelievable|mind-?blown|whoa|holy/.test(t) || /\b(excited|thrilled|pumped|ecstatic|can't believe|no way|seriously)\b/.test(t)) return 'excited';
  if (/\b(fun|game|play|joke|haha|lol|hilarious|entertaining|silly|goofy|prank|meme|laugh|cracking up|comedic)\b/.test(t)) return 'fun';
  if (/\b(love|joy|delight|wonderful|amazing|awesome|fantastic|brilliant|perfect|great|happy|cheerful|gleeful|overjoyed|beautiful|incredible)\b/.test(t) || /!/.test(t)) return 'joy';
  if (/\b(obviously|clearly|of course|naturally|technically|ironic|irony|sarcastic|predictable|well actually|classic|typical|as expected)\b/.test(t)) return 'smirk';
  if (/\b(just kidding|jk|gotcha|teasing|playful|pulling your leg|kidding|tease|banter|cheeky)\b/.test(t)) return 'teasing';
  if (/\b(definitely|absolutely|certainly|without a doubt|clearly|precisely|exactly|of course|i know|trust me|guaranteed)\b/.test(t)) return 'confident';
  if (/\b(here is|here are|the following|in summary|to summarize|note that|please note|calm|relax|breathe|peace|serene|gentle|chill)\b/.test(t)) return 'calm';
  if (/\?/.test(t) || /\b(what|how|why|when|where|which|who|wonder|curious|interesting|fascinating|i wonder)\b/.test(t)) return 'question';
  return null;
}

// ─── BOOT ─────────────────────────────────────────────────────────────────────
const _probe = document.getElementById('js-probe');
if (_probe) _probe.remove();

if (!prefs.firstTimeDone) {
  runOnboarding();
} else {
  buildShell();
}
