// Dungeon editor + play mode. Throwaway prototype: one file, plain three.js, no build step.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import * as audio from './audio.js';

const $ = s => document.querySelector(s);
const MODELS = {
  wall: 'kenney/wall', floor: 'kenney/floor', floorDetail: 'kenney/floor-detail', stairs: 'kenney/stairs', chest: 'kenney/chest',
  coin: 'kenney/coin', potion: 'kenney/potion', barrel: 'kenney/barrel', column: 'kenney/column', banner: 'kenney/banner',
  rocks: 'kenney/rocks', stones: 'kenney/stones', table: 'kenney/table', chair: 'kenney/chair', pot: 'kenney/pot', trap: 'kenney/trap',
  sword: 'kenney/weapon-sword', human: 'kenney/character-human', shield: 'kenney/shield-round',
  goblin1: 'kenney/character-orc', goblin2: 'kenney/character-orc', goblin3: 'kenney/character-orc', spear: 'kenney/weapon-spear',
};
// goblins are Mini Dungeon's orc (same pack, rig and clips as the hero); strengths differ by tint and gear
const GOBLIN_SCALE = 0.85;
const GOBLIN_LOOK = { goblin1: { tint: '#ffffff' }, goblin2: { tint: '#c4d6a4', spear: true }, goblin3: { tint: '#e2a39a', spear: true } };
const GOBLIN_CLIPS = { run: 'sprint', attack: 'attack-melee-right', taunt: 'emote-no' };
const CATALOG = {
  build: { title: 'Build your dungeon', items: [
    { id: 'wall', name: 'Wall', paint: 2, thumb: 'wall' }, { id: 'floor', name: 'Floor', paint: 1, thumb: 'floor' },
    { id: 'dig', name: 'Dig a hole', paint: 0, thumb: 'rocks' }, { id: 'stairs', name: 'Start stairs', thumb: 'stairs', unique: true } ] },
  monsters: { title: 'Pick a monster', items: [
    { id: 'goblin1', name: 'Goblin Scout', thumb: 'goblin1', monster: true, strength: 'easy' },
    { id: 'goblin2', name: 'Goblin Brute', thumb: 'goblin2', monster: true, strength: 'medium' },
    { id: 'goblin3', name: 'Goblin Chief', thumb: 'goblin3', monster: true, strength: 'tough' } ] },
  treasure: { title: 'Pick a treasure', items: [
    { id: 'chest', name: 'Chest', thumb: 'chest' }, { id: 'coin', name: 'Coin', thumb: 'coin' }, { id: 'potion', name: 'Potion', thumb: 'potion' } ] },
  decor: { title: 'Pick decor', items: [
    { id: 'torch', name: 'Torch', thumb: 'torch' }, { id: 'barrel', name: 'Barrel', thumb: 'barrel' }, { id: 'column', name: 'Pillar', thumb: 'column' },
    { id: 'banner', name: 'Banner', thumb: 'banner' }, { id: 'rocks', name: 'Rocks', thumb: 'rocks' }, { id: 'table', name: 'Table', thumb: 'table' },
    { id: 'chair', name: 'Chair', thumb: 'chair' }, { id: 'pot', name: 'Pot', thumb: 'pot' } ] },
};
const ITEM = Object.fromEntries(Object.values(CATALOG).flatMap(c => c.items).map(i => [i.id, i]));
const SOLID = new Set(['barrel', 'column', 'chest', 'table', 'stairs', 'pot', 'rocks', 'torch']);
const STRENGTH = { easy: { hp: 2, dmg: 1, speed: 1.55, scale: .92 }, medium: { hp: 3, dmg: 1, speed: 1.35, scale: 1.04 }, tough: { hp: 5, dmg: 2, speed: 1.7, scale: 1.16 } };

const PRESET = {
  tiles: [
    '############',
    '#....#.....#',
    '#....#.....#',
    '#..........#',
    '#....#.....#',
    '##.###.....#',
    ' #...#######',
    ' #...#      ',
    ' #####      ',
  ],
  objects: [
    { type: 'stairs', x: 3, z: 7, rot: 0 }, { type: 'torch', x: 1, z: 1 }, { type: 'torch', x: 4, z: 1 }, { type: 'torch', x: 6, z: 1 },
    { type: 'torch', x: 10, z: 4 }, { type: 'chest', x: 10, z: 1, rot: 0, coins: 25 },
    { type: 'barrel', x: 1, z: 4 }, { type: 'barrel', x: 6, z: 4 }, { type: 'column', x: 8, z: 2 }, { type: 'banner', x: 8, z: 1, rot: 0 },
    { type: 'goblin1', x: 3, z: 2, rot: 0, strength: 'easy' }, { type: 'goblin2', x: 9, z: 3, rot: 3, strength: 'medium' },
    { type: 'coin', x: 7, z: 4 }, { type: 'coin', x: 2, z: 1 }, { type: 'potion', x: 4, z: 7 }, { type: 'rocks', x: 10, z: 5 }, { type: 'table', x: 3, z: 4 },
  ],
};
const decode = p => ({ tiles: p.tiles.map(r => [...r].map(c => c === '#' ? 2 : c === '.' ? 1 : 0)), objects: p.objects.map((o, i) => ({ id: i + 1, rot: 0, ...o })) });

// ---------------- state ----------------
let map, nextId = 100;
try { map = JSON.parse(localStorage.getItem('ogm-map')); } catch {}
if (!map?.tiles) map = decode(PRESET);
// the old preset had a torch blocking the corridor by the spawn stairs; drop it from saved maps too
map.objects = map.objects.filter(o => !(o.type === 'torch' && o.x === 2 && o.z === 6));
nextId = Math.max(100, ...map.objects.map(o => o.id + 1));
const MW = () => map.tiles[0].length, MH = () => map.tiles.length;
const tileAt = (x, z) => (z >= 0 && z < MH() && x >= 0 && x < MW()) ? map.tiles[z][x] : 0;
const objAt = (x, z) => map.objects.find(o => o.x === x && o.z === z);
const undoStack = [], redoStack = [];
function commit(fn) {
  undoStack.push(JSON.stringify(map)); redoStack.length = 0; if (undoStack.length > 80) undoStack.shift();
  fn(); save(); syncAll(); updateUndo();
}
function save() { try { localStorage.setItem('ogm-map', JSON.stringify(map)); } catch {} }
function undo() { if (!undoStack.length) return; redoStack.push(JSON.stringify(map)); map = JSON.parse(undoStack.pop()); afterHistory(); }
function redo() { if (!redoStack.length) return; undoStack.push(JSON.stringify(map)); map = JSON.parse(redoStack.pop()); afterHistory(); }
function afterHistory() { audio.play('back_001', { vol: .5 }); save(); select(null); syncAll(); updateUndo(); }
const updateUndo = () => { $('#undo').disabled = !undoStack.length; $('#redo').disabled = !redoStack.length; };

// ---------------- three setup ----------------
let renderer, scene, camera, gltfs = {}, stage, canvas;
const groups = {};
const roots = new Map(); // object id -> Object3D
const mixers = new Set();
let fitZoom = 1, camTarget = new THREE.Vector3(), camZoom = 1, trauma = 0, timeScale = 1, hitStopUntil = 0;
const ISO = new THREE.Vector3(1, 1.25, 1.05).normalize();
let mode = 'edit';
const torchLights = [];
let flameTex;

