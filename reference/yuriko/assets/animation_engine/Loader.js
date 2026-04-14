import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin } from '@pixiv/three-vrm';

export class Loader {
    constructor(scene) {
        this.scene = scene;
        this.loader = new GLTFLoader();
        this.loader.register((parser) => new VRMLoaderPlugin(parser));
    }

    load(url) {
        return new Promise((resolve, reject) => {
            this.loader.load(
                url,
                (gltf) => {
                    this.scene.add(gltf.scene);
                    resolve(gltf);
                },
                undefined,
                (error) => {
                    console.error('An error happened loading the model:', error);
                    reject(error);
                }
            );
        });
    }
}
