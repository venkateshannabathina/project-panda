/**
 * ExpressionManager.js
 * Manages VRM facial expressions with smooth transitions
 * 
 * Supports expressions: happy, sad, angry, surprised, neutral
 * Uses VRM's built-in expression system (expressionManager)
 */

export class ExpressionManager {
    constructor() {
        this.vrm = null;
        this.currentExpression = 'neutral';
        this.transitionState = null; // { from, to, progress, duration }

        // Map friendly names to VRM expression presets
        this.expressionMap = {
            'happy': 'happy',
            'sad': 'sad',
            'angry': 'angry',
            'surprised': 'surprised',
            'neutral': 'neutral',
            'relaxed': 'relaxed',
            'blink': 'blink',
            'blinkLeft': 'blinkLeft',
            'blinkRight': 'blinkRight'
        };
    }

    /**
     * Set the VRM model to control
     * Call this after loading the VRM model
     */
    setVRM(vrm) {
        this.vrm = vrm;
        console.log('✅ ExpressionManager: VRM model set');

        // Log available expressions
        if (vrm && vrm.expressionManager) {
            const expressions = vrm.expressionManager.expressionMap;
            console.log('📋 Available VRM expressions:', Object.keys(expressions));
        }
    }

    /**
     * Set a specific expression with intensity
     * @param {string} name - Expression name (happy, sad, angry, surprised, neutral)
     * @param {number} value - Intensity 0.0 to 1.0
     */
    setExpression(name, value = 1.0) {
        if (!this.vrm || !this.vrm.expressionManager) {
            console.warn('⚠️ ExpressionManager: VRM not loaded yet');
            return;
        }

        const vrmExpressionName = this.expressionMap[name];
        if (!vrmExpressionName) {
            console.warn(`⚠️ ExpressionManager: Unknown expression "${name}"`);
            return;
        }

        // Clamp value between 0 and 1
        const clampedValue = Math.max(0, Math.min(1, value));

        try {
            this.vrm.expressionManager.setValue(vrmExpressionName, clampedValue);
            this.currentExpression = name;
            console.log(`😊 Expression set: ${name} (${clampedValue.toFixed(2)})`);
        } catch (error) {
            console.error(`❌ ExpressionManager: Error setting expression "${name}":`, error);
        }
    }

    /**
     * Reset all expressions to neutral
     */
    resetExpressions() {
        if (!this.vrm || !this.vrm.expressionManager) {
            return;
        }

        // Reset all expressions to 0
        for (const expressionName of Object.values(this.expressionMap)) {
            try {
                this.vrm.expressionManager.setValue(expressionName, 0.0);
            } catch (error) {
                // Expression might not exist in this VRM, that's OK
            }
        }

        this.currentExpression = 'neutral';
        this.transitionState = null;
        console.log('😐 Expressions reset to neutral');
    }

    /**
     * Smoothly transition to a new expression over time
     * @param {string} name - Target expression
     * @param {number} duration - Transition duration in seconds (default: 0.5s)
     */
    transitionTo(name, duration = 0.5) {
        if (!this.vrm || !this.vrm.expressionManager) {
            console.warn('⚠️ ExpressionManager: VRM not loaded yet');
            return;
        }

        // Start transition
        this.transitionState = {
            from: this.currentExpression,
            to: name,
            progress: 0.0,
            duration: duration
        };

        console.log(`🔄 Transitioning from ${this.currentExpression} to ${name} over ${duration}s`);
    }

    /**
     * Update transitions (call in render loop)
     * @param {number} delta - Time delta in seconds
     */
    update(delta) {
        if (!this.transitionState) {
            return;
        }

        const state = this.transitionState;
        state.progress += delta / state.duration;

        if (state.progress >= 1.0) {
            // Transition complete
            this.setExpression(state.to, 1.0);
            this.transitionState = null;
        } else {
            // Interpolate between expressions
            const t = state.progress;

            // Ease out cubic for smooth deceleration
            const eased = 1 - Math.pow(1 - t, 3);

            // Set FROM expression (fading out)
            this.setExpression(state.from, 1.0 - eased);

            // Set TO expression (fading in)
            this.setExpression(state.to, eased);
        }
    }

    /**
     * Get current active expression name
     */
    getCurrentExpression() {
        return this.currentExpression;
    }

    /**
     * Check if an expression is available in the loaded VRM
     * @param {string} name - Expression name to check
     * @returns {boolean}
     */
    hasExpression(name) {
        if (!this.vrm || !this.vrm.expressionManager) {
            return false;
        }

        const vrmExpressionName = this.expressionMap[name];
        return this.vrm.expressionManager.expressionMap.hasOwnProperty(vrmExpressionName);
    }
}