const loadAll = (async () => {
  const L = new GLTFLoader();
  await Promise.all(Object.entries(MODELS).map(async ([k, f]) => { gltfs[k] = await L.loadAsync(`assets/models/${f}.glb`); }));
  gltfs.coin.scene.scale.setScalar(1);
})();

export async function initEditor() {
  stage = $('#stage'); canvas = $('#c3d');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
  scene = new THREE.Scene(); scene.background = new THREE.Color('#2d2a3a');
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  scene.add(new THREE.HemisphereLight('#c3cdff', '#4a3550', 1.45));
  const moon = new THREE.DirectionalLight('#d5ddff', 1.3); moon.position.set(-6, 12, 4); moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024); Object.assign(moon.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 40 }); moon.shadow.bias = -0.0015;
  scene.add(moon, moon.target);
  groups.moon = moon;
  for (const k of ['tiles', 'objects', 'actors', 'fx', 'helpers']) { groups[k] = new THREE.Group(); scene.add(groups[k]); }
  // fixed light pool: changing the number of lights recompiles every material, so torches borrow from 6 lights
  for (let i = 0; i < 6; i++) { const l = new THREE.PointLight('#ffa040', 0, 5.5, 1.6); torchLights.push(l); scene.add(l); }
  flameTex = makeFlameTexture();
  buildHelpers();
  await loadAll;
  $('#loading').hidden = true;
  syncAll(); fitCamera(); resize();
  new ResizeObserver(resize).observe(stage);
  await makeThumbs();
  buildRail(); setCategory('monsters');
  bindEditorInput(); bindUI(); updateUndo();
  renderer.setAnimationLoop(frame);
}

function resize() {
  const w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return;
  renderer.setSize(w, h, false); camera.userData.aspect = w / h; applyCamera();
}
function fitCamera() {
  camTarget.set((MW() - 1) / 2, 0, (MH() - 1) / 2);
  const span = Math.max(MW(), MH());
  fitZoom = span * 0.41; camZoom = fitZoom;
}
function applyCamera(shake = 0) {
  const a = camera.userData.aspect || 1.5, s = camZoom;
  const sx = a >= 1 ? s * a : s, sy = a >= 1 ? s : s / a;
  Object.assign(camera, { left: -sx, right: sx, top: sy, bottom: -sy }); camera.updateProjectionMatrix();
  camera.position.copy(camTarget).addScaledVector(ISO, 30);
  if (shake) { camera.position.x += Math.sin(perfT * 37) * shake * .25; camera.position.y += Math.sin(perfT * 41) * shake * .18; camera.position.z += Math.sin(perfT * 29) * shake * .25; }
  camera.lookAt(camera.position.clone().addScaledVector(ISO, -1));
}

// ---------------- building the scene from the map ----------------
function instance(key) {
  const g = gltfs[key]; const o = SkeletonUtils.clone(g.scene);
  o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  return o;
}
function goblinModel(type) {
  const g = instance(type), look = GOBLIN_LOOK[type];
  g.traverse(m => { if (m.isMesh) { m.material = m.material.clone(); m.material.color.set(look.tint); } });
  if (look.spear) { // same hand mount as the hero's sword
    const w = instance('spear'); w.position.set(-0.25, 0, 0.03); w.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(.75, 0, .66).normalize()); w.scale.setScalar(.8);
    g.getObjectByName('arm-right').add(w);
  }
  return g;
}
function goblinClips(type) {
  const clips = Object.fromEntries(gltfs[type].animations.map(c => [c.name, c]));
  for (const [k, v] of Object.entries(GOBLIN_CLIPS)) clips[k] = clips[v];
  return clips;
}
function syncTiles() {
  groups.tiles.clear();
  for (let z = 0; z < MH(); z++) for (let x = 0; x < MW(); x++) {
    const t = tileAt(x, z);
    if (t === 1) { const f = instance(((x * 7 + z * 13) % 6 === 0) ? 'floorDetail' : 'floor'); f.position.set(x, 0, z); f.traverse(m => m.castShadow = false); groups.tiles.add(f); }
    if (t === 2) {
      let near = false; for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (tileAt(x + dx, z + dz) === 1) near = true;
      if (!near) continue;
      const w = instance('wall'); w.position.set(x, 0, z); groups.tiles.add(w);
      // cutaway: walls between the camera (+x,+z) and a floor are cut low so they never hide the action
      if (tileAt(x - 1, z) === 1 || tileAt(x, z - 1) === 1 || tileAt(x - 1, z - 1) === 1) { w.scale.y = 0.28; w.traverse(m => m.castShadow = false); }
    }
  }
  const pit = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: '#2a2738', roughness: 1 }));
  pit.rotation.x = -Math.PI / 2; pit.position.set((MW() - 1) / 2, -0.02, (MH() - 1) / 2); pit.receiveShadow = true; groups.tiles.add(pit);
}
function makeObject(o) {
  let root;
  if (o.type === 'torch') root = makeTorch(o);
  else if (o.type.startsWith('goblin')) {
    root = new THREE.Group();
    const g = goblinModel(o.type); g.scale.setScalar(GOBLIN_SCALE * STRENGTH[o.strength || 'easy'].scale);
    g.traverse(m => { if (m.isMesh) m.frustumCulled = false; });
    root.add(g);
    const mixer = new THREE.AnimationMixer(g); mixers.add(mixer);
    const clips = goblinClips(o.type);
    const idle = mixer.clipAction(clips.idle); idle.play(); idle.time = Math.random() * 2;
    root.userData.anim = { mixer, clips, current: idle, model: g };
  } else {
    root = new THREE.Group(); root.add(instance(o.type));
    if (o.type === 'chest') {
      const mixer = new THREE.AnimationMixer(root.children[0]); mixers.add(mixer);
      root.userData.anim = { mixer, clips: Object.fromEntries(gltfs.chest.animations.map(c => [c.name, c])) };
    }
    if (o.type === 'coin') { root.children[0].scale.setScalar(.55); root.children[0].position.y = .12; root.userData.spin = true; }
  }
  root.userData.oid = o.id; root.userData.type = o.type;
  return root;
}
function syncObjects() {
  const seen = new Set();
  for (const o of map.objects) {
    let r = roots.get(o.id);
    const sig = `${o.type}|${o.strength || ''}|${o.flame || ''}`;
    if (r && r.userData.sig !== sig) { disposeRoot(r); r = null; }
    if (!r) { r = makeObject(o); r.userData.sig = sig; roots.set(o.id, r); groups.objects.add(r); popIn(r); }
    r.position.set(o.x, 0, o.z); r.rotation.y = -(o.rot || 0) * Math.PI / 2;
    seen.add(o.id);
  }
  for (const [id, r] of roots) if (!seen.has(id)) { disposeRoot(r); roots.delete(id); }
}
function disposeRoot(r) { if (r.userData.anim) mixers.delete(r.userData.anim.mixer); r.removeFromParent(); }
function syncAll() { syncTiles(); syncObjects(); refreshSelection(); }
const pops = [];
function popIn(r) { if (!initDone) return; r.scale.setScalar(.82); pops.push({ r, t: 0 }); }
let initDone = false;

