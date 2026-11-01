import {
  AdditiveBlending,
  Color,
  DoubleSide,
  Euler,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  NormalBlending,
  Object3D,
  PlaneGeometry,
  ShaderMaterial,
  type Camera,
  type Scene,
  type Texture,
} from 'three';

import type { Rng } from '../core/rng.js';

export const FX_KINDS = ['puff', 'smoke', 'flame', 'spark', 'flash', 'dirt', 'ring', 'crack', 'scorch'] as const;

export type FxKind = (typeof FX_KINDS)[number];
export type Vec2 = [x: number, y: number];
export type Vec3 = [x: number, y: number, z: number];
export type ParticleFade = 'fast' | 'decal';

export interface FxUniform<T> {
  value: T;
}

export interface FxUniforms {
  night: FxUniform<number>;
  fogC: FxUniform<Color>;
  fogN: FxUniform<number>;
  fogF: FxUniform<number>;
}

export interface ParticleInput {
  born: number;
  life: number;
  p: Vec3;
  v: Vec3;
  g?: number;
  drag?: number;
  size: number;
  grow?: number;
  rot: number;
  spin?: number;
  color: string;
  alpha: number;
  fade?: ParticleFade;
  wobble?: number;
}

export interface Particle extends ParticleInput {
  kind: FxKind;
  texture: Texture;
  tag: unknown;
  s0?: number;
}

interface ParticleGroup {
  kind: FxKind;
  texture: Texture;
  list: Particle[];
  mesh?: InstancedMesh;
}

const ADDITIVE = new Set<FxKind>(['flame', 'spark', 'flash']);
const FLAT = new Set<FxKind>(['ring', 'crack', 'scorch']);

