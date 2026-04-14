import * as THREE from 'three';

export class AnimationManager {
    constructor() {
        this.mixer = null;
        this.actions = {};
    }

    setMixer(scene) {
        this.mixer = new THREE.AnimationMixer(scene);
    }

    playClip(clip) {
        if (this.mixer) {
            const action = this.mixer.clipAction(clip);
            action.play();
            this.actions[clip.name] = action;
        }
    }

    setModel(gltf) {
        // Legacy support if needed, or remove
        if (gltf.animations && gltf.animations.length > 0) {
            this.mixer = new THREE.AnimationMixer(gltf.scene);
            gltf.animations.forEach((clip) => {
                this.actions[clip.name] = this.mixer.clipAction(clip);
            });

            // Play first animation by default if available
            const firstClip = gltf.animations[0];
            if (firstClip) {
                this.actions[firstClip.name].play();
            }
        }
    }

    update(delta) {
        if (this.mixer) {
            this.mixer.update(delta);
        }
    }
}
