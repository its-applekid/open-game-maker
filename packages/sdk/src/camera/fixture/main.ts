import type { ActionFrame, ViewId } from '@ogm/contracts';
import {
  BoxGeometry,
  Color,
  DirectionalLight,
  Mesh,
  MeshLambertMaterial,
  PlaneGeometry,
  Raycaster,
  Scene,
  Vector2,
  WebGLRenderer,
} from 'three';

import { createRig } from '../index.js';

const views = new Set<ViewId>(['iso', 'topdown', 'side', 'follow', 'fps', 'orbit', 'fixed']);
const requested = new URLSearchParams(location.search).get('view') as ViewId | null;
const view: ViewId = requested && views.has(requested) ? requested : 'iso';
function requireCanvas(): HTMLCanvasElement {
  const candidate = document.querySelector<HTMLCanvasElement>('#game');
  if (!candidate) throw new Error('camera fixture canvas is missing');
  return candidate;
}

const canvas = requireCanvas();

const renderer = new WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
renderer.setSize(640, 360, false);
const scene = new Scene();
scene.background = new Color(0x151922);
scene.add(new DirectionalLight(0xffffff, 2));

const floor = new Mesh(new PlaneGeometry(12, 8), new MeshLambertMaterial({ color: 0x334155 }));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const player = new Mesh(new BoxGeometry(1, 1, 1), new MeshLambertMaterial({ color: 0xf59e0b }));
player.position.set(0, 0.5, 0);
player.name = 'player';
scene.add(player);

function addWall(x: number, z: number, width: number, depth: number, name: string): Mesh {
  const mesh = new Mesh(new BoxGeometry(width, 2, depth), new MeshLambertMaterial({ color: 0x64748b }));
  mesh.position.set(x, 1, z);
  mesh.userData.occluder = true;
  mesh.name = name;
  scene.add(mesh);
  return mesh;
}

const cutawayWall = addWall(2, 2, 4, 0.4, 'south-east');
addWall(-3, 0, 0.4, 8, 'west');
addWall(0, -3.8, 12, 0.4, 'north');

const targetPosition: [number, number, number] = view === 'fps' ? [0, 0, 3] : [0, 0, 0];
const rig = createRig(view, '3d', {
  three: {
    scene,
    viewport: () => ({ width: canvas.width, height: canvas.height }),
    reduceMotion: true,
  },
});
rig.attach({ position: () => targetPosition }, 0);

const frame: ActionFrame = { playerIndex: 0, tick: 60, source: 'keyboard', actions: {} };
const raycaster = new Raycaster();
let calls = 0;

function renderAt(): void {
  rig.update(1, frame);
  renderer.render(scene, rig.camera);
  calls += 1;
}

function playerScreen(): { x: number; y: number } | null {
  return rig.worldToScreen(player.position.toArray());
}

function hitTest(x: number, y: number): boolean {
  raycaster.setFromCamera(new Vector2((x / canvas.width) * 2 - 1, 1 - (y / canvas.height) * 2), rig.camera);
  return raycaster.intersectObject(player, false).length > 0;
}

function renderGameToText(): string {
  return JSON.stringify({
    view,
    player: player.position.toArray().map((value) => value.toFixed(4)),
    camera: rig.camera.position.toArray().map((value) => value.toFixed(4)),
    rotation: rig.camera.quaternion.toArray().map((value) => value.toFixed(6)),
    cutaway: cutawayWall.scale.y.toFixed(4),
  });
}

renderAt();

declare global {
  interface Window {
    __camera: {
      ready: boolean;
      hitTest(x: number, y: number): boolean;
      playerScreen(): { x: number; y: number } | null;
      probes(): { cutaway: number };
      renderAt(ms: number): void;
      renderGameToText(): string;
      renderInfo(): { calls: number; backend: string };
    };
  }
}

window.__camera = {
  ready: true,
  hitTest,
  playerScreen,
  probes: () => ({ cutaway: cutawayWall.scale.y }),
  renderAt,
  renderGameToText,
  renderInfo: () => ({
    calls: Math.max(calls, renderer.info.render.calls),
    backend: renderer.getContext().getParameter(0x1f01),
  }),
};