// torch: a wooden post + bowl + two additive flame sprites + embers; light comes from the shared pool
function makeTorch(o) {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: '#6b4a32', roughness: .9 });
  const metal = new THREE.MeshStandardMaterial({ color: '#4b4a55', roughness: .5, metalness: .6 });
  const post = new THREE.Mesh(new THREE.CylinderGeometry(.035, .05, .62, 6), wood); post.position.y = .31;
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(.12, .14, .06, 8), metal); foot.position.y = .03;
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(.11, .06, .1, 8, 1, true), metal); bowl.position.y = .66;
  [post, foot, bowl].forEach(m => { m.castShadow = true; g.add(m); });
  const color = o.flame === 'blue' ? ['#7fd3ff', '#e8fbff'] : o.flame === 'green' ? ['#8cff7a', '#f0ffe0'] : ['#ff8a2a', '#ffe9a0'];
  const outer = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, color: color[0], blending: THREE.AdditiveBlending, depthWrite: false }));
  const inner = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, color: color[1], blending: THREE.AdditiveBlending, depthWrite: false }));
  outer.position.y = inner.position.y = .82; g.add(outer, inner);
  const embers = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(10 * 3), 3)),
    new THREE.PointsMaterial({ color: color[0], size: .045, transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false }));
  embers.userData.seeds = Array.from({ length: 10 }, () => Math.random());
  g.add(embers);
  g.userData.torch = { outer, inner, embers, phase: Math.random() * 100, color: new THREE.Color(color[0]) };
  return g;
}
function makeFlameTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128; const x = c.getContext('2d');
  const gr = x.createRadialGradient(32, 84, 2, 32, 76, 46); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.35, 'rgba(255,255,255,.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.beginPath(); x.moveTo(32, 4); x.bezierCurveTo(58, 60, 60, 120, 32, 124); x.bezierCurveTo(4, 120, 6, 60, 32, 4); x.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const noise1 = t => Math.sin(t * 7.3) * .5 + Math.sin(t * 13.7 + 1.3) * .3 + Math.sin(t * 23.1 + 2.1) * .2;
function updateTorches(dt) {
  const torches = []; groups.objects.children.forEach(r => r.userData.torch && torches.push(r));
  const focus = mode === 'play' && player ? player.root.position : camTarget;
  torches.sort((a, b) => a.position.distanceToSquared(focus) - b.position.distanceToSquared(focus));
  torchLights.forEach((l, i) => {
    const r = torches[i]; if (!r) { l.intensity = 0; return; }
    const T = r.userData.torch; const f = noise1(perfT * 1.4 + T.phase);
    l.position.set(r.position.x, .95, r.position.z); l.color.copy(T.color); l.intensity = 9 + f * 2.2;
  });
  for (const r of torches) {
    const T = r.userData.torch; const f = noise1(perfT * 1.6 + T.phase);
    T.outer.scale.set(.32 + f * .03, .5 + f * .07, 1); T.inner.scale.set(.16 + f * .02, .28 + f * .05, 1);
    T.outer.position.x = f * .01; T.inner.material.rotation = f * .05;
    const p = T.embers.geometry.attributes.position, seeds = T.embers.userData.seeds;
    for (let i = 0; i < seeds.length; i++) { const k = (perfT * .6 + seeds[i]) % 1; p.setXYZ(i, Math.sin(seeds[i] * 40 + k * 6) * .07 * k, .85 + k * .55, Math.cos(seeds[i] * 31 + k * 5) * .07 * k); }
    p.needsUpdate = true; T.embers.material.opacity = .9;
  }
  if (mode !== 'play') audio.setFireLevel(Math.min(.9, .25 + torches.length * .12));
}

