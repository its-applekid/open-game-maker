import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const gameRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = join(gameRoot, 'public', 'assets-local');

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const assetsRootArg = option('--assets-root');
if (!assetsRootArg) throw new Error('usage: pnpm prepare:assets -- --assets-root <authorized-assets-root>');
const assetsRoot = resolve(assetsRootArg);

function contained(root, path) {
  const resolved = resolve(root, path);
  if (resolved !== root && !resolved.startsWith(`${root}${sep}`)) throw new Error(`path escapes asset root: ${path}`);
  return resolved;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function digest(path) {
  return `sha256:${createHash('sha256').update(await readFile(path)).digest('hex')}`;
}

const sheets = [
  ['knight-walk.png', 'smallscaleint-2d-hd-character-pack-1', 'characters/1knight.card.json', 't1:smallscaleint-2d-hd-character-pack-1/characters/1knight@2026-11-01', 'walk'],
  ['knight-idle.png', 'smallscaleint-2d-hd-character-pack-1', 'characters/1knight.card.json', 't1:smallscaleint-2d-hd-character-pack-1/characters/1knight@2026-11-01', 'idle'],
  ['knight-melee.png', 'smallscaleint-2d-hd-character-pack-1', 'characters/1knight.card.json', 't1:smallscaleint-2d-hd-character-pack-1/characters/1knight@2026-11-01', 'melee'],
  ['survivor-run.png', 'smallscaleint-2d-hd-zombie-rural-tileset', 'characters/survivor-2.card.json', 't1:smallscaleint-2d-hd-zombie-rural-tileset/characters/survivor-2@2026-11-01', 'run'],
  ['survivor-idle.png', 'smallscaleint-2d-hd-zombie-rural-tileset', 'characters/survivor-2.card.json', 't1:smallscaleint-2d-hd-zombie-rural-tileset/characters/survivor-2@2026-11-01', 'idle'],
  ['zombie-run.png', 'smallscaleint-2d-hd-zombie-rural-tileset', 'characters/ruralzombie-1.card.json', 't1:smallscaleint-2d-hd-zombie-rural-tileset/characters/ruralzombie-1@2026-11-01', 'run'],
  ['zombie-attack.png', 'smallscaleint-2d-hd-zombie-rural-tileset', 'characters/ruralzombie-1.card.json', 't1:smallscaleint-2d-hd-zombie-rural-tileset/characters/ruralzombie-1@2026-11-01', 'attack1'],
  ['alpacha-idle.png', 'smallscaleint-2d-animals-mega-pack-1', 'characters/alpacha.card.json', 't1:smallscaleint-2d-animals-mega-pack-1/characters/alpacha@2026-11-01', 'idle'],
  ['bison-idle.png', 'smallscaleint-2d-animals-mega-pack-1', 'characters/bison.card.json', 't1:smallscaleint-2d-animals-mega-pack-1/characters/bison@2026-11-01', 'idle'],
  ['bison-run.png', 'smallscaleint-2d-animals-mega-pack-1', 'characters/bison.card.json', 't1:smallscaleint-2d-animals-mega-pack-1/characters/bison@2026-11-01', 'run'],
  ['wolf-run.png', 'smallscaleint-2d-animals-mega-pack-1', 'characters/grey-wolf.card.json', 't1:smallscaleint-2d-animals-mega-pack-1/characters/grey-wolf@2026-11-01', 'run'],
];

const direct = [
  ['orc-attack.png', 'smallscaleint-2d-orcs-and-goblins-topdown', 'sequences/combined-orc-04.card.json', 't1:smallscaleint-2d-orcs-and-goblins-topdown/sequences/combined-orc-04@2026-11-01', 'Combined/Orc 04/Attack 1.png'],
  ['orc-damage.png', 'smallscaleint-2d-orcs-and-goblins-topdown', 'sequences/combined-orc-04.card.json', 't1:smallscaleint-2d-orcs-and-goblins-topdown/sequences/combined-orc-04@2026-11-01', 'Combined/Orc 04/TakeDamage 1.png'],
  ['fantasy-flora.png', 'smallscaleint-fantasy-tileset-2d-isometric', 'tiles/environment/flora-a1.card.json', 't1:smallscaleint-fantasy-tileset-2d-isometric/tiles/environment/flora-a1@2026-11-01', 'Environment/Flora A1_S.png'],
  ['fantasy-wall.png', 'smallscaleint-fantasy-tileset-2d-isometric', 'tiles/environment/wall-f7.card.json', 't1:smallscaleint-fantasy-tileset-2d-isometric/tiles/environment/wall-f7@2026-11-01', 'Environment/Wall F7_S.png'],
  ['desert-chest.png', 'smallscaleint-2d-desert-fantasy-tileset', 'tiles/environment-sprites/chest-a1.card.json', 't1:smallscaleint-2d-desert-fantasy-tileset/tiles/environment-sprites/chest-a1@2026-11-01', 'Environment/Sprites/Chest A1_S.png'],
  ['desert-chest-open.png', 'smallscaleint-2d-desert-fantasy-tileset', 'tiles/environment-sprites/chest-a2.card.json', 't1:smallscaleint-2d-desert-fantasy-tileset/tiles/environment-sprites/chest-a2@2026-11-01', 'Environment/Sprites/Chest A2_S.png'],
  ['desert-wall.png', 'smallscaleint-2d-desert-fantasy-tileset', 'tiles/environment-sprites/wall-f7.card.json', 't1:smallscaleint-2d-desert-fantasy-tileset/tiles/environment-sprites/wall-f7@2026-11-01', 'Environment/Sprites/Wall F7_S.png'],
  ['rural-car.png', 'smallscaleint-2d-hd-zombie-rural-tileset', 'tiles/isometric-tiles/car1.card.json', 't1:smallscaleint-2d-hd-zombie-rural-tileset/tiles/isometric-tiles/car1@2026-11-01', 'Isometric Tiles/Car1_S.png'],
  ['rural-fence.png', 'smallscaleint-2d-hd-zombie-rural-tileset', 'tiles/isometric-tiles/fence-a1.card.json', 't1:smallscaleint-2d-hd-zombie-rural-tileset/tiles/isometric-tiles/fence-a1@2026-11-01', 'Isometric Tiles/Fence A1_S.png'],
  ['interior-bed.png', 'smallscaleint-2d-hd-zombie-interior-tiles', 'tiles/tiles/bed1.card.json', 't1:smallscaleint-2d-hd-zombie-interior-tiles/tiles/tiles/bed1@2026-11-01', 'Tiles/Bed1_S.png'],
  ['interior-couch.png', 'smallscaleint-2d-hd-zombie-interior-tiles', 'tiles/tiles/couch1.card.json', 't1:smallscaleint-2d-hd-zombie-interior-tiles/tiles/tiles/couch1@2026-11-01', 'Tiles/Couch1_S.png'],
  ['audio/move-a.ogg', 'kenney-desert-shooter-pack', 'sounds/move-a.card.json', 't1:kenney-desert-shooter-pack/sounds/move-a@1.0', 'Sounds/move-a.ogg', '1.0'],
  ['audio/hurt-a.ogg', 'kenney-desert-shooter-pack', 'sounds/hurt-a.card.json', 't1:kenney-desert-shooter-pack/sounds/hurt-a@1.0', 'Sounds/hurt-a.ogg', '1.0'],
  ['audio/coin-a.ogg', 'kenney-desert-shooter-pack', 'sounds/coin-a.card.json', 't1:kenney-desert-shooter-pack/sounds/coin-a@1.0', 'Sounds/coin-a.ogg', '1.0'],
];

const manifest = { version: 1, set: 'smallscaleint', assets: [] };

async function copyVerified({ output, pack, cardPath, cardId, sourcePath, version = '2026-11-01' }) {
  const packRoot = contained(assetsRoot, join('packs', pack));
  const card = await readJson(contained(packRoot, join('cards', cardPath)));
  if (card.id !== cardId) throw new Error(`card id mismatch for ${cardPath}: ${card.id}`);
  const source = card.source?.files?.find((file) => file.path === sourcePath);
  if (!source?.sha256) throw new Error(`source is not locked on ${cardId}: ${sourcePath}`);
  const input = contained(packRoot, join(version, 'extracted', sourcePath));
  const actual = await digest(input);
  if (actual !== source.sha256) throw new Error(`sha256 mismatch for ${cardId}: ${sourcePath}`);
  const destination = contained(outputRoot, output);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(input, destination);
  manifest.assets.push({ output, cardId, sourcePath, sha256: actual });
}

for (const [output, pack, cardPath, cardId, animationName] of sheets) {
  const packRoot = contained(assetsRoot, join('packs', pack));
  const card = await readJson(contained(packRoot, join('cards', cardPath)));
  if (card.id !== cardId) throw new Error(`card id mismatch for ${cardPath}: ${card.id}`);
  const animation = card.sprite?.animations?.find(({ name }) => name === animationName);
  const sheet = animation?.sheets?.find(({ variant }) => variant === 'shadow');
  if (!sheet?.path) throw new Error(`missing shadow sheet for ${cardId} animation ${animationName}`);
  await copyVerified({ output, pack, cardPath, cardId, sourcePath: sheet.path });
}

for (const [output, pack, cardPath, cardId, sourcePath, version] of direct) {
  await copyVerified({ output, pack, cardPath, cardId, sourcePath, ...(version ? { version } : {}) });
}

await writeFile(join(outputRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`prepared ${manifest.assets.length} verified private assets`);
