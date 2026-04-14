/**
 * LipSyncManager - Manages phoneme-based lip sync for VRM models
 */

import { getBlendShapesForPhoneme, PHONEME_DURATION } from './phonemeToBlendShape.js';

export class LipSyncManager {
    constructor() {
        // Current phoneme data
        this.currentPhonemes = null;
        this.phonemeStartTime = 0;
        this.currentPhonemeIndex = 0;

        // Smoothing for natural transitions
        this.previousBlendShapes = {
            aa: 0,
            ih: 0,
            ou: 0,
            ee: 0,
            oh: 0
        };

        // Settings
        this.smoothingFactor = 0.3; // 0-1, higher = smoother but slower
        this.gainMultiplier = 1.0;   // Amplitude multiplier
    }

    /**
     * Set phonemes for current speech
     * @param {Array<string>} phonemes - Array of phoneme strings
     */
    setPhonemes(phonemes) {
        this.currentPhonemes = phonemes;
        this.phonemeStartTime = performance.now();
        this.currentPhonemeIndex = 0;
        console.log('🗣️ Lip sync phonemes set:', phonemes);
    }

    /**
     * Clear phonemes and reset mouth
     */
    reset() {
        this.currentPhonemes = null;
        this.phonemeStartTime = 0;
        this.currentPhonemeIndex = 0;
        this.previousBlendShapes = {
            aa: 0,
            ih: 0,
            ou: 0,
            ee: 0,
            oh: 0
        };
    }

    /**
     * Update lip sync blend shapes based on current time
     * @param {VRM} vrm - VRM model instance
     * @param {number} deltaTime - Time since last frame
     */
    updateLipSync(vrm, deltaTime) {
        if (!vrm || !vrm.expressionManager) {
            return;
        }

        const manager = vrm.expressionManager;

        // If no phonemes, keep mouth closed
        if (!this.currentPhonemes || this.currentPhonemes.length === 0) {
            this._setBlendShapes(manager, {
                aa: 0,
                ih: 0,
                ou: 0,
                ee: 0,
                oh: 0
            });
            return;
        }

        // Calculate current phoneme based on time elapsed
        const elapsed = performance.now() - this.phonemeStartTime;
        const phonemeIndex = Math.floor(elapsed / PHONEME_DURATION);

        // Check if we've moved past all phonemes
        if (phonemeIndex >= this.currentPhonemes.length) {
            // Speech ended, close mouth
            this.reset();
            this._setBlendShapes(manager, {
                aa: 0,
                ih: 0,
                ou: 0,
                ee: 0,
                oh: 0
            });
            return;
        }

        // Get current phoneme
        const currentPhoneme = this.currentPhonemes[phonemeIndex];

        // Get target blend shapes for this phoneme
        let targetBlendShapes = getBlendShapesForPhoneme(currentPhoneme);

        // Apply gain multiplier
        targetBlendShapes = {
            aa: targetBlendShapes.aa * this.gainMultiplier,
            ih: targetBlendShapes.ih * this.gainMultiplier,
            ou: targetBlendShapes.ou * this.gainMultiplier,
            ee: targetBlendShapes.ee * this.gainMultiplier,
            oh: targetBlendShapes.oh * this.gainMultiplier
        };

        // Apply smoothing by interpolating between previous and target
        const smoothedBlendShapes = {
            aa: this._lerp(this.previousBlendShapes.aa, targetBlendShapes.aa, this.smoothingFactor),
            ih: this._lerp(this.previousBlendShapes.ih, targetBlendShapes.ih, this.smoothingFactor),
            ou: this._lerp(this.previousBlendShapes.ou, targetBlendShapes.ou, this.smoothingFactor),
            ee: this._lerp(this.previousBlendShapes.ee, targetBlendShapes.ee, this.smoothingFactor),
            oh: this._lerp(this.previousBlendShapes.oh, targetBlendShapes.oh, this.smoothingFactor)
        };

        // Update VRM blend shapes
        this._setBlendShapes(manager, smoothedBlendShapes);

        // Store for next frame
        this.previousBlendShapes = smoothedBlendShapes;
        this.currentPhonemeIndex = phonemeIndex;
    }

    /**
     * Set VRM blend shapes
     * @private
     */
    _setBlendShapes(manager, blendShapes) {
        // Clamp values to 0-1 range
        const clamp = (val) => Math.max(0, Math.min(1, val));

        if (manager.getExpression('aa')) {
            manager.setValue('aa', clamp(blendShapes.aa));
        }
        if (manager.getExpression('ih')) {
            manager.setValue('ih', clamp(blendShapes.ih));
        }
        if (manager.getExpression('ou')) {
            manager.setValue('ou', clamp(blendShapes.ou));
        }
        if (manager.getExpression('ee')) {
            manager.setValue('ee', clamp(blendShapes.ee));
        }
        if (manager.getExpression('oh')) {
            manager.setValue('oh', clamp(blendShapes.oh));
        }
    }

    /**
     * Linear interpolation helper
     * @private
     */
    _lerp(start, end, t) {
        return start + (end - start) * t;
    }

    /**
     * Set smoothing factor
     * @param {number} factor - 0-1, higher = smoother
     */
    setSmoothingFactor(factor) {
        this.smoothingFactor = Math.max(0, Math.min(1, factor));
    }

    /**
     * Set gain multiplier
     * @param {number} gain - Multiplier for blend shape intensities
     */
    setGainMultiplier(gain) {
        this.gainMultiplier = Math.max(0, gain);
    }

    /**
     * Play base64 audio and resolve when finished.
     * Stops any currently playing audio first.
     * @param {string} base64Audio
     * @returns {Promise<void>}
     */
    playAudio(base64Audio) {
        return new Promise((resolve, reject) => {
            if (!base64Audio) {
                resolve();
                return;
            }

            // lazy init audio context
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }

            // stop current audio
            if (this.currentSource) {
                try {
                    this.currentSource.stop();
                    this.currentSource.disconnect();
                } catch (e) {
                    // ignore if already stopped
                }
            }

            try {
                // Decode base64 to array buffer
                const binaryString = atob(base64Audio);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }

                // Decode audio data
                this.audioContext.decodeAudioData(bytes.buffer, (buffer) => {
                    const source = this.audioContext.createBufferSource();
                    source.buffer = buffer;
                    source.connect(this.audioContext.destination);

                    source.onended = () => {
                        this.currentSource = null;
                        resolve();
                    };

                    this.currentSource = source;
                    source.start(0);

                }, (err) => {
                    console.error('Error decoding audio context', err);
                    resolve(); // resolve anyway to not break loop
                });
            } catch (e) {
                console.error('Error in playAudio', e);
                resolve(); // resolve anyway
            }
        });
    }
}