// ---------------- helpers: hover tile, ghost, selection ring ----------------
let hover, ring, ghost = null;
function buildHelpers() {
  const sq = new THREE.Shape(); sq.moveTo(-.5, -.5); sq.lineTo(.5, -.5); sq.lineTo(.5, .5); sq.lineTo(-.5, .5); sq.lineTo(-.5, -.5);
  const hole = new THREE.Path(); hole.moveTo(-.44, -.44); hole.lineTo(-.44, .44); hole.lineTo(.44, .44); hole.lineTo(.44, -.44); hole.lineTo(-.44, -.44); sq.holes.push(hole);
  hover = new THREE.Mesh(new THREE.ShapeGeometry(sq), new THREE.MeshBasicMaterial({ color: '#ffb547', transparent: true, opacity: .95, depthTest: false }));
  hover.rotation.x = -Math.PI / 2; hover.position.y = .02; hover.renderOrder = 5; hover.visible = false;
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(.88, .88), new THREE.MeshBasicMaterial({ color: '#ffb547', transparent: true, opacity: .18, depthTest: false }));
  hover.add(fill);
  ring = new THREE.Mesh(new THREE.RingGeometry(.36, .46, 32), new THREE.MeshBasicMaterial({ color: '#ff8a3d', transparent: true, opacity: .95, depthTest: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = .03; ring.renderOrder = 6; ring.visible = false;
  groups.helpers.add(hover, ring);
}
function setGhost(type) {
  if (ghost) { ghost.removeFromParent(); ghost = null; }
  if (!type || ITEM[type]?.paint !== undefined) return;
  ghost = makeObject({ id: -1, type, strength: ITEM[type].strength });
  ghost.traverse(m => { if (m.material) { m.material = m.material.clone(); m.material.transparent = true; m.material.opacity = .55; m.material.depthWrite = false; } });
  if (ghost.userData.anim) mixers.delete(ghost.userData.anim.mixer);
  ghost.visible = false; groups.helpers.add(ghost);
}

// ---------------- selection + inspector ----------------
let selected = null, tool = null, category = 'monsters';
function select(id) {
  const prev = selected; selected = id;
  const o = map.objects.find(o => o.id === id);
  if (prev !== id && prev != null) { const r = roots.get(prev); if (r?.userData.type === 'chest') playChest(r, 'close'); }
  if (o) {
    audio.play('select_001', { vol: .5 });
    const r = roots.get(id); if (r?.userData.type === 'chest' && prev !== id) playChest(r, 'open');
    if (r?.userData.anim?.clips?.taunt && prev !== id) playOnce(r, 'taunt', 1);
  }
  refreshSelection(); renderInspector();
}
function refreshSelection() {
  const o = map.objects.find(o => o.id === selected);
  if (!o) { selected = null; ring.visible = false; return; }
  ring.visible = mode === 'edit'; ring.position.set(o.x, .03, o.z);
}
function renderInspector() {
  const o = map.objects.find(o => o.id === selected);
  const insp = $('#inspector');
  insp.classList.toggle('has', !!o);
  $('#inspEmpty').hidden = !!o; $('#inspBody').hidden = !o;
  if (!o) return;
  const it = ITEM[o.type];
  $('#inspName').textContent = it?.name || o.type;
  $('#inspThumb').src = thumbs[it?.thumb || o.type] || '';
  const props = $('#inspProps'); props.innerHTML = '';
  const seg = (label, key, opts, onPick) => {
    const l = document.createElement('label'); l.textContent = label; props.append(l);
    const s = document.createElement('div'); s.className = 'seg';
    opts.forEach(([v, text]) => { const b = document.createElement('button'); b.textContent = text; b.classList.toggle('on', (o[key] ?? opts[0][0]) === v);
      b.onclick = () => { commit(() => { o[key] = v; onPick?.(v); }); audio.play('click_001', { vol: .5 }); renderInspector(); }; s.append(b); });
    props.append(s);
  };
  if (it?.monster) seg('Strength', 'strength', [['easy', 'Easy'], ['medium', 'Medium'], ['tough', 'Tough']]);
  if (o.type === 'chest') seg('Treasure inside', 'coins', [[10, '10 🪙'], [25, '25 🪙'], [50, '50 🪙']]);
  if (o.type === 'torch') seg('Flame', 'flame', [[undefined, 'Warm'], ['blue', 'Blue'], ['green', 'Green']]);
  if (o.type === 'potion') { const p = document.createElement('p'); p.textContent = 'Heals one heart when the hero walks over it.'; props.append(p); }
  if (o.type === 'stairs') { const p = document.createElement('p'); p.textContent = 'The hero starts here when you press Try it!'; props.append(p); }
  $('#copy').disabled = o.type === 'stairs'; $('#remove').disabled = o.type === 'stairs';
}

// ---------------- tray + rail ----------------
const thumbs = {};
async function makeThumbs() {
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); r.setSize(192, 192); r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.2;
  const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight('#ffffff', '#8a7a9a', 2.2)); const d = new THREE.DirectionalLight('#fff', 1.6); d.position.set(3, 5, 4); sc.add(d);
  const cam = new THREE.PerspectiveCamera(28, 1, .01, 50);
  const keys = new Set(Object.values(CATALOG).flatMap(c => c.items.map(i => i.thumb)));
  for (const k of keys) {
    const o = k === 'torch' ? makeTorch({}) : k.startsWith('goblin') ? (() => { const g = goblinModel(k); g.scale.setScalar(GOBLIN_SCALE); const m = new THREE.AnimationMixer(g); m.clipAction(gltfs[k].animations.find(a => a.name === 'idle')).play(); m.update(.6); return g; })() : instance(k);
    if (k === 'torch') { o.userData.torch.outer.scale.set(.32, .5, 1); o.userData.torch.inner.scale.set(.16, .28, 1); }
    sc.add(o); o.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(o); const c = box.getCenter(new THREE.Vector3()); const s = box.getSize(new THREE.Vector3()).length();
    cam.position.copy(c).add(new THREE.Vector3(1, .8, 1.25).normalize().multiplyScalar(s * 2.1)); cam.lookAt(c);
    r.render(sc, cam); thumbs[k] = r.domElement.toDataURL('image/png');
    sc.remove(o);
  }
  r.dispose();
  document.querySelectorAll('[data-thumb]').forEach(e => e.style.backgroundImage = `url(${thumbs[e.dataset.thumb]})`);
}
function buildRail() {
  document.querySelectorAll('#rail button').forEach(b => b.onclick = () => { audio.play('click_001', { vol: .5 }); setCategory(b.dataset.cat); });
}
function setCategory(cat) {
  category = cat;
  document.querySelectorAll('#rail button').forEach(b => b.classList.toggle('on', b.dataset.cat === cat));
  $('#trayTitle').textContent = CATALOG[cat].title;
  const items = $('#items'); items.innerHTML = '';
  for (const it of CATALOG[cat].items) {
    const b = document.createElement('button'); b.className = 'item'; b.dataset.id = it.id;
    b.innerHTML = `<span class="thumb" style="background-image:url(${thumbs[it.thumb]})"></span><span>${it.name}</span>${it.monster ? `<small>${it.strength}</small>` : ''}`;
    b.onclick = () => setTool(tool === it.id ? null : it.id);
    items.append(b);
  }
  setTool(null);
}
function setTool(id) {
  tool = id; audio.play('click_001', { vol: .45 });
  document.querySelectorAll('.item').forEach(b => b.classList.toggle('on', b.dataset.id === id));
  setGhost(id);
  const it = ITEM[id];
  hint(it ? (it.paint !== undefined ? `Tap or drag over tiles to paint: ${it.name}` : `Tap the floor to place: ${it.name}`) : 'Tap something to select it · drag to move · drag empty space to look around');
}
let hintTimer;
function hint(text) { const h = $('#hint'); h.textContent = text; h.style.opacity = 1; clearTimeout(hintTimer); hintTimer = setTimeout(() => h.style.opacity = .0, 5000); }

