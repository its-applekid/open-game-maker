---
license: Apache-2.0
source: gamedev-skills/awesome-gamedev-agent-skills@184b72be02884f782a0058f2eeae2ce4277453e4 skills/disciplines/save-systems/SKILL.md
modified: true
name: save-systems
description: >
  Design save/load for game state — choosing what to serialize, file formats,
  save slots, atomic crash-safe writes, schema versioning and migration, and
  autosave. Engine-neutral. Use when the user mentions save system, save/load,
  game state persistence, save slots, autosave, save file corruption, or
  migrating old saves to a new version.
---

# Save systems

A save file is a **serialized snapshot of game state** that survives restarts.
The hard parts aren't writing bytes — they're choosing *what* to save, writing it
so a crash mid-save can't corrupt it, and reading *old* saves after you ship a
patch. Get those three right and the rest is plumbing.

## When to use

- Use to persist progress: player stats, inventory, world flags, settings,
  positions — across sessions and game updates.
- Use to design save slots, quicksave/autosave, and crash-safe writes.
- Use when old save files break after a content/code change (versioning &
  migration).

**When *not* to use:** for server-side or cross-device persistence, design the
backend separately; this skill covers saves the game writes on the player's own
device (`localStorage` or IndexedDB in a browser game).

## Core workflow

1. **Decide what state is authoritative.** Save the *data* (hp, position, seed,
   unlocked flags), not engine objects or scene nodes. You will reconstruct
   objects from data on load — never serialize live node references.
2. **Define a versioned schema.** Every save embeds a `version` integer. This is
   the single most important field for a game you intend to patch.
3. **Pick a format.** JSON/text for readability and debuggability; a binary
   format for size/speed or mild tamper-resistance. Start with JSON.
4. **Write atomically.** Write the whole save under one key (or one IndexedDB
   transaction) and keep the previous copy as a backup. A crash leaves either
   the old save or the new one — never a half-written one.
5. **Load defensively.** Read version → migrate up to current → validate →
   instantiate. Keep a backup of the last good save and fall back on parse error.
6. **Autosave on safe boundaries** (level change, checkpoint), throttled, and to a
   separate slot so it can't clobber a manual save.
7. **Verify**: save, fully quit, relaunch, load — and confirm by inspection that
   state matches. Test loading a save from the previous version.

## Patterns

### 1. Serialize state as plain data (not engine objects)

```ts
const SAVE_VERSION = 3;

interface SaveData {
  version: number;
  player: { hp: number; pos: [number, number] };
  inventory: { id: string; count: number }[];   // ids + counts, not sprites
  flags: Record<string, boolean>;               // e.g. { metGuard: true }
  seed: number;                                 // regenerate procedural content
}

interface Player { hp: number; x: number; y: number; inventory: { id: string; count: number }[] }
interface World { flags: Record<string, boolean>; seed: number }

// Build plain data. Each savable object reports its own state.
function captureState(player: Player, world: World): SaveData {
  return {
    version: SAVE_VERSION,                      // ALWAYS stamp the schema version
    player: { hp: player.hp, pos: [player.x, player.y] },
    inventory: player.inventory.map((i) => ({ ...i })),
    flags: { ...world.flags },
    seed: world.seed,
  };
}

// On load, RECONSTRUCT objects from the data — do not expect live references back.
function applyState(data: SaveData, player: Player, world: World): void {
  player.hp = data.player.hp;
  [player.x, player.y] = data.player.pos;
  player.inventory = data.inventory.map((i) => ({ ...i }));
  world.flags = { ...data.flags };
}
```

### 2. Crash-safe write (new copy first, keep a backup)

```ts
// localStorage writes one key atomically, but a save that spans keys, or a
// quota error halfway, can still leave a broken state. Keep the last good save.
function saveAtomic(key: string, data: object): boolean {
  const json = JSON.stringify(data);
  try {
    const previous = localStorage.getItem(key);
    if (previous !== null) localStorage.setItem(`${key}.bak`, previous);   // keep the last good save
    localStorage.setItem(key, json);
    return true;
  } catch {
    return false;                                 // QuotaExceededError, storage disabled...
  }
}

function loadSave(key: string): Record<string, unknown> | null {   // null = nothing loadable
  for (const k of [key, `${key}.bak`]) {         // .bak covers a corrupted primary
    const raw = localStorage.getItem(k);
    if (raw === null) continue;
    try {
      const data: unknown = JSON.parse(raw);
      if (typeof data === 'object' && data !== null && 'version' in data) return data as Record<string, unknown>;
    } catch {
      // unparsable: try the backup
    }
  }
  return null;
}
// WRONG: writing a half-built object across several keys, or overwriting the only
// copy — a crash or quota error mid-save destroys the player's progress.
```

