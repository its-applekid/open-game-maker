// @vitest-environment node
import { mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildLineups, renderJobs, rigWithId, startStaticServer } from '../tools/render-gltf.mjs';

async function writeTriangle(root: string, name = 'triangle.gltf', bufferUri?: string): Promise<void> {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const indices = new Uint16Array([0, 1, 2]);
  const bytes = Buffer.concat([Buffer.from(positions.buffer), Buffer.from(indices.buffer)]);
  const bufferName = name.replace(/\.gltf$/i, '.bin');
  if (!bufferUri) await writeFile(join(root, bufferName), bytes);
  await writeFile(
    join(root, name),
    JSON.stringify({
      asset: { version: '2.0' },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0 }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
      buffers: [{ uri: bufferUri ?? bufferName, byteLength: bytes.length }],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
        { buffer: 0, byteOffset: positions.byteLength, byteLength: indices.byteLength },
      ],
      accessors: [
        { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] },
        { bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' },
      ],
    }),
  );
}

async function writeSkeleton(root: string): Promise<void> {
  await writeFile(
    join(root, 'skeleton.gltf'),
    JSON.stringify({
      asset: { version: '2.0' },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [
        { name: 'Hips', children: [1] },
        { name: 'Spine', translation: [0, 1, 0] },
      ],
      skins: [{ joints: [0, 1], skeleton: 0 }],
    }),
  );
}

describe('headless glTF renderer', () => {
  it('derives the same compatibility id from the same rig signature', () => {
    const rig = {
      type: 'humanoid',
      bones: [
        { name: 'hips', parent: null },
        { name: 'spine', parent: 'hips' },
      ],
    };
    expect(rigWithId(rig)?.rig_id).toMatch(/^rig:[0-9a-f]{12}$/);
    expect(rigWithId({ ...rig, bones: [...rig.bones].reverse() })?.rig_id).toBe(rigWithId(rig)?.rig_id);
  });

  it('loads a glTF through three.js, measures it, and writes a PNG thumbnail', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ogm-render-gltf-'));
    await writeTriangle(root);

    const [result] = await renderJobs({
      root,
      jobs: [{ path: 'triangle.gltf', output: 'thumbnail.png' }],
      softwareGL: true,
    });

    expect(result.ok).toBe(true);
    expect(result.analysis?.triangles).toBe(1);
    expect(result.analysis?.vertices).toBe(3);
    expect(result.analysis?.bounds).toEqual({ min: [0, 0, 0], max: [1, 1, 0] });
    expect((await readFile(join(root, 'thumbnail.png'))).subarray(1, 4).toString()).toBe('PNG');
  }, 30_000);

  it('measures and previews an animation skeleton with no mesh geometry', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ogm-render-gltf-'));
    await writeSkeleton(root);
    const [result] = await renderJobs({
      root,
      jobs: [{ path: 'skeleton.gltf', output: 'skeleton.png' }],
      softwareGL: true,
    });
    expect(result.ok).toBe(true);
    expect(result.analysis?.triangles).toBe(0);
    expect(result.analysis?.rig?.joint_count).toBe(2);
    expect((await readFile(join(root, 'skeleton.png'))).subarray(1, 4).toString()).toBe('PNG');
  }, 30_000);

  it('reports a bad model, continues with later jobs, and refuses paths above the selected root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ogm-render-gltf-'));
    await writeFile(join(root, 'bad.gltf'), '{not json');
    await writeTriangle(root, 'good.gltf');

    const results = await renderJobs({
      root,
      jobs: [
        { path: 'bad.gltf', output: 'bad.png' },
        { path: 'good.gltf', output: 'good.png' },
      ],
      softwareGL: true,
    });
    expect(results.map((result) => result.ok)).toEqual([false, true]);
    expect(results[0]?.error).toMatch(/json|parse|unexpected/i);

    const server = await startStaticServer(root);
    try {
      const response = await fetch(`${server.url}/assets/%2e%2e/package.json`);
      expect(response.status).toBe(404);
    } finally {
      await server.close();
    }
  }, 30_000);

  it('blocks remote glTF resources without contacting their host', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ogm-render-gltf-'));
    let requests = 0;
    const sentinel = createServer((_request, response) => {
      requests += 1;
      response.writeHead(200).end('not local');
    });
    await new Promise<void>((accept, reject) => {
      sentinel.once('error', reject);
      sentinel.listen(0, '127.0.0.1', accept);
    });
    const address = sentinel.address();
    if (!address || typeof address === 'string') throw new Error('sentinel did not receive a port');
    try {
      await writeTriangle(root, 'remote.gltf', `http://127.0.0.1:${address.port}/triangle.bin`);
      const [result] = await renderJobs({
        root,
        jobs: [{ path: 'remote.gltf', output: 'remote.png' }],
        softwareGL: true,
      });
      expect(result.ok).toBe(false);
      expect(requests).toBe(0);
    } finally {
      await new Promise<void>((accept, reject) => sentinel.close((error) => (error ? reject(error) : accept())));
    }
  }, 30_000);

  it('resets the renderer page after a timed-out model and continues', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ogm-render-gltf-'));
    await writeTriangle(root);
    const results = await renderJobs({
      root,
      jobs: [
        { path: 'triangle.gltf', output: 'timed-out.png', timeoutMs: 1 },
        { path: 'triangle.gltf', output: 'after-timeout.png' },
      ],
      softwareGL: true,
    });
    expect(results.map((result) => result.ok)).toEqual([false, true]);
    expect(results[0]?.error).toContain('timed out');
    expect((await readFile(join(root, 'after-timeout.png'))).subarray(1, 4).toString()).toBe('PNG');
  }, 30_000);

  it('builds a deterministic pack lineup as PNG and accessible HTML', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ogm-render-gltf-'));
    await writeTriangle(root, 'first.gltf');
    await writeTriangle(root, 'second.gltf');
    const rendered = await renderJobs({
      root,
      jobs: [
        { path: 'first.gltf', output: 'thumbs/first.png' },
        { path: 'second.gltf', output: 'thumbs/second.png' },
      ],
      softwareGL: true,
    });
    expect(rendered.every((result) => result.ok)).toBe(true);

    const [lineup] = await buildLineups({
      root,
      lineups: [
        {
          title: 'KayKit Test Pack',
          output: 'lineup.png',
          html: 'lineup.html',
          items: [
            { label: 'First', thumbnail: 'thumbs/first.png' },
            { label: 'Second', thumbnail: 'thumbs/second.png' },
          ],
        },
      ],
    });

    expect(lineup.ok).toBe(true);
    expect((await readFile(join(root, 'lineup.png'))).subarray(1, 4).toString()).toBe('PNG');
    const html = await readFile(join(root, 'lineup.html'), 'utf8');
    expect(html).toContain('<main');
    expect(html).toContain('alt="First"');
    expect(html).toContain('alt="Second"');

    const outside = await mkdtemp(join(tmpdir(), 'ogm-render-outside-'));
    await symlink(outside, join(root, 'escape'), 'dir');
    const [escaped] = await buildLineups({
      root,
      lineups: [
        {
          title: 'Escaped',
          output: 'escape/lineup.png',
          html: 'escape/lineup.html',
          items: [{ label: 'First', thumbnail: 'thumbs/first.png' }],
        },
      ],
    });
    expect(escaped.ok).toBe(false);
    await expect(readFile(join(outside, 'lineup.png'))).rejects.toMatchObject({ code: 'ENOENT' });
  }, 60_000);
});