// ---------------- editor input ----------------
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function pick(e) {
  const r = canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const p = new THREE.Vector3(); ray.ray.intersectPlane(plane, p);
  const hits = ray.intersectObjects(groups.objects.children, true);
  let oid = null; for (const h of hits) { let n = h.object; while (n && n.userData.oid == null) n = n.parent; if (n) { oid = n.userData.oid; break; } }
  return { tx: Math.round(p.x), tz: Math.round(p.z), oid, p };
}
function canPlace(type, x, z, ignoreId) {
  if (tileAt(x, z) !== 1) return false;
  const o = objAt(x, z); return !o || o.id === ignoreId;
}
function autoRot(type, x, z) { // wall-hung things face away from the nearest wall
  if (type !== 'banner' && type !== 'torch' && type !== 'stairs') return 0;
  const dirs = [[0, -1, 0], [1, 0, 1], [0, 1, 2], [-1, 0, 3]];
  for (const [dx, dz, r] of dirs) if (tileAt(x + dx, z + dz) === 2) return (r + 2) % 4;
  return 0;
}
function bindEditorInput() {
  const pointers = new Map(); let drag = null, pinch = null;
  canvas.addEventListener('pointerdown', e => {
    if (mode !== 'edit') return;
    canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: camZoom }; drag = null; return; }
    const h = pick(e);
    const it = ITEM[tool];
    if (e.button === 1 || e.button === 2) { drag = { kind: 'pan', x: e.clientX, y: e.clientY, t: camTarget.clone() }; return; }
    if (it?.paint !== undefined) { drag = { kind: 'paint', painted: new Set(), before: JSON.stringify(map) }; paintAt(h.tx, h.tz, drag); return; }
    if (h.oid != null && !it) { select(h.oid); drag = { kind: 'move', id: h.oid, x: e.clientX, y: e.clientY, moved: false }; return; }
    drag = { kind: 'maybe-place', x: e.clientX, y: e.clientY, t: camTarget.clone(), h };
  });
  canvas.addEventListener('pointermove', e => {
    if (mode !== 'edit') return;
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size === 2) { const [a, b] = [...pointers.values()]; camZoom = THREE.MathUtils.clamp(pinch.z * pinch.d / Math.hypot(a.x - b.x, a.y - b.y), fitZoom * .35, fitZoom * 1.4); applyCamera(); return; }
    const h = pick(e);
    const it = ITEM[tool];
    hover.visible = tileAt(h.tx, h.tz) !== 0 || it?.paint !== undefined; hover.position.set(h.tx, .02, h.tz);
    const ok = it ? (it.paint !== undefined || canPlace(tool, h.tx, h.tz)) : true;
    hover.material.color.set(ok ? '#ffb547' : '#ff5a4f');
    if (ghost) { ghost.visible = ok && tileAt(h.tx, h.tz) === 1; ghost.position.set(h.tx, 0, h.tz); ghost.rotation.y = -autoRot(tool, h.tx, h.tz) * Math.PI / 2; }
    canvas.style.cursor = h.oid != null && !it ? 'grab' : it ? 'crosshair' : 'default';
    if (!drag) return;
    if (drag.kind === 'paint') paintAt(h.tx, h.tz, drag);
    if (drag.kind === 'move') {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6) drag.moved = true;
      if (drag.moved) { const r = roots.get(drag.id); if (r) { r.position.set(h.p.x, .15, h.p.z); } ring.position.set(h.tx, .03, h.tz); hover.material.color.set(canPlace(null, h.tx, h.tz, drag.id) ? '#ffb547' : '#ff5a4f'); }
    }
    if (drag.kind === 'pan' || drag.kind === 'maybe-place') {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (drag.kind === 'maybe-place' && Math.hypot(dx, dy) > 8) drag.kind = 'pan';
      if (drag.kind === 'pan') panBy(dx, dy, drag.t);
    }
  });
  const end = e => {
    pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null;
    if (mode !== 'edit' || !drag) return;
    const h = pick(e);
    if (drag.kind === 'paint' && drag.painted.size) { undoStack.push(drag.before); redoStack.length = 0; save(); updateUndo(); }
    if (drag.kind === 'move') {
      const o = map.objects.find(o => o.id === drag.id);
      if (drag.moved && o && canPlace(o.type, h.tx, h.tz, o.id) && (o.x !== h.tx || o.z !== h.tz)) { commit(() => { o.x = h.tx; o.z = h.tz; o.rot = ['banner', 'torch'].includes(o.type) ? autoRot(o.type, h.tx, h.tz) : o.rot; }); audio.play('setDown1', { vol: .7 }); }
      else syncObjects(), refreshSelection();
    }
    if (drag.kind === 'maybe-place') {
      if (tool) placeAt(h.tx, h.tz); else select(h.oid);
    }
    drag = null;
  };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', () => { hover.visible = false; if (ghost) ghost.visible = false; });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('wheel', e => { e.preventDefault(); camZoom = THREE.MathUtils.clamp(camZoom * (1 + Math.sign(e.deltaY) * .1), fitZoom * .35, fitZoom * 1.4); applyCamera(); }, { passive: false });
}
function panBy(dx, dy, from) {
  const k = (camera.top - camera.bottom) / canvas.clientHeight;
  const right = new THREE.Vector3(1, 0, -1).normalize(), fwd = new THREE.Vector3(-1, 0, -1).normalize();
  camTarget.copy(from).addScaledVector(right, -dx * k).addScaledVector(fwd, dy * k * 1.35);
  applyCamera();
}
function paintAt(x, z, drag) {
  const it = ITEM[tool]; const key = `${x},${z}`;
  if (drag.painted.has(key) || x < 0 || z < 0 || x >= MW() || z >= MH()) return;
  if (tileAt(x, z) === it.paint) return;
  if (it.paint !== 1 && objAt(x, z)) { audio.play('back_001', { vol: .4 }); return; }
  drag.painted.add(key); map.tiles[z][x] = it.paint;
  audio.play(it.paint === 2 ? 'setDown1' : 'drop_001', { vol: .5, pitch: .15 });
  syncTiles();
}
function placeAt(x, z) {
  const it = ITEM[tool];
  if (!canPlace(tool, x, z)) { audio.play('back_001', { vol: .5 }); hint(tileAt(x, z) === 1 ? 'Something is already there' : 'Place things on the floor'); return; }
  commit(() => {
    if (it.unique) map.objects = map.objects.filter(o => o.type !== tool);
    const o = { id: nextId++, type: tool, x, z, rot: autoRot(tool, x, z) };
    if (it.monster) o.strength = it.strength;
    if (tool === 'chest') o.coins = 25;
    map.objects.push(o); selected = o.id;
  });
  audio.play(it.monster ? 'pickup1' : 'drop_001', { vol: .7 });
  renderInspector();
}
function removeSelected() {
  const o = map.objects.find(o => o.id === selected); if (!o || o.type === 'stairs') return;
  commit(() => { map.objects = map.objects.filter(x => x !== o); }); audio.play('back_001', { vol: .6 }); select(null);
}
function copySelected() {
  const o = map.objects.find(o => o.id === selected); if (!o || o.type === 'stairs') return;
  for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    if (canPlace(o.type, o.x + dx, o.z + dz)) { const c = { ...o, id: nextId++, x: o.x + dx, z: o.z + dz }; commit(() => map.objects.push(c)); audio.play('drop_001', { vol: .6 }); select(c.id); return; }
  }
  hint('No free floor next to it');
}
function turnSelected() { const o = map.objects.find(o => o.id === selected); if (!o) return; commit(() => { o.rot = ((o.rot || 0) + 1) % 4; }); audio.play('click_001', { vol: .5 }); }

function bindUI() {
  $('#undo').onclick = undo; $('#redo').onclick = redo;
  $('#remove').onclick = removeSelected; $('#copy').onclick = copySelected; $('#turn').onclick = turnSelected;
  $('#play').onclick = startPlay; $('#stop').onclick = () => stopPlay();
  $('#again').onclick = () => { stopPlay(true); startPlay(); }; $('#backEdit').onclick = () => stopPlay();
  const mute = $('#mute'); const upd = () => mute.textContent = audio.isMuted() ? '🔇' : '♪'; upd();
  mute.onclick = () => { audio.setMuted(!audio.isMuted()); upd(); };
  const reset = document.createElement('button'); reset.className = 'btn small'; reset.textContent = '↺ Reset dungeon'; reset.style.marginTop = '14px';
  reset.onclick = () => { commit(() => { map = decode(PRESET); }); select(null); fitCamera(); applyCamera(); };
  $('#inspEmpty').append(reset);
  addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    if (mode === 'play') return playKey(e, true);
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); redo(); }
    else if (k === 'delete' || k === 'backspace') removeSelected();
    else if (k === 'r') turnSelected();
    else if (k === 'escape') { setTool(null); select(null); }
    else if (k === 'p') startPlay();
  });
  addEventListener('keyup', e => { if (mode === 'play') playKey(e, false); });
  hint('Pick a goblin below, then tap the floor to place it');
  initDone = true;
}

