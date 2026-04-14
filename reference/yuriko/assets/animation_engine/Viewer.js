import * as THREE from 'three';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import { Loader } from './Loader.js';
import { Controls } from './Controls.js';
import { AnimationManager } from './AnimationManager.js';
import { loadMixamoAnimation } from './loadMixamoAnimation.js';
import { LipSyncManager } from './LipSyncManager.js';
import { ExpressionManager } from './ExpressionManager.js';
import { BlinkManager } from './BlinkManager.js';

export class Viewer {
    constructor(containerId) {
        this.container = document.getElementById(containerId);

        // Scene
        this.scene = new THREE.Scene();
        // Background will be set after loading HDRI

        // Camera
        this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
        this.camera.position.set(0, 1.35, 2.2); // Front view of character (180° rotation)

        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);

        // Lights - Enhanced lighting setup
        // Lights - Enhanced lighting setup
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.45); // Increased ambient light
        this.scene.add(ambientLight);

        // Main directional light (front)
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.45);
        dirLight.position.set(2, 5, 5);
        this.scene.add(dirLight);

        // Back light (key light for back view)
        const backLight = new THREE.DirectionalLight(0xffffff, 0.5);
        backLight.position.set(0, 3, -5);
        this.scene.add(backLight);

        // Rim light (left side)
        const rimLightLeft = new THREE.DirectionalLight(0xffd4e5, 0.25);
        rimLightLeft.position.set(-3, 2, -2);
        this.scene.add(rimLightLeft);

        // Rim light (right side)
        const rimLightRight = new THREE.DirectionalLight(0xffd4e5, 0.25);
        rimLightRight.position.set(3, 2, -2);
        this.scene.add(rimLightRight);

        // Fill light (bottom)
        const fillLight = new THREE.DirectionalLight(0xffffff, 0.15);
        fillLight.position.set(0, -2, 0);
        this.scene.add(fillLight);

        // Add invisible shadow-catching ground plane
        const groundGeometry = new THREE.PlaneGeometry(50, 50);
        const groundMaterial = new THREE.ShadowMaterial({ opacity: 0.3 });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2; // Rotate to horizontal
        ground.position.y = 0; // Ground level
        ground.receiveShadow = true;
        this.scene.add(ground);

        // Components
        this.loader = new Loader(this.scene);
        this.controls = new Controls(this.camera, this.renderer.domElement);
        this.animationManager = new AnimationManager();
        this.lipSyncManager = new LipSyncManager();
        this.expressionManager = new ExpressionManager();
        this.blinkManager = new BlinkManager();

        // Resize
        window.addEventListener('resize', () => this.onWindowResize(), false);

        // Loop
        this.clock = new THREE.Clock();
        this.animate();

        // Load HDRI Background
        this.loadEnvironment();

        // Load Character
        this.loadCharacter();
    }

    loadEnvironment() {
        const exrLoader = new EXRLoader();
        exrLoader.load(
            '/src/assets/environments/town_bg.exr',
            (texture) => {
                console.log('✅ HDRI Environment loaded successfully');
                texture.mapping = THREE.EquirectangularReflectionMapping;
                this.scene.environment = texture;
                // Keep background as neutral light gray for news studio look
                this.scene.background = new THREE.Color(0xe8e8e8);
                this.renderer.toneMappingExposure = 1.2;
            },
            undefined,
            (error) => {
                console.warn('HDRI not found, using studio background:', error.message);
                this.scene.background = new THREE.Color(0xe8e8e8);
            }
        );
    }

    async loadCharacter() {
        try {
            console.log('🚀 Loading VRM model...');
            // Load VRM
            const gltf = await this.loader.load('/src/assets/models/model1.vrm');
            const vrm = gltf.userData.vrm;
            this.currentVrm = vrm;

            // Fix frustum culling issue
            vrm.scene.traverse((obj) => obj.frustumCulled = false);

            // Rotate model 180 degrees to face the camera
            vrm.scene.rotation.y = Math.PI;

            this.scene.add(vrm.scene);

            // Initialize expression and blink managers with VRM
            this.expressionManager.setVRM(vrm);
            this.blinkManager.setVRM(vrm);

            console.log('✅ VRM LOADED - Loading FBX animation...');

            // Load Idle animation
            loadMixamoAnimation('/src/assets/animations/idle.fbx', vrm).then((clip) => {
                if (clip) {
                    console.log('✅ Animation loaded:', clip.name, `(${clip.duration.toFixed(2)}s)`);
                    this.animationManager.setMixer(vrm.scene);
                    this.animationManager.playClip(clip);
                    console.log('🎬 Idle animation playing!');
                }
            }).catch((err) => {
                console.error('❌ Animation load error:', err);
            });

        } catch (e) {
            console.error("Error loading character:", e);
            console.warn("Character not found, loading placeholder cube.");
            const geometry = new THREE.BoxGeometry(1, 1, 1);
            const material = new THREE.MeshStandardMaterial({ color: 0x007aff });
            const cube = new THREE.Mesh(geometry, material);
            cube.position.y = 0.5;
            this.scene.add(cube);
        }
    }

    // Public API for controlling lip sync
    setPhonemes(phonemes) {
        if (this.lipSyncManager) {
            this.lipSyncManager.setPhonemes(phonemes);
        }
    }

    resetLipSync() {
        if (this.lipSyncManager) {
            this.lipSyncManager.reset();
        }
    }

    setLipSyncSmoothing(factor) {
        if (this.lipSyncManager) {
            this.lipSyncManager.setSmoothingFactor(factor);
        }
    }

    setLipSyncGain(gain) {
        if (this.lipSyncManager) {
            this.lipSyncManager.setGainMultiplier(gain);
        }
    }

    // Public API for controlling expressions
    setExpression(name, value = 1.0) {
        if (this.expressionManager) {
            this.expressionManager.setExpression(name, value);
        }
    }

    setEmotion(emotion) {
        this.setExpression(emotion || 'neutral', 1.0);
    }

    resetExpression() {
        if (this.expressionManager) {
            this.expressionManager.resetExpressions();
        }
    }

    transitionExpression(name, duration = 0.5) {
        if (this.expressionManager) {
            this.expressionManager.transitionTo(name, duration);
        }
    }

    enableBlinking(enabled) {
        if (this.blinkManager) {
            this.blinkManager.setEnabled(enabled);
        }
    }

    triggerBlink() {
        if (this.blinkManager) {
            this.blinkManager.triggerBlink();
        }
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        const delta = this.clock.getDelta();
        this.controls.update();
        this.animationManager.update(delta);

        // Update VRM
        if (this.currentVrm) {
            this.currentVrm.update(delta);

            // Update lip sync
            this.lipSyncManager.updateLipSync(this.currentVrm, delta);

            // Update expressions and blinking
            this.expressionManager.update(delta);
            this.blinkManager.update(delta);
        }

        this.renderer.render(this.scene, this.camera);
    }
}
