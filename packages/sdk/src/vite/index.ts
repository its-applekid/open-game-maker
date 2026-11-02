import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { gameManifestSchema, StrictDesignDocSchema, type DesignDoc, type GameManifest } from '@ogm/contracts';

/* Node-only (a Vite plugin for game builds): tsc emits it; the browser bundle in scripts/build.mjs leaves it out. */

/** Where the games host and the API read a build's manifest and design (services/api/src/design/base-doc.ts). */
export const MANIFEST_FILE = 'manifest.json';
export const DESIGN_FILE = 'design/design.json';

function mergeDisjoint<T>(into: Record<string, T>, from: Record<string, T>, what: string, file: string): void {
  for (const [key, value] of Object.entries(from)) {
    if (key in into) throw new Error(`design/${file}: ${what} "${key}" is already defined by another design file`);
    into[key] = value;
  }
}

/** Fold every `*.json` in a design directory (name order) into one doc; a key defined twice is an error. */
export function foldDesignFiles(designDir: string): DesignDoc {
  const files = readdirSync(designDir)
    .filter((name) => name.endsWith('.json'))
    .sort();
  if (files.length === 0) throw new Error(`${designDir} has no design files`);

  let folded: DesignDoc | undefined;
  for (const file of files) {
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(join(designDir, file), 'utf8'));
    } catch (error) {
      throw new Error(`design/${file} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`, {
        cause: error,
      });
    }
    const parsed = StrictDesignDocSchema.safeParse(raw);
    if (!parsed.success) throw new Error(`design/${file} is not a valid design doc: ${parsed.error.message}`);
    const doc = parsed.data;
    if (!folded) {
      folded = { schemaVersion: doc.schemaVersion, globals: {}, entities: {} };
    } else if (doc.schemaVersion !== folded.schemaVersion) {
      throw new Error(`design/${file}: schemaVersion ${doc.schemaVersion} differs from ${folded.schemaVersion}`);
    }
    mergeDisjoint(folded.globals, doc.globals, 'global', file);
    mergeDisjoint(folded.entities, doc.entities, 'entity', file);
  }
  return folded as DesignDoc;
}

type EmitContext = { emitFile(file: { type: 'asset'; fileName: string; source: string }): string };

/** Vite plugin: write `manifest.json` and `design/design.json` next to the bundle so a build dir can be published. */
export function gmBuildArtifacts(options: { manifest: GameManifest; designDir: string }) {
  return {
    name: 'gm-build-artifacts',
    generateBundle(this: EmitContext) {
      const manifest = gameManifestSchema.parse(options.manifest);
      const design = foldDesignFiles(options.designDir);
      this.emitFile({ type: 'asset', fileName: MANIFEST_FILE, source: `${JSON.stringify(manifest, null, 2)}\n` });
      this.emitFile({ type: 'asset', fileName: DESIGN_FILE, source: `${JSON.stringify(design, null, 2)}\n` });
    },
  };
}