// ---------------- animation helpers ----------------
function playOnce(r, name, speed = 1, then = 'idle') {
  const A = r.userData.anim; if (!A?.clips[name]) return;
  const a = A.mixer.clipAction(A.clips[name]); a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.timeScale = speed;
  a.crossFadeFrom(A.current, .15, false).play(); A.current = a;
  clearTimeout(A.timer); A.timer = setTimeout(() => { if (A.current === a && !r.userData.dead) loopAnim(r, then); }, (A.clips[name].duration / speed) * 1000 - 120);
}
function loopAnim(r, name, speed = 1) {
  const A = r.userData.anim; if (!A?.clips[name]) return;
  const a = A.mixer.clipAction(A.clips[name]); if (A.current === a) { a.timeScale = speed; return; }
  a.reset(); a.setLoop(THREE.LoopRepeat); a.timeScale = speed; a.crossFadeFrom(A.current, .2, false).play(); A.current = a;
}
function playChest(r, which) {
  const A = r.userData.anim; if (!A) return;
  A.mixer.stopAllAction(); const a = A.mixer.clipAction(A.clips[which]); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.play();
  if (which === 'open') { audio.play('creak1', { vol: .7 }); setTimeout(() => audio.play('metalLatch', { vol: .4 }), 200); }
}

// ---------------- PLAY MODE ----------------
let player = null, foes = [], pickups = [], play = null;
const keys = new Set(); const stick = { x: 0, y: 0 };
function startPlay() {
  if (mode === 'play') return;
  const stairs = map.objects.find(o => o.type === 'stairs');
  let spawn = null;
  if (stairs) for (const [dx, dz] of [[0, -1], [1, 0], [-1, 0], [0, 1]]) if (tileAt(stairs.x + dx, stairs.z + dz) === 1 && !objAt(stairs.x + dx, stairs.z + dz)) { spawn = [stairs.x + dx, stairs.z + dz]; break; }
  if (!spawn) for (let z = 0; z < MH() && !spawn; z++) for (let x = 0; x < MW(); x++) if (tileAt(x, z) === 1 && !objAt(x, z)) { spawn = [x, z]; break; }
  if (!spawn) { hint('Your dungeon needs some floor first!'); return; }
  mode = 'play'; select(null); setTool(null);
  $('#editor').classList.add('playing'); $('#modeBadge').textContent = 'Playing';
  $('#hud').hidden = false; $('#result').hidden = true; hover.visible = false; ring.visible = false;
  stage.classList.toggle('touch', matchMedia('(pointer: coarse)').matches);
  audio.play('confirmation_001', { vol: .7 }); audio.music('music-play', { vol: 1 }); audio.setFireLevel(.35);
  // hero
  const root = new THREE.Group(); const body = instance('human'); root.add(body);
  const mixer = new THREE.AnimationMixer(body); mixers.add(mixer);
  const clips = Object.fromEntries(gltfs.human.animations.map(c => [c.name, c]));
  const idle = mixer.clipAction(clips.idle); idle.play();
  root.userData.anim = { mixer, clips, current: idle };
  const arm = body.getObjectByName('arm-right'); const sword = instance('sword');
  sword.position.set(-0.25, 0, 0.03); sword.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(.75, 0, .66).normalize()); sword.scale.setScalar(.9); arm.add(sword); // hand = arm's -x end (measured from skin weights)
  root.position.set(spawn[0], 0, spawn[1]); groups.actors.add(root);
  player = { root, hp: 5, maxHp: 5, coins: 0, facing: new THREE.Vector3(1, 0, 1).normalize(), cool: 0, inv: 0, attackT: -1, dead: false, step: 0 };
  // goblins + pickups come from the live editor objects; editor map itself is untouched
  foes = []; pickups = [];
  for (const o of map.objects) {
    const r = roots.get(o.id); if (!r) continue;
    if (o.type.startsWith('goblin')) { const S = STRENGTH[o.strength || 'easy']; foes.push({ o, r, hp: S.hp, maxHp: S.hp, S, state: 'idle', cool: 1 + Math.random(), vel: new THREE.Vector3(), home: r.position.clone(), attackT: -1 }); }
    if (o.type === 'coin' || o.type === 'potion') pickups.push({ o, r, taken: false });
  }
  play = { t: 0, over: false, total: foes.length, chestOpened: new Set() };
  camZoom = Math.min(fitZoom, 2.5); camTarget.copy(root.position);
  updateHud();
  hint(foes.length ? 'Defeat the goblins!' : 'Explore your dungeon!');
}
function stopPlay(quiet) {
  if (mode !== 'play') return;
  mode = 'edit';
  for (const f of foes) { f.r.visible = true; f.r.userData.dead = false; }
  if (player) { mixers.delete(player.root.userData.anim.mixer); player.root.removeFromParent(); player = null; }
  groups.fx.clear(); $('#floaters').innerHTML = '';
  // rebuild every object from the map so goblins, chests and coins are back where the editor left them
  for (const [id, r] of roots) disposeRoot(r); roots.clear(); syncObjects();
  $('#editor').classList.remove('playing'); $('#modeBadge').textContent = 'Editing'; $('#hud').hidden = true; $('#result').hidden = true;
  keys.clear(); stick.x = stick.y = 0; timeScale = 1;
  if (!quiet) { audio.play('back_001', { vol: .6 }); audio.music(null); fitCamera(); applyCamera(); hint('Back to editing — change something and try again!'); }
}
function playKey(e, down) {
  const k = e.key.toLowerCase();
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'w', 'a', 's', 'd'].includes(k)) e.preventDefault();
  if (down) { if (k === 'escape') return stopPlay(); if (k === ' ' || k === 'j') attack(); if (k === 'e' || k === 'enter') use(); keys.add(k); } else keys.delete(k);
}
function bindTouch() {
  const st = $('#stick'), nub = $('#nub'); let pid = null;
  const move = e => { const r = st.getBoundingClientRect(); let x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2); const m = Math.hypot(x, y), R = 50; if (m > R) { x *= R / m; y *= R / m; } stick.x = x / R; stick.y = y / R; nub.style.transform = `translate(${x}px,${y}px)`; };
  st.addEventListener('pointerdown', e => { pid = e.pointerId; st.setPointerCapture(pid); move(e); });
  st.addEventListener('pointermove', e => { if (e.pointerId === pid) move(e); });
  const up = e => { if (e.pointerId !== pid) return; pid = null; stick.x = stick.y = 0; nub.style.transform = ''; };
  st.addEventListener('pointerup', up); st.addEventListener('pointercancel', up);
  $('#btnAttack').addEventListener('pointerdown', e => { e.preventDefault(); attack(); });
  $('#btnUse').addEventListener('pointerdown', e => { e.preventDefault(); use(); });
}
setTimeout(bindTouch);

