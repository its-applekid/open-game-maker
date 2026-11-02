import { access, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

import { packFromRef } from "./model.mjs";

const requireFromAssets = createRequire(
  new URL("../../../packages/asset-cards/package.json", import.meta.url),
);
export const directions8 = ["E", "SE", "S", "SW", "W", "NW", "N", "NE"];

function relativeId(card) {
  return card.id?.replace(/^t1:/u, "").split("@")[0];
}

function safeJoin(root, relativePath) {
  const target = path.resolve(root, relativePath);
  const relative = path.relative(root, target);
  if (!relativePath || path.isAbsolute(relativePath) || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`asset path escapes its pack: ${relativePath}`);
  }
  return target;
}

function cardKeys(card) {
  const id = relativeId(card);
  const pack = card.collection?.pack_id ?? card.pack_id ?? card.pack;
  return [id, pack && id ? `${pack}/${id}` : undefined].filter(Boolean);
}

export class AssetLibrary {
  #assetsRoot;
  #cards;
  #currents = new Map();
  #sharp;

  constructor({ assetsRoot, catalog }) {
    this.#assetsRoot = path.resolve(assetsRoot);
    this.#cards = new Map();
    for (const card of catalog.cards ?? catalog) {
      if (card.card_type && card.card_type !== "asset") continue;
      for (const key of cardKeys(card)) this.#cards.set(key, card);
    }
  }

  async sharp() {
    this.#sharp ??= requireFromAssets("sharp");
    return this.#sharp;
  }

  async extracted(pack) {
    let current = this.#currents.get(pack);
    if (!current) {
      const manifestFile = path.join(this.#assetsRoot, "packs", pack, "pack.json");
      const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
      current = manifest.current;
      this.#currents.set(pack, current);
    }
    return path.join(this.#assetsRoot, "packs", pack, current, "extracted");
  }

  async resolve(spec) {
    if (spec.ref?.startsWith("sheet:")) return this.#resolveSheet(spec);
    if (!spec.ref?.startsWith("card:")) throw new Error(`unsupported asset reference ${spec.ref}`);

    const key = spec.ref.slice(5);
    const card = this.#cards.get(key) ?? this.#cards.get(key.split("/").slice(1).join("/"));
    if (!card) throw new Error(`no catalog card ${key}`);
    const pack = packFromRef(spec.ref) ?? card.collection?.pack_id ?? card.pack_id;
    const extracted = await this.extracted(pack);
    const subkind = card.subkind ?? card.kind;
    const kind = subkind === "character" ? "char" : /tileset|terrain|floor/u.test(subkind ?? key) ? "tile" : "prop";
    const animations = card.sprite?.animations ?? [];

    if (spec.action || (!card.sprite?.facings && animations.length)) {
      const animation = spec.action
        ? animations.find(({ name }) => name === spec.action)
        : animations[0];
      if (!animation) {
        throw new Error(`${key} has no action ${spec.action}; has ${animations.map(({ name }) => name).join(", ")}`);
      }
      if (animation.sheets?.length) {
        const sheet =
          (spec.variant && animation.sheets.find(({ variant }) => variant === spec.variant)) ||
          animation.sheets.find(({ variant }) => variant === "shadow") ||
          animation.sheets[0];
        const row = animation.directions.indexOf(spec.dir ?? animation.directions[0]);
        if (row < 0) throw new Error(`${key} ${animation.name} has no direction ${spec.dir}`);
        return {
          n: animation.frames.length,
          kind,
          fw: sheet.frame_w,
          fh: sheet.frame_h,
          frame: (index) => ({
            file: safeJoin(extracted, sheet.path),
            crop: {
              left: (sheet.left ?? 0) + animation.frames[index] * sheet.frame_w,
              top: (sheet.top ?? 0) + row * sheet.frame_h,
              width: sheet.frame_w,
              height: sheet.frame_h,
            },
          }),
        };
      }
      if (animation.direction_files) {
        const files = animation.direction_files[spec.dir ?? Object.keys(animation.direction_files)[0]];
        if (!files) throw new Error(`${key} ${animation.name} has no direction ${spec.dir}`);
        return {
          n: animation.frames.length,
          kind,
          frame: (index) => ({ file: safeJoin(extracted, files[animation.frames[index]]) }),
        };
      }
      return {
        n: animation.frames.length,
        kind,
        frame: (index) => ({ file: safeJoin(extracted, animation.files[animation.frames[index]]) }),
      };
    }

    if (card.sprite?.facings) {
      const file = card.sprite.facings[spec.dir] ?? Object.values(card.sprite.facings)[0];
      return { n: 1, kind, frame: () => ({ file: safeJoin(extracted, file) }) };
    }
    const file = card.source?.files?.[0]?.path;
    if (!file) throw new Error(`${key} has no renderable source file`);
    return { n: 1, kind, frame: () => ({ file: safeJoin(extracted, file) }) };
  }

  async #resolveSheet(spec) {
    const [pack, directory] = spec.ref.slice(6).split("|");
    if (!pack || !directory || !spec.action) {
      throw new Error(`sheet refs need sheet:<pack>|<directory> plus an action`);
    }
    const extracted = await this.extracted(pack);
    const file = safeJoin(extracted, path.join(directory, `${spec.action}.png`));
    const sharp = await this.sharp();
    const metadata = await sharp(file).metadata();
    const columns = spec.columns ?? 15;
    const rows = spec.rows ?? 8;
    const order = spec.directions ?? directions8;
    const row = order.indexOf(spec.dir ?? order[0]);
    if (row < 0) throw new Error(`${spec.ref} ${spec.action} has no direction ${spec.dir}`);
    const fw = metadata.width / columns;
    const fh = metadata.height / rows;
    if (!Number.isInteger(fw) || !Number.isInteger(fh)) throw new Error(`${file} is not a ${columns}x${rows} frame sheet`);
    return {
      n: columns,
      kind: "char",
      fw,
      fh,
      frame: (index) => ({
        file,
        crop: { left: index * fw, top: row * fh, width: fw, height: fh },
      }),
    };
  }

  async verify(spec) {
    const resolved = await this.resolve(spec);
    await access(resolved.frame(0).file);
    return resolved;
  }
}

export async function loadAssetLibrary({ assetsRoot, catalogFile }) {
  const catalog = JSON.parse(await readFile(catalogFile, "utf8"));
  return new AssetLibrary({ assetsRoot, catalog });
}
