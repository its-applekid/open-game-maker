# Good three.js fixture

```ts
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 100);
const renderer = new THREE.WebGLRenderer({ antialias: true });
const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
scene.add(mesh);
new OrbitControls(camera, renderer.domElement);
renderer.setAnimationLoop(() => renderer.render(scene, camera));
```