function attack() {
  if (!player || player.dead || player.cool > 0 || play.over) return;
  player.cool = .42; player.attackT = 0;
  playOnce(player.root, 'attack-melee-right', 1.7, 'idle');
  audio.playOneOf(['woosh1', 'woosh3'], { vol: .6, pitch: .12 });
}
function use() {
  if (!player || player.dead) return;
  const c = nearChest(); if (!c) return;
  play.chestOpened.add(c.o.id); playChest(c.r, 'open');
  const n = c.o.coins || 25; player.coins += n;
  setTimeout(() => { audio.play('handleCoins', { vol: .8 }); floater(c.r.position, `+${n} 🪙`, '#ffd76a'); updateHud(); }, 350);
  addTrauma(.15);
}
function nearChest() {
  for (const o of map.objects) if (o.type === 'chest' && !play.chestOpened.has(o.id)) {
    const r = roots.get(o.id); if (r && r.position.distanceTo(player.root.position) < 1.05) return { o, r };
  }
  return null;
}
const solidAt = (x, z) => { const tx = Math.round(x), tz = Math.round(z); if (tileAt(tx, tz) !== 1) return true; const o = objAt(tx, tz); return !!o && SOLID.has(o.type) && Math.hypot(o.x - x, o.z - z) < .42; };
function moveWithCollision(pos, dx, dz, rad = .22) {
  const tryAxis = (nx, nz) => !solidAt(nx + rad, nz) && !solidAt(nx - rad, nz) && !solidAt(nx, nz + rad) && !solidAt(nx, nz - rad);
  if (tryAxis(pos.x + dx, pos.z)) pos.x += dx;
  if (tryAxis(pos.x, pos.z + dz)) pos.z += dz;
}
function hitFoe(f, dir) {
  f.hp -= 1; f.state = 'hurt'; f.hurtT = .28; f.vel.copy(dir).multiplyScalar(3.2);
  flash(f.r, '#ffffff', .12);
  hitStop(.07); addTrauma(.28);
  audio.play('impactPunch_medium_002', { vol: .8, pitch: .12 });
  floater(f.r.position, f.hp > 0 ? '-1' : 'Bonk!', '#fff');
  if (f.hp <= 0) killFoe(f);
}
function killFoe(f) {
  f.state = 'dead'; f.r.userData.dead = true; f.deadT = 0;
  clearTimeout(f.r.userData.anim.timer); playOnce(f.r, 'die', 1.2, 'die');
  audio.play('impactSoft_heavy_001', { vol: .9 }); addTrauma(.45); hitStop(.12);
  // drop a coin
  const c = instance('coin'); c.scale.setScalar(.55); c.position.copy(f.r.position).setY(.05); groups.fx.add(c);
  pickups.push({ o: { type: 'coin', x: f.r.position.x, z: f.r.position.z }, r: c, taken: false, drop: true, vy: 2.2 });
  if (foes.every(x => x.state === 'dead') && play.total) setTimeout(() => endPlay(true), 1300);
  updateHud();
}
function hurtPlayer(dmg, from) {
  if (player.inv > 0 || player.dead || play.over) return;
  player.hp = Math.max(0, player.hp - dmg); player.inv = 1.0;
  const away = player.root.position.clone().sub(from).setY(0).normalize();
  moveWithCollision(player.root.position, away.x * .35, away.z * .35);
  audio.play('impactPunch_heavy_000', { vol: .9, pitch: .08 }); addTrauma(.55); hitStop(.09);
  const v = $('#vignette'); v.classList.add('hit'); requestAnimationFrame(() => requestAnimationFrame(() => v.classList.remove('hit')));
  floater(player.root.position, `-${dmg} ♥`, '#ff8a80');
  if (player.hp <= 0) { player.dead = true; playOnce(player.root, 'die', 1, 'die'); setTimeout(() => endPlay(false), 1400); }
  updateHud();
}
function endPlay(won) {
  if (play.over) return; play.over = true;
  audio.music(null, { fade: .8 });
  audio.play(won ? 'jingles-pizzicato_10' : 'jingles-pizzicato_03', { vol: .9, pitch: 0 });
  $('#resultTitle').textContent = won ? 'Dungeon cleared!' : 'You got bonked!';
  $('#resultText').textContent = won ? `You beat ${play.total} goblin${play.total > 1 ? 's' : ''} and found ${player.coins} coins.` : 'The goblins win this time. Make them easier, or try again!';
  $('#result').hidden = false;
}
function updateHud() {
  if (!player) return;
  $('#hearts').textContent = '♥'.repeat(player.hp) + '♡'.repeat(player.maxHp - player.hp);
  const left = foes.filter(f => f.state !== 'dead').length;
  $('#goblinsLeft').textContent = play.total ? `👺 ${left} left` : 'No goblins';
  $('#coins').textContent = `🪙 ${player.coins}`;
}
function flash(r, color, dur) {
  r.traverse(m => { if (m.isMesh && m.material.emissive) { m.material.emissive.set(color); m.material.emissiveIntensity = 1.2; } });
  setTimeout(() => r.traverse(m => { if (m.isMesh && m.material.emissive) m.material.emissive.set('#000'); }), dur * 1000);
}
const hitStop = d => { hitStopUntil = performance.now() + d * 1000; };
const addTrauma = a => { trauma = Math.min(1, trauma + a); };
function floater(pos, text, color) {
  const v = pos.clone().setY(1.1).project(camera); const r = stage.getBoundingClientRect();
  const d = document.createElement('div'); d.className = 'floater'; d.textContent = text; d.style.color = color;
  d.style.left = `${(v.x + 1) / 2 * r.width}px`; d.style.top = `${(1 - v.y) / 2 * r.height}px`;
  $('#floaters').append(d);
  d.animate([{ transform: 'translate(-50%,-50%) scale(.6)', opacity: 0 }, { transform: 'translate(-50%,-90%) scale(1.15)', opacity: 1, offset: .25 }, { transform: 'translate(-50%,-220%) scale(1)', opacity: 0 }], { duration: 900, easing: 'cubic-bezier(.16,1,.3,1)' }).onfinish = () => d.remove();
}

