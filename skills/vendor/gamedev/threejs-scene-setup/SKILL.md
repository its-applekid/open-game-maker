---
license: Apache-2.0
source: gamedev-skills/awesome-gamedev-agent-skills@184b72be02884f782a0058f2eeae2ce4277453e4 skills/web-engines/threejs-scene-setup/SKILL.md
modified: true
name: threejs-scene-setup
description: >
  Stand up a three.js scene: Vite imports and the three/addons path, the
  Scene/PerspectiveCamera/WebGLRenderer trio, the setAnimationLoop render loop,
  responsive resize, OrbitControls, and opting into WebGPURenderer. Use when
  starting or debugging a three.js app — when the user mentions three.js,
  THREE.Scene, WebGLRenderer, WebGPURenderer, PerspectiveCamera, the render loop,
  resizing, or OrbitControls. For models use
  threejs-gltf-loading; for materials/lights use threejs-materials-lighting.
---

# three.js Scene Setup

Create the foundation of a three.js app: module loading, the
scene/camera/renderer trio, the render loop, responsive resizing, and camera
controls. Patterns target **r186**. Read the installed `three` version before
changing an existing project because examples and addons move across releases.

## When to use

- Use when bootstrapping a three.js scene, fixing a blank/black canvas, making the
  canvas responsive, setting up the animation loop, or adding `OrbitControls`.
- Use when `package.json` depends on `three` and code does `import * as THREE from
  'three'`.

**When *not* to use:** loading `.gltf`/`.glb` models or skinned animation →
`threejs-gltf-loading`. Materials, lights, shadows, environment maps →
`threejs-materials-lighting`. 2D games → `phaser-core`.

## Core workflow

1. **Load three.js as an ES module through Vite.** `npm i three` and import the
   bare specifier `'three'`; Vite bundles it, so the game runs offline with no CDN.
   Addons (controls, loaders) live under `three/addons/...`.
2. **Create the trio.** A `Scene` (root of the graph), a `PerspectiveCamera(fov,
   aspect, near, far)` moved back from the origin, and a `WebGLRenderer` whose
   `domElement` is in the DOM. Set size and `pixelRatio`.
3. **Add a mesh.** `new Mesh(geometry, material)` and `scene.add(mesh)`. With a
   lit material you also need a light (see `threejs-materials-lighting`).
4. **Drive a render loop with `renderer.setAnimationLoop(fn)`.** It's the modern,
   WebXR-/WebGPU-safe replacement for hand-rolled `requestAnimationFrame`. Use a
   `Timer` for delta time (`Clock` is deprecated since r183).
5. **Handle resize** so the camera aspect and renderer match the canvas; update
   `camera.aspect`, call `updateProjectionMatrix()`, and `renderer.setSize(...)`.
6. **Add `OrbitControls`** for orbit/pan/zoom while developing. Confirm something
   actually renders (a lit cube, the controls responding) before assuming success.

## Patterns

### 1. Vite module entry

```ts
// index.html holds <canvas id="c"></canvas> and <script type="module" src="/src/main.ts"></script>.
// src/main.ts — Vite resolves and bundles these from node_modules (npm i three); no import map, works offline.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
```

Types ship with `@types/three`; pin it to the same release as `three`.

### 2. Scene + camera + renderer

```ts
// src/main.ts
import * as THREE from 'three';

const canvas = document.querySelector<HTMLCanvasElement>('#c')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // cap for perf
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101018);

const camera = new THREE.PerspectiveCamera(
  60,                                   // vertical field of view (degrees)
  window.innerWidth / window.innerHeight, // aspect
  0.1,                                  // near
  100                                   // far
);
camera.position.set(3, 2, 5);
camera.lookAt(0, 0, 0);

const cube = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshNormalMaterial()        // unlit; shows orientation without a light
);
scene.add(cube);
```

### 3. The render loop (setAnimationLoop + Timer)

