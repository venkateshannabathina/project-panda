import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { VRMAnimationLoaderPlugin, createVRMAnimationClip } from '@pixiv/three-vrm-animation';

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function rand(lo, hi) { return lo + Math.random() * (hi - lo); }

// ── All VRM expression shapes ──────────────────────────────────────────
// VRM0 preset mapping (what three-vrm normalises to):
//   happy    → Joy      (big open smile)
//   relaxed  → Fun      (smirk / soft smile)
//   sad      → Sorrow   (down-turned mouth, sad brows)
//   angry    → Angry    (furrowed brows, narrow eyes)
//   surprised → Surprised (wide eyes, raised brows)
//   neutral  → Neutral  (flat, resting)
const ALL_SHAPES = ['happy', 'sad', 'surprised', 'angry', 'relaxed', 'neutral'];

// Shapes that heavily affect the mouth opening.
// While phonemes (aa/ee/ih/oh/ou) are driving the mouth, these fade to 50%
// so emotion still reads on the eyes/brows, but phonemes own the jaw.
const MOUTH_SHAPES = new Set(['happy', 'sad', 'surprised', 'angry']);

// ─────────────────────────────────────────────────────────────────────────────
// STATE PROFILES — subtle ambient baseline per conversation phase.
// Intentionally kept moderate (0.2–0.55) so the EMOTION layer can dominate.
// ─────────────────────────────────────────────────────────────────────────────
const STATE_PROFILES = {
  idle: {
    base:  { relaxed: 0.20, happy: 0.07, neutral: 0.05 },
    freqs: [0.09, 0.21], amp: 0.12, speed: 4.0,
  },
  listening: {
    base:  { surprised: 0.30, happy: 0.18, relaxed: 0.06 },
    freqs: [0.14, 0.30], amp: 0.11, speed: 9.0,
  },
  processing: {
    base:  { neutral: 0.50, sad: 0.12, relaxed: 0.04 },
    freqs: [0.20, 0.46], amp: 0.16, speed: 5.0,
  },
  speaking: {
    base:  { happy: 0.48, relaxed: 0.12, surprised: 0.05 },
    freqs: [0.17, 0.38], amp: 0.13, speed: 7.5,
  },
  error: {
    base:  { sad: 0.58, surprised: 0.22, neutral: 0.08 },
    freqs: [0.07, 0.13], amp: 0.07, speed: 4.5,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// EMOTION PROFILES — full-face expressions driven by reply text sentiment.
//
// Design rules so they never fight each other:
//   • Each emotion has ONE dominant slider (≥ 0.75) that defines the look.
//   • Supporting sliders are low (≤ 0.20) — add depth, don't compete.
//   • Slider totals never push above 1.0 on the same axis.
//   • happy vs relaxed are *different* looks — use only one per emotion.
//
//  Slider   VRM shape     Face it drives
//  ───────  ──────────    ──────────────────────────────
//  happy    Joy           Big open smile, cheeks raised
//  relaxed  Fun           Smirk, soft closed-mouth smile
//  sad      Sorrow        Turned-down mouth, droopy eyes
//  angry    Angry         Furrowed brow, narrowed eyes
//  surprised Surprised    Wide eyes, raised brows, O-mouth
//  neutral  Neutral       Flat, expressionless
// ─────────────────────────────────────────────────────────────────────────────
const EMOTION_PROFILES = {
  // Full laugh / pure joy — big open smile
  joy:        { happy: 0.90, surprised: 0.18, relaxed: 0.00 },

  // Omg excited — wide eyes + huge smile
  excited:    { happy: 0.78, surprised: 0.65, relaxed: 0.00 },

  // Having fun / goofing around — smirk-based (relaxed dominant)
  fun:        { relaxed: 0.92, happy: 0.15, surprised: 0.00 },

  // Smug smirk — sly, self-satisfied (screenshot 1 recipe)
  smirk:      { relaxed: 0.85, happy: 0.08 },

  // Suspicious / judging — sketchy look (screenshot 2 recipe)
  // angry at ~65% gives the narrowed brow without full rage
  suspicious: { angry: 0.62, neutral: 0.10 },

  // Teasing / playful jab — smirk with a hint of surprise
  teasing:    { relaxed: 0.72, happy: 0.28, surprised: 0.10 },

  // Calm / informational — soft and composed
  calm:       { relaxed: 0.70, happy: 0.16, neutral: 0.10 },

  // Empathetic / caring — slight sadness but warm
  empathetic: { sad: 0.30, relaxed: 0.28, happy: 0.10 },

  // Sad / genuine sadness
  sad:        { sad: 0.82, neutral: 0.12 },

  // Apologetic — sad with a touch of surprise (didn't mean to)
  apologetic: { sad: 0.65, surprised: 0.18, neutral: 0.08 },

  // Angry / frustrated
  angry:      { angry: 0.90, sad: 0.12 },

  // Curious question — wide eyes, slightly happy
  question:   { surprised: 0.60, happy: 0.18, relaxed: 0.06 },

  // Confident / matter-of-fact — smirk + neutral base
  confident:  { relaxed: 0.55, neutral: 0.20, happy: 0.10 },
};

// ─────────────────────────────────────────────────────────────────────────────
// MICRO-EXPRESSIONS — brief high-intensity flickers for a "chaotic alive" feel.
//
// Each micro has an optional `emotions` filter — only fires when the active
// emotion matches. Unfiltered micros fire for any state.
// ─────────────────────────────────────────────────────────────────────────────
const MICROS = [
  // ── Unfiltered (state-based only) ────────────────────────────────────────

  // Idle warmth — soft smile shimmer
  { expr: { relaxed: 0.75, happy: 0.18 },
    dur: 0.60, fadeIn: 0.14, fadeOut: 0.26, gap: [5.0, 13.0],
    states: ['idle'] },

  // Listening perk — wide-eyed attention
  { expr: { surprised: 0.72, happy: 0.12 },
    dur: 0.28, fadeIn: 0.07, fadeOut: 0.16, gap: [3.5, 8.0],
    states: ['listening'] },

  // Processing furrow — deep-thought squint
  { expr: { neutral: 0.62, sad: 0.20 },
    dur: 0.55, fadeIn: 0.12, fadeOut: 0.22, gap: [3.0, 7.0],
    states: ['processing'] },

  // Generic speaking bounce — surprise spark mid-sentence
  { expr: { surprised: 0.55, happy: 0.32 },
    dur: 0.25, fadeIn: 0.06, fadeOut: 0.14, gap: [3.0, 7.0],
    states: ['speaking'] },

  // ── Emotion-matched micros ────────────────────────────────────────────────

  // Joy shimmer — huge grin flash
  { expr: { happy: 0.95, surprised: 0.12 },
    dur: 0.35, fadeIn: 0.07, fadeOut: 0.18, gap: [1.5, 4.0],
    states: ['speaking'], emotions: ['joy', 'excited', 'fun'] },

  // Fun smirk pulse
  { expr: { relaxed: 0.95, happy: 0.10 },
    dur: 0.45, fadeIn: 0.09, fadeOut: 0.22, gap: [2.0, 5.0],
    states: ['speaking'], emotions: ['fun', 'smirk', 'teasing', 'confident'] },

  // Suspicious narrow
  { expr: { angry: 0.70, neutral: 0.15 },
    dur: 0.40, fadeIn: 0.10, fadeOut: 0.20, gap: [1.8, 4.5],
    states: ['speaking'], emotions: ['suspicious', 'angry'] },

  // Teasing raised-brow smirk
  { expr: { relaxed: 0.68, surprised: 0.30, happy: 0.22 },
    dur: 0.32, fadeIn: 0.08, fadeOut: 0.18, gap: [2.5, 6.0],
    states: ['speaking'], emotions: ['teasing', 'smirk'] },

  // Sadness ripple
  { expr: { sad: 0.88, neutral: 0.10 },
    dur: 0.50, fadeIn: 0.14, fadeOut: 0.28, gap: [2.5, 6.0],
    states: ['speaking'], emotions: ['sad', 'apologetic', 'empathetic'] },

  // Angry flash
  { expr: { angry: 0.95, sad: 0.08 },
    dur: 0.22, fadeIn: 0.05, fadeOut: 0.12, gap: [1.5, 3.5],
    states: ['speaking'], emotions: ['angry'] },

  // Question brow-raise
  { expr: { surprised: 0.68, happy: 0.14 },
    dur: 0.30, fadeIn: 0.07, fadeOut: 0.16, gap: [2.0, 5.5],
    states: ['speaking', 'listening'], emotions: ['question', 'excited'] },

  // Excitement wave — excited micro burst
  { expr: { happy: 0.85, surprised: 0.70 },
    dur: 0.20, fadeIn: 0.05, fadeOut: 0.10, gap: [1.0, 3.0],
    states: ['speaking'], emotions: ['excited'] },
];

// ─────────────────────────────────────────────────────────────────────────────
// GAZE — per-state eye target positions
// ─────────────────────────────────────────────────────────────────────────────
const GAZE = {
  idle:       () => new THREE.Vector3(
                  Math.sin(Date.now() * 0.00028) * 0.32,
                  1.30 + Math.sin(Date.now() * 0.00017) * 0.10,
                  3.0),
  listening:  () => new THREE.Vector3(0, 1.32, 3.0),           // direct eye contact
  processing: () => new THREE.Vector3(0.35, 1.03, 2.0),        // down-right = thinking
  speaking:   () => new THREE.Vector3(
                  Math.sin(Date.now() * 0.00040) * 0.18,
                  1.30, 3.0),
  error:      () => new THREE.Vector3(-0.10, 1.18, 2.5),
};

// ─────────────────────────────────────────────────────────────────────────────
// BuddyVRM — main object
// ─────────────────────────────────────────────────────────────────────────────
const BuddyVRM = {
  scene:    null,
  camera:   null,
  renderer: null,
  controls: null,
  vrm:      null,
  canvas:   null,
  clock:    null,

  _mixer:    null,
  _vrmaDone: false,

  // Conversation state
  _state: 'idle',
  _exprCurrent: {},

  // Emotion layer
  _emotion:       null,   // key into EMOTION_PROFILES | null
  _emotionBlend:  0,      // 0 = state profile, 1 = emotion profile
  _emotionFading: false,

  // Micro-expression state machine (0=wait 1=fadeIn 2=hold 3=fadeOut)
  _microPhase:  0,
  _microTimer:  0,
  _microNextIn: 4.0,
  _microExpr:   null,
  _microFade:   0,

  // Gaze smoothing
  _gazeTarget:  null,
  _gazeCurrent: new THREE.Vector3(0, 1.30, 3.0),

  // Lip sync
  _lipRaw:    0,
  _lipSmooth: 0,
  _lipPhase:  0,
  _lipV:      { aa: 0, ee: 0, ih: 0, oh: 0, ou: 0 },

  // Blink
  _blinkTimer:  0,
  _blinkPhase:  0,
  _blinkSpeed:  0.07,
  _blinkNextIn: 3,
  _blinkVal:    0,

  _idleT: 0,

  // ── init ────────────────────────────────────────────────────────────────
  init(canvas) {
    this.canvas = canvas;
    this.clock  = new THREE.Clock();

    const w = canvas.parentElement.clientWidth  || 300;
    const h = canvas.parentElement.clientHeight || 400;

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(28, w / h, 0.1, 20);
    this.camera.position.set(0, 0.9, 3.0);
    this.camera.lookAt(0, 0.9, 0);

    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setSize(w, h, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace    = THREE.SRGBColorSpace;
    this.renderer.toneMapping         = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.enabled   = true;
    this.renderer.shadowMap.type      = THREE.PCFSoftShadowMap;

    this._gazeTarget = new THREE.Object3D();
    this.scene.add(this._gazeTarget);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0.9, 0);
    this.controls.minPolarAngle = Math.PI * 0.12;
    this.controls.maxPolarAngle = Math.PI * 0.78;
    this.controls.minDistance   = 1.2;
    this.controls.maxDistance   = 5.5;
    this.controls.enablePan     = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.rotateSpeed   = 0.6;
    this.controls.zoomSpeed     = 0.8;
    this.controls.update();

    this.scene.add(new THREE.AmbientLight(0xfff4f8, 0.55));

    const key = new THREE.DirectionalLight(0xfffaf0, 1.6);
    key.position.set(1.2, 3.0, 2.2);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near   = 0.5;
    key.shadow.camera.far    = 15;
    key.shadow.camera.left   = -2.5;
    key.shadow.camera.right  = 2.5;
    key.shadow.camera.top    = 4;
    key.shadow.camera.bottom = -1;
    this.scene.add(key);

    const rim = new THREE.DirectionalLight(0x9090ff, 0.9);
    rim.position.set(-1.2, 2.0, -3);
    this.scene.add(rim);

    const fill = new THREE.DirectionalLight(0xffe8d8, 0.45);
    fill.position.set(-2.0, 1.0, 1.5);
    this.scene.add(fill);

    const under = new THREE.PointLight(0x7060ff, 0.35, 4);
    under.position.set(0, -0.3, 1.2);
    this.scene.add(under);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(1.0, 64),
      new THREE.MeshBasicMaterial({ color: 0x9090ff, transparent: true, opacity: 0.08, side: THREE.DoubleSide })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.01;
    floor.receiveShadow = true;
    this.scene.add(floor);

    new ResizeObserver(() => this._resize()).observe(canvas.parentElement);

    const animate = () => {
      requestAnimationFrame(animate);
      const dt = Math.min(this.clock.getDelta(), 0.05);
      this._tick(dt);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    animate();
  },

  // ── per-frame ────────────────────────────────────────────────────────────
  _tick(dt) {
    if (!this.vrm) return;
    this._idleT += dt;

    if (this._mixer) this._mixer.update(dt);

    this._tickMicro(dt);
    this._tickExpressions(dt);
    this._tickBlink(dt);
    this._tickLipSync(dt);
    this._tickGaze(dt);

    if (this._vrmaDone) this._tickIdleMotion(dt);

    this.vrm.update(dt);
  },

  // ── micro-expression state machine ───────────────────────────────────────
  // Eligible micros must match BOTH state AND (if specified) current emotion.
  _tickMicro(dt) {
    this._microTimer += dt;

    switch (this._microPhase) {
      case 0: { // wait
        if (this._microTimer >= this._microNextIn) {
          const eligible = MICROS.filter(m => {
            if (!m.states.includes(this._state)) return false;
            // If micro has emotion filter, only fire when that emotion is active + blended in
            if (m.emotions) {
              return this._emotion && m.emotions.includes(this._emotion) && this._emotionBlend > 0.4;
            }
            return true;
          });
          if (eligible.length) {
            this._microExpr  = eligible[Math.floor(Math.random() * eligible.length)];
            this._microPhase = 1;
            this._microTimer = 0;
          } else {
            this._microTimer = 0;
          }
        }
        break;
      }
      case 1: // fade-in
        this._microFade = clamp(this._microTimer / this._microExpr.fadeIn, 0, 1);
        if (this._microFade >= 1) { this._microPhase = 2; this._microTimer = 0; }
        break;

      case 2: // hold
        this._microFade = 1;
        if (this._microTimer >= this._microExpr.dur) { this._microPhase = 3; this._microTimer = 0; }
        break;

      case 3: // fade-out
        this._microFade = clamp(1 - this._microTimer / this._microExpr.fadeOut, 0, 1);
        if (this._microFade <= 0) {
          this._microNextIn = rand(this._microExpr.gap[0], this._microExpr.gap[1]);
          this._microPhase  = 0;
          this._microTimer  = 0;
          this._microFade   = 0;
          this._microExpr   = null;
        }
        break;
    }
  },

  // ── 5-layer expression engine ─────────────────────────────────────────────
  //
  // Layer 1 — STATE profile (ambient baseline, moderate)
  // Layer 2 — EMOTION profile (dominant, blends in over ~0.3s when detected)
  //           _emotionBlend 0→1 = state→emotion, fades back when cleared
  // Layer 3 — Organic oscillation (applied to blended result)
  // Layer 4 — Micro-expression additive overlay
  // Layer 5 — Lip-sync mouth isolation (MOUTH_SHAPES → 50% while phonemes active)
  //
  // The key invariant: at any given frame, only shapes that belong to the
  // active emotion/state are pushed high. Everything else stays near 0.
  // This prevents simultaneous slider conflicts.
  _tickExpressions(dt) {
    const em = this.vrm?.expressionManager;
    if (!em) return;

    const profile = STATE_PROFILES[this._state] || STATE_PROFILES.idle;
    const t       = this._idleT;

    // Organic oscillation multiplier
    const osc = 1 + profile.amp * (
      Math.sin(t * profile.freqs[0]) * 0.65 +
      Math.sin(t * profile.freqs[1]) * 0.35
    );

    // Layer 1: state baseline
    const stateTarget = {};
    for (const shape of ALL_SHAPES) {
      stateTarget[shape] = (profile.base[shape] ?? 0) * osc;
    }

    // Layer 2: emotion blend — animate _emotionBlend toward 1 or 0
    const emotionProfile = this._emotion ? EMOTION_PROFILES[this._emotion] : null;
    if (emotionProfile && !this._emotionFading) {
      this._emotionBlend = clamp(this._emotionBlend + dt * 3.5, 0, 1);
    } else {
      this._emotionBlend = clamp(this._emotionBlend - dt * 1.5, 0, 1);
      if (this._emotionBlend <= 0) { this._emotion = null; this._emotionFading = false; }
    }

    // Compute blended target: lerp from state → emotion
    const target = {};
    for (const shape of ALL_SHAPES) {
      const st  = stateTarget[shape] ?? 0;
      // Emotion shapes use osc breathing too so they feel alive, not locked
      const emo = emotionProfile ? ((emotionProfile[shape] ?? 0) * osc) : st;
      target[shape] = lerp(st, emo, this._emotionBlend);
    }

    // Layer 3 (micro overlay): additive — capped at 1.0
    if (this._microFade > 0 && this._microExpr) {
      for (const [shape, val] of Object.entries(this._microExpr.expr)) {
        target[shape] = clamp((target[shape] ?? 0) + val * this._microFade, 0, 1);
      }
    }

    // Layer 4: lip-sync mouth isolation
    // While phonemes are driving the jaw, fade MOUTH_SHAPES to 50%
    // so the emotion still shows in eyes/brows, phonemes own the opening.
    const lipFade = clamp(this._lipSmooth * 5, 0, 1);
    if (lipFade > 0) {
      for (const shape of MOUTH_SHAPES) {
        if (target[shape] !== undefined) {
          target[shape] = lerp(target[shape], target[shape] * 0.50, lipFade);
        }
      }
    }

    // Smooth lerp current → target and apply
    const speed = clamp(dt * profile.speed, 0, 1);
    for (const shape of ALL_SHAPES) {
      const cur  = this._exprCurrent[shape] ?? 0;
      const next = lerp(cur, target[shape] ?? 0, speed);
      this._exprCurrent[shape] = next;
      try { em.setValue(shape, next); } catch (_) {}
    }
  },

  // ── auto-blink ───────────────────────────────────────────────────────────
  _tickBlink(dt) {
    const em = this.vrm?.expressionManager;
    if (!em) return;
    this._blinkTimer += dt;
    switch (this._blinkPhase) {
      case 0:
        if (this._blinkTimer >= this._blinkNextIn) {
          this._blinkPhase = 1; this._blinkTimer = 0;
          this._blinkSpeed = 0.05 + Math.random() * 0.04;
        }
        break;
      case 1: {
        const t = clamp(this._blinkTimer / this._blinkSpeed, 0, 1);
        this._blinkVal = t;
        if (t >= 1) { this._blinkPhase = 2; this._blinkTimer = 0; this._blinkSpeed = 0.05 + Math.random() * 0.04; }
        break;
      }
      case 2: {
        const t = clamp(this._blinkTimer / this._blinkSpeed, 0, 1);
        this._blinkVal = 1 - t;
        if (t >= 1) {
          this._blinkPhase  = 0; this._blinkTimer = 0;
          this._blinkVal    = 0;
          this._blinkNextIn = 2.5 + Math.random() * 5.0;
        }
        break;
      }
    }
    try { em.setValue('blink', this._blinkVal); } catch (_) {}
  },

  // ── lip sync (a / e / i / o / u) ─────────────────────────────────────────
  _tickLipSync(dt) {
    const em = this.vrm?.expressionManager;
    if (!em) return;

    // Instant attack, ~250ms release
    if (this._lipRaw >= this._lipSmooth) {
      this._lipSmooth = this._lipRaw;
    } else {
      this._lipSmooth = lerp(this._lipSmooth, 0, clamp(dt * 10, 0, 1));
    }

    const amp  = this._lipSmooth;
    const fast = clamp(dt * 35, 0, 1);

    if (amp > 0.01) {
      this._lipPhase += dt * (3.0 + amp * 7.0);
      const p  = this._lipPhase;
      const aa = amp * clamp(0.60 + 0.40 * Math.sin(p * 1.10),          0, 1);
      const ee = amp * clamp(0.25 + 0.25 * Math.sin(p * 0.80 + 1.20),   0, 1);
      const ih = amp * clamp(0.20 * Math.abs(Math.sin(p * 1.90 + 0.50)), 0, 1);
      const oh = amp * clamp(0.35 + 0.22 * Math.sin(p * 0.58 + 0.90),   0, 1);
      const ou = amp * clamp(0.18 * Math.abs(Math.sin(p * 1.55 + 2.10)), 0, 1);
      this._lipV.aa = lerp(this._lipV.aa, aa, fast);
      this._lipV.ee = lerp(this._lipV.ee, ee, fast);
      this._lipV.ih = lerp(this._lipV.ih, ih, fast);
      this._lipV.oh = lerp(this._lipV.oh, oh, fast);
      this._lipV.ou = lerp(this._lipV.ou, ou, fast);
    } else {
      this._lipV.aa = lerp(this._lipV.aa, 0, fast);
      this._lipV.ee = lerp(this._lipV.ee, 0, fast);
      this._lipV.ih = lerp(this._lipV.ih, 0, fast);
      this._lipV.oh = lerp(this._lipV.oh, 0, fast);
      this._lipV.ou = lerp(this._lipV.ou, 0, fast);
    }

    try { em.setValue('aa', this._lipV.aa); } catch (_) {}
    try { em.setValue('ee', this._lipV.ee); } catch (_) {}
    try { em.setValue('ih', this._lipV.ih); } catch (_) {}
    try { em.setValue('oh', this._lipV.oh); } catch (_) {}
    try { em.setValue('ou', this._lipV.ou); } catch (_) {}
  },

  // ── gaze ─────────────────────────────────────────────────────────────────
  _tickGaze(dt) {
    if (!this.vrm?.lookAt || !this._gazeTarget) return;
    const desired = (GAZE[this._state] || GAZE.idle)();
    this._gazeCurrent.lerp(desired, clamp(dt * 2.5, 0, 1));
    this._gazeTarget.position.copy(this._gazeCurrent);
    this.vrm.lookAt.target = this._gazeTarget;
  },

  // ── idle body motion ──────────────────────────────────────────────────────
  _tickIdleMotion(dt) {
    if (!this.vrm?.humanoid) return;
    const t = this._idleT;
    const s = clamp(dt * 2.0, 0, 1);

    const breath = Math.sin(t * 0.38) * 0.007 + Math.sin(t * 0.81) * 0.002;
    const headX  = Math.sin(t * 0.27) * 0.016 + Math.sin(t * 0.59) * 0.007;
    const headZ  = Math.sin(t * 0.33) * 0.013 + Math.sin(t * 0.51) * 0.005;

    try {
      const head = this.vrm.humanoid.getNormalizedBoneNode('head');
      if (head) {
        head.rotation.x = lerp(head.rotation.x, breath * 0.4 + headX * 0.5, s);
        head.rotation.z = lerp(head.rotation.z, headZ, s);
      }
      const neck = this.vrm.humanoid.getNormalizedBoneNode('neck');
      if (neck) {
        neck.rotation.x = lerp(neck.rotation.x, headX * 0.5, s);
        neck.rotation.z = lerp(neck.rotation.z, headZ * 0.4, s);
      }
      const chest = this.vrm.humanoid.getNormalizedBoneNode('chest') ||
                    this.vrm.humanoid.getNormalizedBoneNode('upperChest');
      if (chest) chest.rotation.x = lerp(chest.rotation.x, breath * 1.4, s);
      const spine = this.vrm.humanoid.getNormalizedBoneNode('spine');
      if (spine) {
        spine.rotation.x = lerp(spine.rotation.x, breath * 0.9, s);
        spine.rotation.z = lerp(spine.rotation.z, headZ * 0.25, s);
      }
    } catch (_) {}
  },

  // ── resize ────────────────────────────────────────────────────────────────
  _resize() {
    if (!this.renderer || !this.canvas?.parentElement) return;
    const w = this.canvas.parentElement.clientWidth;
    const h = this.canvas.parentElement.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  },

  // ── load VRM ─────────────────────────────────────────────────────────────
  async load(vrmUrl) {
    if (this.vrm) {
      if (this._mixer) { this._mixer.stopAllAction(); this._mixer = null; }
      this.scene.remove(this.vrm.scene);
      VRMUtils.deepDispose(this.vrm.scene);
      this.vrm = null;
    }
    const loader = new GLTFLoader();
    loader.register(p => new VRMLoaderPlugin(p));

    return new Promise((resolve, reject) => {
      loader.load(
        vrmUrl,
        (gltf) => {
          const vrm = gltf.userData.vrm;
          if (!vrm) { reject(new Error('No VRM data')); return; }

          VRMUtils.removeUnnecessaryVertices(gltf.scene);
          VRMUtils.combineSkeletons(gltf.scene);

          this.vrm = vrm;
          vrm.scene.rotation.y = Math.PI;
          vrm.scene.traverse(obj => { if (obj.isMesh) obj.castShadow = true; });
          this.scene.add(vrm.scene);

          if (vrm.lookAt) vrm.lookAt.target = this._gazeTarget;

          // Reset all state
          this._exprCurrent  = {};
          for (const s of ALL_SHAPES) this._exprCurrent[s] = 0;
          this._state         = 'idle';
          this._emotion       = null;
          this._emotionBlend  = 0;
          this._emotionFading = false;
          this._microPhase    = 0;
          this._microTimer    = 0;
          this._microNextIn   = 3.0 + Math.random() * 4.0;
          this._microFade     = 0;
          this._microExpr     = null;
          this._blinkNextIn   = 1.5 + Math.random() * 3;
          this._vrmaDone      = false;

          resolve(vrm);
        },
        (prog) => {
          if (prog.total) {
            window.dispatchEvent(new CustomEvent('vrm-progress', {
              detail: Math.round((prog.loaded / prog.total) * 100)
            }));
          }
        },
        (err) => reject(err)
      );
    });
  },

  // ── load VRMA — play once, freeze at last frame ───────────────────────────
  async loadAnimation(vrmaUrl) {
    if (!this.vrm) return;
    const loader = new GLTFLoader();
    loader.register(p => new VRMAnimationLoaderPlugin(p));

    const gltf = await new Promise((resolve, reject) => {
      loader.load(vrmaUrl, resolve, undefined, reject);
    });

    const vrmAnimation = gltf.userData.vrmAnimations?.[0];
    if (!vrmAnimation) return;

    const clip   = createVRMAnimationClip(vrmAnimation, this.vrm);
    const mixer  = new THREE.AnimationMixer(this.vrm.scene);
    this._mixer  = mixer;

    const action = mixer.clipAction(clip);
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();

    mixer.addEventListener('finished', () => { this._vrmaDone = true; });
  },

  // ── public API ────────────────────────────────────────────────────────────

  setExpression(state) {
    this._state = state;
    if (state !== 'speaking') this._emotionFading = true;
    if (this._microPhase === 0) {
      this._microNextIn = 1.0 + Math.random() * 2.5;
      this._microTimer  = 0;
    }
  },

  // emotionName: any key from EMOTION_PROFILES, or null to clear
  setSentiment(emotionName) {
    if (emotionName && EMOTION_PROFILES[emotionName]) {
      this._emotion       = emotionName;
      this._emotionFading = false;
      // Accelerate next micro so it fires quickly after emotion lands
      if (this._microPhase === 0) {
        this._microNextIn = rand(0.8, 2.0);
        this._microTimer  = 0;
      }
    } else {
      this._emotionFading = true;
    }
  },

  setLipSync(amplitude) {
    this._lipRaw = clamp(amplitude * 3.2, 0, 1);
  },
};

window.BuddyVRM = BuddyVRM;
