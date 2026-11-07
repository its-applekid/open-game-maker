import { basename } from 'node:path';

import type { AssetMetadata } from '@ogm/contracts';

/** A file an image job can encode: its path as the lock records it and the absolute file to read. */
export type SheetSource = { path: string; absolute: string };

function normalize(value: string): string {
  return value.replaceAll('\\', '/').replace(/^\.\//, '');
}

/**
 * Every path a card's `meta.sprite` block points at, in the order it writes them. A card names its sheets through
 * per-animation `sheets`, per-frame `files`, per-direction `direction_files`, or per-facing `facings`.
 */
export function spriteSheetPaths(meta: AssetMetadata | undefined): string[] {
  const sprite = meta?.sprite;
  if (sprite === undefined) return [];
  const paths = new Set<string>();
  for (const animation of sprite.animations ?? []) {
    for (const sheet of animation.sheets ?? []) paths.add(sheet.path);
    for (const file of animation.files ?? []) paths.add(file);
    for (const list of Object.values(animation.direction_files ?? {})) {
      for (const file of list ?? []) paths.add(file);
    }
  }
  for (const file of Object.values(sprite.facings ?? {})) {
    if (typeof file === 'string') paths.add(file);
  }
  return [...paths];
}

/**
 * The lock file each `meta.sprite` path points at. A collection reference records the same relative path the card
 * wrote, while a repo copy (`gm assets use --vendor`) flattens sheets beside the primary, so the basename is the
 * fallback. A basename shared by two files resolves nothing: the adapter's beside-the-file lookup could not tell
 * them apart either, so the path stays as the card wrote it.
 */
export function resolveSheetSources(
  meta: AssetMetadata | undefined,
  files: readonly SheetSource[],
): Map<string, SheetSource> {
  const byPath = new Map<string, SheetSource>();
  const byBasename = new Map<string, SheetSource | null>();
  for (const file of files) {
    const path = normalize(file.path);
    byPath.set(path, file);
    const leaf = basename(path);
    byBasename.set(leaf, byBasename.has(leaf) ? null : file);
  }
  const resolved = new Map<string, SheetSource>();
  for (const sheetPath of spriteSheetPaths(meta)) {
    const path = normalize(sheetPath);
    const file = byPath.get(path) ?? byBasename.get(basename(path)) ?? undefined;
    if (file !== undefined && file !== null) resolved.set(sheetPath, file);
  }
  return resolved;
}

function renameIn(paths: string[], generated: Map<string, string>): void {
  for (let index = 0; index < paths.length; index += 1) {
    const path = paths[index]!;
    paths[index] = generated.get(path) ?? path;
  }
}

/**
 * The card's metadata with each sheet path replaced by the generated file name it resolved to, so a game reads every
 * sheet through the manifest's `files` record. Paths the build did not emit keep the card's own spelling.
 */
export function rewriteSpriteSheets(
  meta: AssetMetadata | undefined,
  generated: Map<string, string>,
): AssetMetadata | undefined {
  const sprite = meta?.sprite;
  if (sprite === undefined || generated.size === 0) return meta;
  const rewritten = structuredClone(sprite);
  for (const animation of rewritten.animations ?? []) {
    for (const sheet of animation.sheets ?? []) sheet.path = generated.get(sheet.path) ?? sheet.path;
    if (animation.files !== undefined) renameIn(animation.files, generated);
    for (const [direction, list] of Object.entries(animation.direction_files ?? {})) {
      if (list === undefined) continue;
      renameIn(list, generated);
      (animation.direction_files as Record<string, string[]>)[direction] = list;
    }
  }
  for (const [direction, file] of Object.entries(rewritten.facings ?? {})) {
    if (typeof file !== 'string') continue;
    (rewritten.facings as Record<string, string>)[direction] = generated.get(file) ?? file;
  }
  return { ...meta, sprite: rewritten };
}