```ts
const timer = new THREE.Timer();        // replaces the deprecated THREE.Clock (r183+)
timer.connect(document);                // optional: no huge delta after a hidden tab

renderer.setAnimationLoop((time: number) => {
  timer.update(time);                   // call once per frame, before getDelta()
  const dt = timer.getDelta();          // seconds since last frame
  cube.rotation.x += dt;                // frame-rate independent
  cube.rotation.y += dt * 0.7;
  renderer.render(scene, camera);
});
// renderer.setAnimationLoop(null); // stop the loop
```

### 4. Responsive resize

```ts
function onResize(): void {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();      // required after changing aspect
  renderer.setSize(w, h);
}
window.addEventListener('resize', onResize);
```

### 5. OrbitControls (orbit / pan / zoom)

```ts
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;          // inertial feel
controls.target.set(0, 0, 0);

renderer.setAnimationLoop(() => {
  controls.update();                    // needed every frame when damping is on
  renderer.render(scene, camera);
});
```

### 6. Opting into WebGPURenderer (only when you need it)

`WebGLRenderer` stays the default choice for compatibility. Switch to
`WebGPURenderer` when the project needs TSL node materials or compute shaders; it
falls back to a WebGL 2 backend where WebGPU is unavailable.

```ts
// With Vite, 'three/webgpu' and 'three/tsl' resolve from the installed package.
// Build every scene object from this same import, not a second 'three' import.
import * as THREE from 'three/webgpu';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);

const renderer = new THREE.WebGPURenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
await renderer.init();                  // required before direct render()/compute()

renderer.setAnimationLoop(() => renderer.render(scene, camera));
```

Scenes, cameras, built-in `Mesh*Material`s, and most addons carry over; custom
GLSL (`ShaderMaterial`, `onBeforeCompile`) does not.

## Pitfalls

- **`Failed to resolve import "three"`** → `three` is not installed in the game's
  `package.json`; run `npm i three` (and `@types/three`) and import through Vite.
- **Black canvas, no errors** → camera is at the origin (inside/behind the object),
  or you used a lit material (`MeshStandardMaterial`) with no light. Move the camera
  back; use `MeshNormalMaterial`/`MeshBasicMaterial` to verify geometry first.
- **Nothing animates** → you never called `renderer.render` inside the loop, or you
  call `setAnimationLoop` but render outside it.
- **Stretched / squashed view on resize** → you resized the renderer but didn't
  update `camera.aspect` + `updateProjectionMatrix()`.
- **Blurry or jagged on HiDPI** → set `renderer.setPixelRatio(...)`; cap it (≈2) so
  4K/retina screens don't tank performance.
- **OrbitControls feel dead** → with `enableDamping = true` you must call
  `controls.update()` every frame.
- **Old tutorials use `<script src="three.min.js">` or `examples/js/...`** →
  `examples/js` was removed in r148 and `build/three.min.js` in r161; use
  ES module imports bundled by Vite.
- **`.render() called before the backend is initialized`** (WebGPURenderer) → call
  `await renderer.init()` before any direct `render()`/`compute()`, or render only
  from `setAnimationLoop`, which initializes first.
- **`Material "ShaderMaterial" is not compatible`, or an `onBeforeCompile` patch is
  ignored** (WebGPURenderer) → it renders node materials only; port the effect to
  TSL, or stay on `WebGLRenderer`.

## References

- For coordinate conventions, the scene-graph (`Group`, parent/child transforms,
  `Object3D` add/remove), `OrthographicCamera` for 2.5D, and disposing of
  geometries/materials/textures to avoid leaks, read `references/scene-graph.md`.

## Related skills

- `threejs-materials-lighting` — give surfaces a lit look (lights, shadows, PBR).
- `threejs-gltf-loading` — load 3D models and play their animations.
- `phaser-core` — 2D games in the browser.
- `fps-shooter` — a 3D genre template that composes three.js skills.