const VERTEX_SHADER = `attribute float aAlpha; varying vec2 vUv; varying float vA; varying vec3 vC, vW;
void main() { vUv = uv; vA = aAlpha; vC = instanceColor; vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;

const FRAGMENT_SHADER = `uniform sampler2D map; uniform float lum, night; uniform vec3 fogC; uniform float fogN, fogF; varying vec2 vUv; varying float vA; varying vec3 vC, vW;
void main() { vec4 t = texture2D(map, vUv); float a = t.a * mix(1., dot(t.rgb, vec3(.333)), lum) * vA; if (a < .01) discard;
  vec3 c = vC * mix(t.rgb, vec3(1.), lum * .5); float f = smoothstep(fogN, fogF, length(vW - cameraPosition));
  gl_FragColor = vec4(mix(c, fogC, f * (1. - lum)), a * (1. - f * .6)); }`;

export class Fx3d {
  readonly parts: Particle[] = [];
  tag: unknown = null;
  dead: ((tag: unknown) => boolean) | undefined;

  readonly #scene: Scene;
  readonly #camera: Camera;
  readonly #uniforms: FxUniforms;
  readonly #rng: Rng;
  readonly #groups: ParticleGroup[] = [];
  readonly #groupsByKind = new Map<FxKind, ParticleGroup[]>();
  readonly #pool: Particle[][] = [];
  readonly #scratchObject = new Object3D();
  readonly #zeroMatrix = new Matrix4().makeScale(0, 0, 0);
  #poolAt = 0;
  #built = false;

  constructor(
    scene: Scene,
    camera: Camera,
    textures: Record<FxKind, readonly Texture[]>,
    uniforms: FxUniforms,
    rng: Rng,
  ) {
    this.#scene = scene;
    this.#camera = camera;
    this.#uniforms = uniforms;
    this.#rng = rng;
    for (const kind of FX_KINDS) {
      const choices = textures[kind];
      if (!choices?.length) throw new Error(`Fx3d requires at least one ${kind} texture`);
      const groups = choices.map((texture) => ({ kind, texture, list: [] }) satisfies ParticleGroup);
      this.#groups.push(...groups);
      this.#groupsByKind.set(kind, groups);
    }
  }

  add(kind: FxKind, input: ParticleInput): Particle {
    if (this.#built) throw new Error('Fx3d particles must be planned before build()');
    const groups = this.#groupsByKind.get(kind)!;
    const group = groups[this.#rng.int(groups.length)]!;
    const particle: Particle = {
      ...input,
      p: [...input.p],
      v: [...input.v],
      kind,
      texture: group.texture,
      tag: this.tag,
    };
    group.list.push(particle);
    this.parts.push(particle);
    return particle;
  }

  reserve(n = 6): void {
    const tag = this.tag;
    this.tag = null;
    for (let index = 0; index < n; index += 1) {
      const set: Particle[] = [];
      set.push(
        this.add('flash', {
          born: -99,
          life: 0.3,
          p: [0, 0, 0],
          v: [0, 0, 0],
          size: 4,
          grow: 2,
          rot: this.#between(0, 6),
          color: '#ffe2b0',
          alpha: 1,
          fade: 'fast',
        }),
      );
      for (let spark = 0; spark < 10; spark += 1) {
        const angle = this.#between(0, Math.PI * 2);
        const elevation = this.#between(0.2, 1.2);
        const speed = this.#between(5, 11);
        set.push(
          this.add('spark', {
            born: -99,
            life: this.#between(0.35, 0.7),
            p: [0, 0, 0],
            v: [
              Math.cos(angle) * speed * Math.cos(elevation),
              Math.sin(elevation) * speed,
              Math.sin(angle) * speed * Math.cos(elevation),
            ],
            g: 14,
            size: this.#between(0.35, 0.7),
            rot: 0,
            color: '#ffd08a',
            alpha: 1,
          }),
        );
      }
      for (let puff = 0; puff < 4; puff += 1) {
        set.push(
          this.add('puff', {
            born: -99,
            life: this.#between(0.6, 1),
            p: [0, 0, 0],
            v: [this.#between(-1.5, 1.5), this.#between(1, 2.5), this.#between(-1.5, 1.5)],
            drag: 1.5,
            size: this.#between(1.2, 2),
            grow: 0.9,
            rot: this.#between(0, 6),
            color: '#efe4d4',
            alpha: 0.6,
          }),
        );
      }
      this.#pool.push(set);
    }
    this.tag = tag;
  }

  burst(t: number, [x, y, z]: Vec3, scale = 1): void {
    const set = this.#pool[this.#poolAt++ % this.#pool.length];
    if (!set) return;
    for (const particle of set) {
      particle.born = t + (particle.kind === 'spark' ? this.#rng.next() * 0.05 : 0);
      particle.p = [x, y, z];
      particle.s0 ??= particle.size;
      particle.size = particle.s0 * scale;
    }
  }

  dust(t: number, [x, y, z]: Vec3, scale = 1, color = '#e9dccb'): void {
    for (let index = 0; index < 18 * scale; index += 1) {
      const angle = this.#between(0, Math.PI * 2);
      const speed = this.#between(1, 4) * scale;
      this.add('puff', {
        born: t + this.#between(0, 0.25),
        life: this.#between(2.5, 4.5) * Math.sqrt(scale),
        p: [x + this.#between(-1, 1) * scale, y + this.#between(0, 1.5) * scale, z + this.#between(-1, 1) * scale],
        v: [Math.cos(angle) * speed, this.#between(0.8, 2.4) * scale, Math.sin(angle) * speed],
        drag: 1.2,
        size: this.#between(2, 3.6) * scale,
        grow: this.#between(0.7, 1.4),
        rot: this.#between(0, 6),
        spin: this.#between(-0.4, 0.4),
        color,
        alpha: this.#between(0.55, 0.85),
      });
    }
  }

  flash(t: number, [x, y, z]: Vec3, scale = 1): void {
    this.add('flash', {
      born: t,
      life: 0.35,
      p: [x, y, z],
      v: [0, 0, 0],
      size: 5 * scale,
      grow: 2,
      rot: this.#between(0, 6),
      color: '#ffd9a0',
      alpha: 1,
      fade: 'fast',
    });
    for (let index = 0; index < 14 * scale; index += 1) {
      const angle = this.#between(0, Math.PI * 2);
      const elevation = this.#between(0.2, 1.2);
      const speed = this.#between(6, 14);
      this.add('spark', {
        born: t + this.#between(0, 0.1),
        life: this.#between(0.4, 0.9),
        p: [x, y, z],
        v: [
          Math.cos(angle) * speed * Math.cos(elevation),
          Math.sin(elevation) * speed,
          Math.sin(angle) * speed * Math.cos(elevation),
        ],
        g: 14,
        size: this.#between(0.4, 0.8),
        rot: 0,
        color: '#ffc27a',
        alpha: 1,
      });
    }
  }

  debris(t: number, [x, y, z]: Vec3, [dx, dz]: Vec2, scale = 1): void {
    for (let index = 0; index < 16 * scale; index += 1) {
      const speed = this.#between(4, 11);
      this.add('dirt', {
        born: t + this.#between(0, 0.15),
        life: this.#between(0.8, 1.6),
        p: [x, y, z],
        v: [dx * speed + this.#between(-3, 3), this.#between(3, 9), dz * speed + this.#between(-3, 3)],
        g: 16,
        size: this.#between(0.6, 1.4) * scale,
        grow: 0.3,
        rot: this.#between(0, 6),
        spin: this.#between(-3, 3),
        color: '#bfa58a',
        alpha: 0.9,
      });
    }
  }

  splash(t: number, [x, z]: Vec2, scale = 1): void {
    for (let index = 0; index < 10 * scale; index += 1) {
      const angle = this.#between(0, Math.PI * 2);
      const speed = this.#between(1, 3.5) * scale;
      this.add('puff', {
        born: t + this.#between(0, 0.15),
        life: this.#between(0.7, 1.3),
        p: [x, 0.2, z],
        v: [Math.cos(angle) * speed, this.#between(3, 7) * scale, Math.sin(angle) * speed],
        g: 9,
        size: this.#between(1, 2) * scale,
        grow: 0.8,
        rot: this.#between(0, 6),
        color: '#f4fbff',
        alpha: 0.9,
      });
    }
  }

  ring(t: number, [x, y, z]: Vec3, scale = 1): void {
    this.add('ring', {
      born: t,
      life: 1.1,
      p: [x, y + 0.25, z],
      v: [0, 0, 0],
      size: 3 * scale,
      grow: 9,
      rot: 0,
      color: '#f2e5bc',
      alpha: 0.8,
    });
  }

  decal(t: number, end: number, kind: 'crack' | 'scorch', [x, y, z]: Vec3, scale: number): void {
    this.add(kind, {
      born: t,
      life: end - t,
      p: [x, y + 0.08, z],
      v: [0, 0, 0],
      size: scale,
      grow: 0,
      rot: this.#between(0, 6),
      color: kind === 'crack' ? '#6b5d55' : '#3c3836',
      alpha: 0.85,
      fade: 'decal',
    });
  }

  fire(t: number, end: number, [x, y, z]: Vec3, scale = 1): void {
    const count = Math.floor((end - t) * 9 * scale);
    for (let index = 0; index < count; index += 1) {
      const born = t + index / (9 * scale);
      this.add('flame', {
        born,
        life: this.#between(0.6, 1.1),
        p: [x + this.#between(-1.5, 1.5) * scale, y + this.#between(0, 0.8), z + this.#between(-1.5, 1.5) * scale],
        v: [this.#between(-0.3, 0.3), this.#between(2, 4), this.#between(-0.3, 0.3)],
        size: this.#between(1.6, 3) * scale,
        grow: -0.4,
        rot: this.#between(-0.3, 0.3),
        color: '#ffb067',
        alpha: 1,
      });
      if (index % 6 === 0) {
        this.add('smoke', {
          born,
          life: this.#between(3, 4.5),
          p: [x + this.#between(-1, 1), y + 2 * scale, z + this.#between(-1, 1)],
          v: [this.#between(0.6, 1.6), this.#between(3.5, 5.5), this.#between(-0.4, 0.4)],
          drag: 0.2,
          size: this.#between(1.2, 2) * scale,
          grow: this.#between(0.4, 0.7),
          rot: this.#between(0, 6),
          spin: this.#between(-0.3, 0.3),
          color: '#c2b8c4',
          alpha: this.#between(0.14, 0.24),
        });
      }
      if (index % 3 === 0) {
        this.add('spark', {
          born,
          life: this.#between(1.5, 2.5),
          p: [x + this.#between(-1, 1), y + 1.5, z + this.#between(-1, 1)],
          v: [this.#between(-1, 1), this.#between(3, 6), this.#between(-1, 1)],
          g: -0.5,
          size: this.#between(0.25, 0.45),
          rot: 0,
          color: '#ffcf8a',
          alpha: 1,
          wobble: 1,
        });
      }
    }
  }

  build(): void {
    if (this.#built) return;
    this.#built = true;
    const quad = new PlaneGeometry(1, 1);
    for (const group of this.#groups) {
      if (group.list.length === 0) continue;
      const material = new ShaderMaterial({
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        blending: ADDITIVE.has(group.kind) ? AdditiveBlending : NormalBlending,
        uniforms: {
          map: { value: group.texture },
          lum: { value: ADDITIVE.has(group.kind) || group.kind === 'dirt' ? 1 : 0 },
          night: this.#uniforms.night,
          fogC: this.#uniforms.fogC,
          fogN: this.#uniforms.fogN,
          fogF: this.#uniforms.fogF,
        },
      });
      const geometry = quad.clone();
      geometry.setAttribute('aAlpha', new InstancedBufferAttribute(new Float32Array(group.list.length), 1));
      const mesh = new InstancedMesh(geometry, material, group.list.length);
      mesh.frustumCulled = false;
      mesh.renderOrder = FLAT.has(group.kind) ? 1 : 5;
      group.list.forEach((particle, index) => mesh.setColorAt(index, new Color(particle.color)));
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      group.mesh = mesh;
      this.#scene.add(mesh);
    }
    quad.dispose();
  }

  update(t: number): void {
    const object = this.#scratchObject;
    for (const group of this.#groups) {
      if (!group.mesh) continue;
      const alpha = group.mesh.geometry.getAttribute('aAlpha') as InstancedBufferAttribute;
      group.list.forEach((particle, index) => {
        const age = t - particle.born;
        if (age < 0 || age > particle.life || (particle.tag != null && this.dead?.(particle.tag))) {
          group.mesh!.setMatrixAt(index, this.#zeroMatrix);
          alpha.setX(index, 0);
          return;
        }
        const progress = age / particle.life;
        const distance = particle.drag ? (1 - Math.exp(-particle.drag * age)) / particle.drag : age;
        object.position.set(
          particle.p[0] + particle.v[0] * distance + (particle.wobble ? Math.sin(age * 5 + index) * 0.3 : 0),
          Math.max(-50, particle.p[1] + particle.v[1] * distance - 0.5 * (particle.g ?? 0) * age * age),
          particle.p[2] + particle.v[2] * distance,
        );
        const scale = Math.max(0.01, particle.size * (1 + (particle.grow ?? 0) * age));
        if (FLAT.has(group.kind)) object.quaternion.setFromEuler(new Euler(-Math.PI / 2, 0, particle.rot));
        else {
          object.quaternion.copy(this.#camera.quaternion);
          object.rotateZ(particle.rot + (particle.spin ?? 0) * age);
        }
        object.scale.set(scale, scale, scale);
        object.updateMatrix();
        group.mesh!.setMatrixAt(index, object.matrix);
        alpha.setX(index, particle.alpha * this.#fade(particle.fade, age, progress));
      });
      group.mesh.instanceMatrix.needsUpdate = true;
      alpha.needsUpdate = true;
    }
  }

  reseed(seed: number): void {
    this.#rng.setSeed(seed);
  }

  #between(min: number, max: number): number {
    return min + this.#rng.next() * (max - min);
  }

  #fade(fade: ParticleFade | undefined, age: number, progress: number): number {
    if (fade === 'fast') return 1 - progress;
    if (fade === 'decal') return Math.min(1, age * 4) * (1 - Math.max(0, (progress - 0.9) / 0.1));
    return Math.min(1, age * 6) * (1 - progress * progress);
  }
}
