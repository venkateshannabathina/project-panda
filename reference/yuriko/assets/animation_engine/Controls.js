import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class Controls {
    constructor(camera, domElement) {
        this.controls = new OrbitControls(camera, domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.target.set(0, 1, 0);
    }

    update() {
        this.controls.update();
    }
}