const camRight = new THREE.Vector3(1, 0, -1).normalize(), camFwd = new THREE.Vector3(-1, 0, -1).normalize();
function updatePlay(dt) {
  play.t += dt;
  const P = player.root.position;
  player.cool -= dt; player.inv -= dt;
  player.root.visible = player.inv > 0 && !player.dead ? Math.floor(play.t * 14) % 2 === 0 : true;
  // input
  let ix = stick.x, iy = stick.y;
  if (keys.has('a') || keys.has('arrowleft')) ix -= 1; if (keys.has('d') || keys.has('arrowright')) ix += 1;
  if (keys.has('w') || keys.has('arrowup')) iy -= 1; if (keys.has('s') || keys.has('arrowdown')) iy += 1;
  const mag = Math.min(1, Math.hypot(ix, iy));
  if (!player.dead && !play.over && mag > .1) {
    const dir = camRight.clone().multiplyScalar(ix).addScaledVector(camFwd, -iy).normalize();
    const sp = 2.5 * mag * (player.attackT >= 0 && player.attackT < .25 ? .35 : 1);
    moveWithCollision(P, dir.x * sp * dt, dir.z * sp * dt);
    player.facing.lerp(dir, Math.min(1, dt * 14)).normalize();
    if (player.root.userData.anim.current.getClip().name === 'idle') loopAnim(player.root, 'walk', 1.3);
    player.step -= dt; if (player.step <= 0) { player.step = .3; audio.playOneOf(['footstep_concrete_000', 'footstep_concrete_001'], { vol: .25, pitch: .1 }); }
  } else if (player.root.userData.anim.current.getClip().name === 'walk') loopAnim(player.root, 'idle');
  player.root.rotation.y = Math.atan2(player.facing.x, player.facing.z);
  // sword hit lands a beat into the swing
  if (player.attackT >= 0) {
    const before = player.attackT; player.attackT += dt;
    if (before < .12 && player.attackT >= .12) {
      let hit = false;
      for (const f of foes) {
        if (f.state === 'dead') continue;
        const to = f.r.position.clone().sub(P).setY(0); const d = to.length();
        if (d < 1.05 && to.normalize().dot(player.facing) > .35) { hitFoe(f, to); hit = true; }
      }
      if (!hit) for (const o of map.objects) if (o.type === 'barrel' || o.type === 'pot') { const r = roots.get(o.id); if (r && r.position.distanceTo(P) < .9) { audio.play('impactPunch_medium_002', { vol: .3, rate: .7 }); r.rotation.z = .15; setTimeout(() => r.rotation.z = 0, 90); } }
    }
    if (player.attackT > .5) player.attackT = -1;
  }
  // goblins
  for (const f of foes) {
    const G = f.r.position;
    if (f.state === 'dead') {
      f.deadT += dt; G.y = Math.max(-.4, -(f.deadT - 1.4) * .5 * (f.deadT > 1.4)); // play 'die', then sink away
      if (f.deadT > 2.2) f.r.visible = false;
      continue;
    }
    const to = P.clone().sub(G).setY(0); const d = to.length(); to.normalize();
    f.cool -= dt;
    if (f.state === 'hurt') { f.hurtT -= dt; moveWithCollision(G, f.vel.x * dt, f.vel.z * dt, .2); f.vel.multiplyScalar(Math.pow(.02, dt)); if (f.hurtT <= 0) f.state = 'chase'; continue; }
    const aggro = f.S === STRENGTH.tough ? 5.5 : 4.5;
    if (f.state === 'attack') {
      f.attackT += dt; f.r.rotation.y = lerpAngle(f.r.rotation.y, Math.atan2(to.x, to.z), dt * 6);
      if (f.attackT >= .45 && !f.struck) { f.struck = true; if (d < 1.0 && !player.dead) hurtPlayer(f.S.dmg, G); else audio.play('woosh1', { vol: .3, rate: .8 }); }
      if (f.attackT > 1.0) { f.state = 'chase'; f.cool = 1.1 + Math.random() * .6; flash(f.r, '#000', 0); }
      continue;
    }
    if (!player.dead && !play.over && d < aggro) {
      if (f.state === 'idle') { f.state = 'chase'; playOnce(f.r, 'taunt', 2.2, 'run'); }
      if (d < .78 && f.cool <= 0) {
        f.state = 'attack'; f.attackT = 0; f.struck = false; playOnce(f.r, 'attack', 2.2, 'run');
        f.r.traverse(m => { if (m.isMesh && m.material.emissive) { m.material.emissive.set('#ff3b1f'); m.material.emissiveIntensity = .14; } }); // telegraph the swing
        continue;
      }
      if (d > .7) {
        moveWithCollision(G, to.x * f.S.speed * dt, to.z * f.S.speed * dt, .2);
        if (f.r.userData.anim.current.getClip().name !== 'taunt') loopAnim(f.r, 'run', f.S.speed / 1.6);
      } else if (f.r.userData.anim.current.getClip().name === 'run') loopAnim(f.r, 'idle');
      f.r.rotation.y = lerpAngle(f.r.rotation.y, Math.atan2(to.x, to.z), dt * 8);
    } else if (f.state !== 'idle') { f.state = 'idle'; loopAnim(f.r, 'idle'); }
  }
  // keep goblins from stacking
  for (let i = 0; i < foes.length; i++) for (let j = i + 1; j < foes.length; j++) {
    const a = foes[i], b = foes[j]; if (a.state === 'dead' || b.state === 'dead') continue;
    const d = a.r.position.clone().sub(b.r.position).setY(0); const l = d.length(); if (l < .55 && l > 0) { d.multiplyScalar((.55 - l) / l / 2); moveWithCollision(a.r.position, d.x, d.z, .2); moveWithCollision(b.r.position, -d.x, -d.z, .2); }
  }
  // pickups
  for (const p of pickups) {
    if (p.taken) continue;
    if (p.drop) { p.vy -= 9 * dt; p.r.position.y = Math.max(.05, p.r.position.y + p.vy * dt); }
    p.r.rotation.y += dt * 3;
    if (!player.dead && p.r.position.distanceTo(P) < .5) {
      p.taken = true; p.r.visible = false;
      if (p.o.type === 'coin') { player.coins += 1; audio.play('handleCoins', { vol: .45, rate: 1.4 }); floater(p.r.position, '+1 🪙', '#ffd76a'); }
      else if (p.o.type === 'potion') { player.hp = Math.min(player.maxHp, player.hp + 1); audio.play('pickup1', { vol: .7 }); floater(p.r.position, '+1 ♥', '#ff8a80'); }
      updateHud();
    }
  }
  const c = nearChest(); $('#prompt').hidden = !c; $('#btnUse').hidden = !c;
  if (c) $('#prompt').innerHTML = stage.classList.contains('touch') ? 'Tap ✋ to open the chest' : 'Press <b>E</b> to open the chest';
  // camera follows
  camTarget.lerp(P, Math.min(1, dt * 5));
}
const lerpAngle = (a, b, t) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return a + d * Math.min(1, t); };

// ---------------- main loop ----------------
let perfT = 0, lastT = performance.now();
function frame(now) {
  let dt = Math.min(.05, (now - lastT) / 1000); lastT = now;
  if (now < hitStopUntil) dt *= .05; // hit-stop: sim + animation crawl, input still registers
  perfT += dt;
  for (const m of mixers) m.update(dt);
  for (let i = pops.length - 1; i >= 0; i--) { const p = pops[i]; p.t += dt; const k = Math.min(1, p.t / .45); const s = 1 + (Math.sin(k * Math.PI) * .12) * (1 - k) - .18 * Math.pow(1 - k, 3); p.r.scale.setScalar(s); if (k >= 1) { p.r.scale.setScalar(1); pops.splice(i, 1); } }
  for (const r of groups.objects.children) if (r.userData.spin && mode === 'edit') r.rotation.y += dt * 1.5;
  if (selected != null && mode === 'edit') { ring.material.opacity = .7 + Math.sin(perfT * 5) * .25; }
  updateTorches(dt);
  if (mode === 'play' && player) updatePlay(dt);
  trauma = Math.max(0, trauma - dt * 1.6);
  applyCamera(trauma * trauma);
  renderer.render(scene, camera);
}
function tick(sec) { // test hook: advance the game in fixed 1/60 s steps without rendering
  for (let i = 0; i < Math.round(sec * 60); i++) { const dt = 1 / 60; perfT += dt; for (const m of mixers) m.update(dt); if (mode === 'play' && player) updatePlay(dt); trauma = Math.max(0, trauma - dt * 1.6); }
  applyCamera(); renderer.render(scene, camera);
}
window.__ogm = { tick, zoom(z) { camZoom = z; },  tileToScreen(x, z, y = 0) { const v = new THREE.Vector3(x, y, z).project(camera); const r = canvas.getBoundingClientRect(); return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height]; }, get map() { return map; }, startPlay, stopPlay, get mode() { return mode; }, attack, get player() { return player; }, get foes() { return foes; } };
