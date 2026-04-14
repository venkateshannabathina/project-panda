/**
 * BlinkManager.js
 * Automatic eye blinking system for VRM characters
 * 
 * Features:
 * - Natural random blinking (every 3-6 seconds)
 * - Smooth blink animation (close → hold → open)
 * - Support for both eyes or individual eye control
 */

export class BlinkManager {
    constructor() {
        this.vrm = null;
        this.enabled = true;

        // Timing
        this.nextBlinkTime = this.getRandomBlinkDelay();
        this.blinkTimer = 0;

        // Blink animation state
        this.isBlinking = false;
        this.blinkPhase = 'idle'; // idle, closing, holding, opening
        this.blinkProgress = 0;

        // Blink phases (in seconds)
        this.closeDuration = 0.1;   // 100ms to close
        this.holdDuration = 0.05;   // 50ms hold closed
        this.openDuration = 0.15;   // 150ms to open

        // Current blink value (0 = open, 1 = closed)
        this.blinkValue = 0;
    }

    /**
     * Set the VRM model to control
     */
    setVRM(vrm) {
        this.vrm = vrm;
        console.log('✅ BlinkManager: VRM model set');

        // Check if blink expressions are available
        if (vrm && vrm.expressionManager) {
            const hasBlink = vrm.expressionManager.expressionMap.hasOwnProperty('blink');
            console.log(`👁️ Blink expression available: ${hasBlink}`);
        }
    }

    /**
     * Enable or disable automatic blinking
     */
    setEnabled(enabled) {
        this.enabled = enabled;
        if (!enabled) {
            this.resetBlink();
        }
        console.log(`👁️ BlinkManager: ${enabled ? 'Enabled' : 'Disabled'}`);
    }

    /**
     * Get random delay between blinks (3-6 seconds)
     */
    getRandomBlinkDelay() {
        return 3.0 + Math.random() * 3.0; // Random between 3 and 6 seconds
    }

    /**
     * Reset blink state (eyes open)
     */
    resetBlink() {
        if (this.vrm && this.vrm.expressionManager) {
            try {
                this.vrm.expressionManager.setValue('blink', 0);
            } catch (error) {
                // Blink expression might not exist
            }
        }

        this.isBlinking = false;
        this.blinkPhase = 'idle';
        this.blinkProgress = 0;
        this.blinkValue = 0;
    }

    /**
     * Trigger a blink manually
     */
    triggerBlink() {
        if (!this.isBlinking) {
            this.isBlinking = true;
            this.blinkPhase = 'closing';
            this.blinkProgress = 0;
        }
    }

    /**
     * Update blink animation (call in render loop)
     * @param {number} delta - Time delta in seconds
     */
    update(delta) {
        if (!this.vrm || !this.vrm.expressionManager || !this.enabled) {
            return;
        }

        // Check if it's time for a new blink
        if (!this.isBlinking) {
            this.blinkTimer += delta;

            if (this.blinkTimer >= this.nextBlinkTime) {
                // Start a new blink
                this.triggerBlink();
                this.blinkTimer = 0;
                this.nextBlinkTime = this.getRandomBlinkDelay();
            }
        }

        // Update blink animation
        if (this.isBlinking) {
            this.updateBlinkAnimation(delta);
        }
    }

    /**
     * Update the blink animation phases
     */
    updateBlinkAnimation(delta) {
        this.blinkProgress += delta;

        switch (this.blinkPhase) {
            case 'closing':
                // Eyes closing (0 → 1)
                const closeT = Math.min(1, this.blinkProgress / this.closeDuration);
                this.blinkValue = closeT;

                if (closeT >= 1.0) {
                    this.blinkPhase = 'holding';
                    this.blinkProgress = 0;
                }
                break;

            case 'holding':
                // Eyes fully closed
                this.blinkValue = 1.0;

                if (this.blinkProgress >= this.holdDuration) {
                    this.blinkPhase = 'opening';
                    this.blinkProgress = 0;
                }
                break;

            case 'opening':
                // Eyes opening (1 → 0)
                const openT = Math.min(1, this.blinkProgress / this.openDuration);
                this.blinkValue = 1.0 - openT;

                if (openT >= 1.0) {
                    // Blink complete
                    this.isBlinking = false;
                    this.blinkPhase = 'idle';
                    this.blinkValue = 0;
                    this.blinkProgress = 0;
                }
                break;
        }

        // Apply blink value to VRM
        this.applyBlink();
    }

    /**
     * Apply current blink value to VRM expression
     */
    applyBlink() {
        if (!this.vrm || !this.vrm.expressionManager) {
            return;
        }

        try {
            // Use 'blink' expression for both eyes
            this.vrm.expressionManager.setValue('blink', this.blinkValue);
        } catch (error) {
            // Blink expression might not exist in this VRM
            console.warn('⚠️ BlinkManager: Blink expression not available');
        }
    }

    /**
     * Blink individual eyes (for asymmetric expressions)
     * @param {string} eye - 'left', 'right', or 'both'
     */
    blinkEye(eye = 'both') {
        if (!this.vrm || !this.vrm.expressionManager) {
            return;
        }

        try {
            if (eye === 'both') {
                this.vrm.expressionManager.setValue('blink', 1.0);
            } else if (eye === 'left') {
                this.vrm.expressionManager.setValue('blinkLeft', 1.0);
            } else if (eye === 'right') {
                this.vrm.expressionManager.setValue('blinkRight', 1.0);
            }
        } catch (error) {
            console.warn(`⚠️ BlinkManager: Could not blink ${eye} eye`);
        }
    }
}