A crash now leaves the old save, the new one, or the `.bak` — which the loader
tries next. Two limits to know: `localStorage` is synchronous, per-origin and
roughly 5 MB, and the browser may evict it under storage pressure unless you
call `navigator.storage.persist()`. For large saves use IndexedDB, where one
transaction commits all its writes or none. Check the return value and tell the
player when a save fails instead of carrying on.

### 3. Versioned load with migration

```ts
const SAVE_VERSION = 3;
type Data = Record<string, unknown> & { version?: number };

class NewerSaveError extends Error {}

// Each migration is a pure function from one version's shape to the next.
function migrate1to2(d: Data): Data {
  const quests = (d.completedQuests as string[] | undefined) ?? [];
  delete d.completedQuests;
  d.flags = Object.fromEntries(quests.map((k) => [k, true]));   // list -> set-map
  return d;
}
function migrate2to3(d: Data): Data {
  d.difficulty ??= 'normal';                    // new field: old saves get the default
  return d;
}
const MIGRATIONS: Record<number, (d: Data) => Data> = { 1: migrate1to2, 2: migrate2to3 };

function validate(d: Data): void {
  if (typeof d.flags !== 'object' || d.flags === null) throw new Error('save: flags missing');
}

function upgradeSave(raw: string): Data {
  let data = JSON.parse(raw) as Data;
  let v = Number(data.version ?? 1);            // no field = the first shipped schema
  if (v > SAVE_VERSION) throw new NewerSaveError(String(v));   // from a newer build; refuse
  while (v < SAVE_VERSION) {                    // apply migrations in order, v -> v+1
    data = MIGRATIONS[v](data);
    v += 1;
    data.version = v;
  }
  validate(data);                               // check required keys / ranges
  return data;
}
```

### 4. Save slots + throttled autosave

```ts
const slotKey = (n: number): string => `save_${n}`;   // manual slots 0..N
const AUTOSAVE_KEY = 'autosave';                      // separate key: never clobbers a slot
let autosaveCooldown = 0;

function saveNow(key: string, data: object): void {
  localStorage.setItem(key, JSON.stringify(data));
}

function autosaveIfDue(dtSeconds: number, capture: () => object): void {
  autosaveCooldown -= dtSeconds;
  if (autosaveCooldown <= 0) {
    saveNow(AUTOSAVE_KEY, capture());
    autosaveCooldown = 60;                    // throttle: at most once a minute
  }
}
// Trigger an immediate autosave on checkpoints/level transitions, not mid-combat;
// slotKey(0) etc. are for the player's manual saves.
```

## Pitfalls

- **Serializing engine objects/node paths** ties saves to scene structure;
  renaming a node breaks every old save. Save data, rebuild objects on load.
- **No version field.** The day you ship a patch, every existing save is a
  guessing game. Stamp `version` from version 1.
- **In-place writes** corrupt saves on crash/power loss. Always write the new
  copy first, then swap; keep a `.bak`.
- **Trusting the file blindly.** Saves get truncated, hand-edited, or
  cloud-synced stale. Validate on load and fall back to backup on failure.
- **Floats and locale.** Text serializers can drop precision or use comma
  decimal separators in some locales. Use a locale-invariant serializer.
- **Numbers that JSON can't hold**: `JSON.stringify` writes `NaN`/`Infinity`
  as `null` and integers above 2^53 (64-bit IDs, big seeds) lose digits.
  Validate numbers on load and store large IDs as strings.
- **Loading code from save files.** Never `eval` a save or feed one to
  `new Function`; saves get shared online. Keep them plain data and validate
  every field before use.
- **Autosave clobbering manual saves**, or firing mid-action and saving an
  inconsistent state. Use a dedicated autosave slot and save on safe boundaries.
- **Storing secrets or trusting client saves in multiplayer.** A local save is
  player-controlled; never treat it as authoritative for online state. For cloud,
  handle quotas and sync conflicts on the server side.

## References

- `references/versioning-and-migration.md` — schema evolution strategies, the
  migration chain, backups/rollback, format trade-offs (JSON vs binary), a
  load-time validation checklist, and where browser saves live.

## Related skills

- `procedural-gen` — store the seed to regenerate worlds instead of saving them.
- `level-design` — checkpoints are the natural autosave boundaries.
