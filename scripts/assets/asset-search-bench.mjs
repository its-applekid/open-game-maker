// Measure asset search at library scale (C3 §10, ticket #364).
//
// One question: which index answers `gm assets search` in milliseconds when every Sonniss sound effect has its own
// card, instead of the ~3k cards the library has today? The engines below run over the same card set and the same
// queries, and `linear` is a line-for-line port of packages/asset-cards/src/search.ts, so the first column is what
// the CLI does today.
//
// Engines:
//   linear     today: full scan, every card's fields re-tokenized on every query
//   cached     the same scan with the token lists built once, i.e. the cheapest a full scan can be
//   postings   the JSON index plus inverted postings, built once at preprocess time
//   fts5       SQLite FTS5 through node:sqlite (no new dependency), kind/family/status as columns
//   shards     JSON shards by kind, parsed and scanned per query
//   vectors    brute-force cosine over 512-d vectors, for the optional CLAP/CLIP pass
//
// No arguments means a synthetic card set shaped like the C3 cards and the library's mix (mostly audio), so the
// numbers never need the asset library. On a host that has the library:
//   node scripts/assets/asset-search-bench.mjs --root assets-local
// reports what is on disk (files, bytes, cards) and measures the real built index:
//   node scripts/assets/asset-search-bench.mjs --index assets-local/index/cards.index.json --cards 0
//
// Run: node scripts/assets/asset-search-bench.mjs [--cards N,N,...] [--index FILE] [--root DIR] [--out FILE]

import { mkdtempSync, mkdirSync, readFileSync, statSync, writeFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';

// Real requests from the game skills and the design packet (skills/gm-audio, gm-core, gm-set-*, docs/new-game).
const QUERIES = [
  ['footstep gravel', {}],
  ['footsteps stone', {}],
  ['sword impact', {}],
  ['orc attack', {}],
  ['castle wall', {}],
  ['cave ambience', {}],
  ['forest wind loop', {}],
  ['calm piano', {}],
  ['upbeat chiptune', {}],
  ['ui click', {}],
  ['coin pickup', {}],
  ['skeleton die', {}],
  ['wooden door open', {}],
  ['rain loop', {}],
  ['dragon roar', {}],
  ['hud icon', {}],
  ['crate', { kind: 'model' }],
  ['goblin', { kind: 'model', family: 'detailed-low-poly' }],
  ['water tile', { kind: 'sprite' }],
  ['menu music', { kind: 'audio' }],
];

const NOUNS =
  'sword axe bow arrow shield helmet crate barrel chest coin gem potion key door gate wall floor roof stairs column torch lantern candle treasure sack rope ladder bridge fence rock stone tree bush grass fern mushroom flower log stump bone skull grave tomb statue fountain well cart wagon boat ship cannon tower castle hut house shop market stall table chair bed shelf book banner flag net cage trap spike saw blade hammer pickaxe fish crab bird bat rat spider snake wolf bear boar deer horse cow sheep chicken goblin orc troll skeleton zombie ghost knight archer mage king queen child villager merchant guard dragon golem slime wraith imp'.split(
    ' ',
  );
const SENSORY =
  'footstep footsteps impact impacts swing whoosh hit hits break crack crash thud clang slice stab roar growl screech howl chirp buzz hiss splash drip pour boil fire crackle rain wind thunder storm river waterfall crowd chatter laugh scream cough breathe heartbeat bubble spark zap laser beep click tap toggle hover error confirm cancel pickup coin magic spell heal shield block roll jump land'
    .split(' ');
const MOODS = 'dark tense eerie mysterious sad calm cozy cheerful playful energetic epic triumphant neutral'.split(' ');
const GENRES = 'orchestral cinematic classical piano rock metal pop electronic ambient acoustic folk chiptune'.split(' ');
const KEYWORDS =
  'wet dry loud quiet heavy light short long loop loopable one-shot distant close stereo mono bright muffled processed organic synthetic medieval fantasy sci-fi retro modern'.split(
    ' ',
  );
const DIRECTIONS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
const CLIPS = ['idle', 'walk', 'run', 'attack-melee', 'attack-ranged', 'hurt', 'die', 'jump', 'land', 'cast', 'block'];
const FAMILIES = [
  'chunky-low-poly',
  'detailed-low-poly',
  'simple-low-poly',
  'pixel-art',
  'flat-cartoon',
  'isometric-2d',
  'sketch',
  'any',
  'photoreal',
];
const STATUSES = ['draft', 'measured', 'tagged', 'reviewed'];
// Card mix from the library's own shape: sound effects dominate the file count once Sonniss is carded.
const MIX = [
  ['audio', 70],
  ['model', 12],
  ['sprite', 10],
  ['ui', 4],
  ['texture', 2],
  ['collection', 2],
];
const VECTOR_DIMS = 512;
const FTS_LIMIT = 200;

// --- the current algorithm, ported from packages/asset-cards/src/search.ts ---------------------------------
const normalize = (word) => (word.length > 3 && word.endsWith('s') ? word.slice(0, -1) : word);

function tokens(text) {
  return (text ?? '')
    .replace(/([a-zA-Z])([0-9])/g, '$1 $2')
    .replace(/([0-9])([a-zA-Z])/g, '$1 $2')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((word) => normalize(word.toLowerCase()));
}

/** Weighted fields: title 3, objects 2, everything else 1 (search.ts `fieldsOf`). */
function fieldsOf(card) {
  const describe = card.describe ?? {};
  const rest = [
    describe.description,
    ...(describe.keywords ?? []),
    ...(describe.roles ?? []),
    ...(describe.moods ?? []),
    describe.world,
    ...(card.resolved?.environments ?? []),
    ...(card.resolved?.settings ?? []),
    card.kind,
    card.subkind,
    card.id,
    ...(card.source?.files ?? []).map((file) => file.path),
    ...(card.sprite?.animations ?? []).map((animation) => animation.name),
    ...(card.rig?.clips ?? []).map((clip) => clip.name),
    ...(card.anim?.clips ?? []).map((clip) => clip.name),
  ];
  return [
    [3, tokens(card.title)],
    [2, (describe.objects ?? []).flatMap(tokens)],
    [1, rest.flatMap((value) => tokens(value))],
  ];
}

/** 0 when any query word is missing (AND match), else the sum of weighted hits. */
function score(fields, words) {
  const query = words.flatMap(tokens);
  if (query.length === 0) return 0;
  let total = 0;
  for (const word of query) {
    let hits = 0;
    for (const [weight, list] of fields) for (const token of list) if (token === word) hits += weight;
    if (hits === 0) return 0;
    total += hits;
  }
  return total;
}

/** The filters that cost time in a full scan: status, rights use, kind/subkind and style family. */
function passes(card, q) {
  if (card.status === 'quarantined' || card.status === 'rejected') return false;
  if (!(card.resolved?.rights?.uses ?? []).includes(q.use ?? 'in-game')) return false;
  if (q.kind && card.kind !== q.kind) return false;
  if (q.subkind && card.subkind !== q.subkind) return false;
  if (q.family && card.resolved?.style_family !== q.family) return false;
  return true;
}

function rank(hits, limit = FTS_LIMIT) {
  hits.sort((a, b) => b[0] - a[0] || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  return hits.slice(0, limit).map(([, id]) => id);
}

function linearSearch(cards, words, q) {
  const hits = [];
  for (const card of cards) {
    if (!passes(card, q)) continue;
    const value = words.length ? score(fieldsOf(card), words) : 0;
    if (words.length && value === 0) continue;
    hits.push([value, card.id]);
  }
  return rank(hits);
}

function cachedSearch(cards, cachedFields, words, q) {
  const hits = [];
  for (let i = 0; i < cards.length; i += 1) {
    if (!passes(cards[i], q)) continue;
    const value = words.length ? score(cachedFields[i], words) : 0;
    if (words.length && value === 0) continue;
    hits.push([value, cards[i].id]);
  }
  return rank(hits);
}

// --- engine: JSON index plus prebuilt inverted postings ---------------------------------------------------
class Postings {
  constructor(cards) {
    this.cards = cards;
    this.postings = new Map();
    this.byKind = new Map();
    cards.forEach((card, index) => {
      for (const [weight, field] of fieldsOf(card)) {
        const counts = new Map();
        for (const token of field) counts.set(token, (counts.get(token) ?? 0) + 1);
        for (const [token, count] of counts) {
          if (!this.postings.has(token)) this.postings.set(token, []);
          this.postings.get(token).push(index, weight * count);
        }
      }
      const kind = card.kind ?? '';
      if (!this.byKind.has(kind)) this.byKind.set(kind, []);
      this.byKind.get(kind).push(index);
    });
  }

  search(words, q) {
    const query = words.flatMap(tokens);
    const scores = new Map();
    const matched = new Map();
    let pool;
    if (query.length === 0) {
      pool = q.kind === undefined ? this.cards.map((_, index) => index) : (this.byKind.get(q.kind) ?? []);
    } else {
      const lists = query.map((word) => this.postings.get(word));
      if (lists.some((list) => list === undefined)) return [];
      const smallest = lists.reduce((a, b) => (b.length < a.length ? b : a));
      const distinct = new Set(query);
      for (const word of distinct) {
        const list = this.postings.get(word);
        let last = -1;
        for (let i = 0; i < list.length; i += 2) {
          const index = list[i];
          scores.set(index, (scores.get(index) ?? 0) + list[i + 1]);
          if (index === last) continue; // the same card can hold the word in several fields; count it once
          last = index;
          matched.set(index, (matched.get(index) ?? 0) + 1);
        }
      }
      pool = [];
      let previous = -1;
      for (let i = 0; i < smallest.length; i += 2) {
        const index = smallest[i];
        if (index === previous) continue; // one entry per field the word appears in
        previous = index;
        if ((matched.get(index) ?? 0) < distinct.size) continue;
        if (q.kind !== undefined && this.cards[index].kind !== q.kind) continue;
        pool.push(index);
      }
    }
    const hits = [];
    for (const index of pool) {
      if (!passes(this.cards[index], q)) continue;
      hits.push([scores.get(index) ?? 0, this.cards[index].id]);
    }
    return rank(hits);
  }
}

// --- engine: SQLite FTS5 through node:sqlite --------------------------------------------------------------
function buildFts(path, cards) {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = OFF');
  db.exec('PRAGMA synchronous = OFF');
  db.exec('CREATE TABLE cards (id TEXT PRIMARY KEY, kind TEXT, subkind TEXT, family TEXT, status TEXT, uses TEXT)');
  db.exec('CREATE VIRTUAL TABLE cards_fts USING fts5(id UNINDEXED, title, body)');
  const insertCard = db.prepare('INSERT INTO cards VALUES (?, ?, ?, ?, ?, ?)');
  const insertFts = db.prepare('INSERT INTO cards_fts VALUES (?, ?, ?)');
  db.exec('BEGIN');
  for (const card of cards) {
    const describe = card.describe ?? {};
    const body = [
      describe.description ?? '',
      ...(describe.objects ?? []),
      ...(describe.keywords ?? []),
      ...(describe.roles ?? []),
      ...(describe.moods ?? []),
      ...(card.resolved?.environments ?? []),
      ...(card.source?.files ?? []).map((file) => file.path),
    ].join(' ');
    insertCard.run(
      card.id,
      card.kind ?? '',
      card.subkind ?? '',
      card.resolved?.style_family ?? '',
      card.status ?? '',
      (card.resolved?.rights?.uses ?? []).join(' '),
    );
    insertFts.run(card.id, card.title ?? '', body);
  }
  db.exec('COMMIT');
  db.exec('CREATE INDEX cards_kind ON cards(kind)');
  db.exec("INSERT INTO cards_fts(cards_fts) VALUES('optimize')");
  return db;
}

function ftsSearch(db, words, q) {
  const where = ['cards.uses LIKE ?', "cards.status NOT IN ('quarantined', 'rejected')"];
  const params = [`%${q.use ?? 'in-game'}%`];
  if (q.kind) {
    where.push('cards.kind = ?');
    params.push(q.kind);
  }
  if (q.subkind) {
    where.push('cards.subkind = ?');
    params.push(q.subkind);
  }
  if (q.family) {
    where.push('cards.family = ?');
    params.push(q.family);
  }
  const match = words.flatMap(tokens).map((token) => `"${token}"`).join(' AND ');
  const sql = match
    ? `SELECT cards.id FROM cards_fts JOIN cards ON cards.id = cards_fts.id WHERE cards_fts MATCH ? AND ${where.join(' AND ')} ORDER BY rank LIMIT ${FTS_LIMIT}`
    : `SELECT cards.id FROM cards WHERE ${where.join(' AND ')} ORDER BY cards.id LIMIT ${FTS_LIMIT}`;
  return db.prepare(sql).all(...(match ? [match, ...params] : params)).map((row) => row.id);
}

// --- engine: JSON shards by kind, parsed per query ---------------------------------------------------------
function writeShards(cards, root) {
  mkdirSync(root, { recursive: true });
  const byKind = new Map();
  for (const card of cards) {
    const kind = card.kind ?? 'other';
    if (!byKind.has(kind)) byKind.set(kind, []);
    byKind.get(kind).push(card);
  }
  const paths = new Map();
  for (const [kind, list] of byKind) {
    const path = join(root, `${kind}.json`);
    writeFileSync(path, JSON.stringify(list));
    paths.set(kind, path);
  }
  return paths;
}

function shardSearch(paths, words, q) {
  const out = [];
  for (const [kind, path] of paths) {
    if (q.kind && kind !== q.kind) continue;
    for (const card of JSON.parse(readFileSync(path, 'utf8'))) {
      if (!passes(card, q)) continue;
      if (words.length && score(fieldsOf(card), words) === 0) continue;
      out.push(card.id);
    }
  }
  return out.slice(0, FTS_LIMIT);
}

// --- engine: brute-force cosine over 512-d vectors ---------------------------------------------------------
/** Hashed bag-of-words stand-in for a CLAP/CLIP embedding: same width, same cosine cost, no model needed. */
function vectorOf(card) {
  const describe = card.describe ?? {};
  const text = [
    card.title ?? '',
    describe.description ?? '',
    ...(describe.objects ?? []),
    ...(describe.moods ?? []),
    ...(describe.keywords ?? []),
  ].join(' ');
  const vec = new Float32Array(VECTOR_DIMS);
  for (const token of tokens(text)) {
    let hash = 2166136261;
    for (let i = 0; i < token.length; i += 1) hash = Math.imul(hash ^ token.charCodeAt(i), 16777619);
    vec[(hash >>> 0) % VECTOR_DIMS] += 1;
  }
  return vec;
}

function cosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < VECTOR_DIMS; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

function vectorSearch(vectors, query, top = 10) {
  const best = [];
  for (const [id, vec] of vectors) best.push([cosine(query, vec), id]);
  best.sort((a, b) => b[0] - a[0]);
  return best.slice(0, top).map(([, id]) => id);
}

// --- synthetic cards -------------------------------------------------------------------------------------
function makeCards(count, seed = 364) {
  let state = seed;
  const rand = () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
  const pick = (list) => list[Math.floor(rand() * list.length) % list.length];
  const sample = (list, n) => {
    const copy = [...list];
    const out = [];
    while (out.length < n && copy.length) out.push(copy.splice(Math.floor(rand() * copy.length), 1)[0]);
    return out;
  };
  const kinds = MIX.flatMap(([kind, share]) => Array(share).fill(kind));
  const cards = [];
  for (let i = 0; i < count; i += 1) {
    const kind = kinds[i % kinds.length];
    const collection = pick([
      'sonniss-gdc2026-part9-1of5',
      'kenney-audio',
      'sidetrax-orchestral',
      'pixabay-music-curated',
      'kenney-mini-dungeon',
      'kaykit-dungeon',
    ]);
    let subkind;
    let title;
    let path;
    let description;
    if (kind === 'audio') {
      subkind = pick(['sfx/footstep', 'sfx/weapon', 'sfx/foley', 'ambience', 'music/loop', 'music/track', 'ui', 'voice']);
      const word = pick(SENSORY);
      title = `${word} ${pick(NOUNS)} ${String(Math.floor(rand() * 40)).padStart(2, '0')}`;
      path = `packs/sonniss-gdc2026-part9/${pick(['weather', 'creatures', 'weapons', 'foley'])}/${word}_${Math.floor(rand() * 999)}.wav`;
      description = `${word} recorded ${pick(['close', 'distant'])} with ${pick(['light', 'heavy'])} ${pick(['tail', 'attack', 'decay'])}`;
    } else if (kind === 'model' || kind === 'sprite') {
      subkind = kind === 'model' ? pick(['prop', 'kit', 'character', 'creature']) : pick(['character', 'tile', 'prop']);
      const word = pick(NOUNS);
      title = `${pick(['Polygon', 'Mini', 'Modern', 'Toon'])} ${word} ${pick(DIRECTIONS)}`;
      path = `packs/kenney-mini-dungeon/Models/GLB format/${word}-${pick(DIRECTIONS)}.glb`;
      description = `low poly ${word} for a ${pick(['dungeon', 'forest', 'village'])} scene`;
    } else if (kind === 'collection') {
      subkind = undefined;
      title = `${pick(['Sonniss', 'Kenney', 'Synty', 'Sidetrax'])} ${pick(NOUNS)} pack`;
      path = 'packs/collection/collection.card.json';
      description = title;
    } else {
      subkind = kind === 'ui' ? pick(['icon', 'panel', 'font']) : pick(['material', 'skybox']);
      title = `${pick(NOUNS)} ${subkind}`;
      path = `packs/kenney-ui/PNG/${pick(NOUNS)}_${subkind}.png`;
      description = `${subkind} for ${pick(['hud', 'menu', 'inventory'])}`;
    }
    const card = {
      id: `t1:${collection}/asset-${i}@v1`,
      card_type: kind === 'collection' ? 'collection' : 'asset',
      status: pick(STATUSES),
      kind,
      subkind,
      title,
      collection,
      describe: {
        description,
        objects: sample(NOUNS, 1 + Math.floor(rand() * 5)),
        keywords: sample(KEYWORDS, 2 + Math.floor(rand() * 5)),
        roles: sample(
          ['floor', 'wall', 'door', 'pickup', 'weapon', 'enemy', 'ui-element', 'music-bed', 'ambience-bed', 'feedback'],
          1 + Math.floor(rand() * 3),
        ),
        moods: sample(MOODS, 1 + Math.floor(rand() * 3)),
        world: pick(['dungeon', 'forest', 'town', 'cave', 'castle']),
      },
      resolved: {
        style_family: pick(FAMILIES),
        environments: sample(['dungeon', 'crypt', 'cave', 'forest', 'town', 'village', 'castle'], 1 + Math.floor(rand() * 3)),
        settings: sample(['fantasy', 'medieval', 'sci-fi', 'modern', 'none'], 1 + Math.floor(rand() * 2)),
        rights: { uses: ['in-game', 'placeholder'] },
      },
      source: { files: [{ path }] },
    };
    if (subkind?.startsWith('music')) card.describe.genre = sample(GENRES, 1 + Math.floor(rand() * 3));
    if (kind === 'audio') {
      card.audio = {
        duration_s: Number((rand() * 240).toFixed(2)),
        loudness_lufs: rand() < 0.3 ? null : Number((-40 + rand() * 32).toFixed(1)),
        peak_dbfs: Number((-12 + rand() * 12).toFixed(1)),
        loopable: rand() < 0.3,
      };
    }
    if (kind === 'model' && (subkind === 'character' || subkind === 'creature')) {
      card.rig = {
        rig_id: `rig:${Math.floor(rand() * 1e12).toString(16)}`,
        clips: CLIPS.map((clip) => ({ name: `${clip}-${pick(DIRECTIONS)}`, canonical: clip })),
      };
    }
    if (kind === 'sprite') card.sprite = { animations: CLIPS.map((clip) => ({ name: `${clip}-${pick(DIRECTIONS)}` })) };
    cards.push(card);
  }
  return cards;
}

// --- measurement -----------------------------------------------------------------------------------------
const now = () => Number(process.hrtime.bigint() / 1000n) / 1000; // ms

function timeit(fn, repeats = 3) {
  const samples = [];
  for (let i = 0; i < repeats; i += 1) {
    const started = now();
    fn();
    samples.push(now() - started);
  }
  samples.sort((a, b) => a - b);
  return {
    p50: Number(samples[Math.floor(samples.length / 2)].toFixed(2)),
    p95: Number(samples[Math.max(0, Math.ceil(samples.length * 0.95) - 1)].toFixed(2)),
    max: Number(samples.at(-1).toFixed(2)),
    repeats,
  };
}

function runQueries(engine, queries) {
  const samples = [];
  const counts = [];
  let hits = 0;
  for (let i = 0; i < queries; i += 1) {
    const [text, filters] = QUERIES[i % QUERIES.length];
    const started = now();
    const found = engine(text.split(' '), { ...filters }).length;
    hits += found;
    counts.push(found);
    samples.push(now() - started);
  }
  samples.sort((a, b) => a - b);
  return {
    p50: Number(samples[Math.floor(samples.length / 2)].toFixed(2)),
    p95: Number(samples[Math.max(0, Math.ceil(samples.length * 0.95) - 1)].toFixed(2)),
    queries: samples.length,
    hits,
    counts,
  };
}

function bench(cards, { queries, workdir, vectorsAt, engines }) {
  const result = { cards: cards.length };
  const repeats = cards.length <= 20000 ? 3 : 1;

  const payload = JSON.stringify({ cards });
  result.json = { bytes: payload.length, bytesPerCard: Math.round(payload.length / Math.max(1, cards.length)) };
  result.json.parseMs = timeit(() => JSON.parse(payload), repeats).p50;

  let started = now();
  const cachedFields = cards.map(fieldsOf);
  result.cachedFieldsBuildMs = Math.round(now() - started);

  started = now();
  const postings = new Postings(cards);
  result.postingsBuildMs = Math.round(now() - started);

  const dbPath = join(workdir, `bench-${cards.length}.db`);
  started = now();
  const db = buildFts(dbPath, cards);
  result.ftsBuildMs = Math.round(now() - started);
  result.ftsBytes = statSync(dbPath).size;

  started = now();
  const shardPaths = writeShards(cards, join(workdir, `shards-${cards.length}`));
  result.shardsBuildMs = Math.round(now() - started);
  result.shardsBytes = [...shardPaths.values()].reduce((sum, path) => sum + statSync(path).size, 0);

  if (engines.has('linear')) result.linear = runQueries((words, q) => linearSearch(cards, words, q), queries);
  if (engines.has('cached')) result.cached = runQueries((words, q) => cachedSearch(cards, cachedFields, words, q), queries);
  if (engines.has('postings')) result.postings = runQueries((words, q) => postings.search(words, q), queries);
  if (engines.has('fts5')) result.fts = runQueries((words, q) => ftsSearch(db, words, q), queries);
  if (engines.has('shards')) result.shards = runQueries((words, q) => shardSearch(shardPaths, words, q), queries);
  db.close();
  const compared = ['linear', 'cached', 'postings'].filter((name) => result[name]);
  if (compared.some((name) => result[name].hits !== result[compared[0]].hits)) {
    throw new Error(`engines disagree on hits: ${JSON.stringify(Object.fromEntries(compared.map((name) => [name, result[name].counts])))}`);
  }

  const sample = cards.slice(0, Math.min(vectorsAt, cards.length));
  started = now();
  const vectors = sample.map((card) => [card.id, vectorOf(card)]);
  result.vectorsBuildMs = Math.round(now() - started);
  result.vectorsBytes = sample.length * VECTOR_DIMS * 4;
  const queryVec = vectors[0]?.[1] ?? new Float32Array(VECTOR_DIMS);
  const timing = timeit(() => vectorSearch(vectors, queryVec), repeats);
  result.vectors = {
    ...timing,
    rows: sample.length,
    msPer100k: Number((timing.p50 * (100000 / Math.max(1, sample.length))).toFixed(1)),
  };
  return result;
}

function libraryReport(root) {
  const byExt = new Map();
  const bytesByExt = new Map();
  let total = 0;
  let bytes = 0;
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) {
        const ext = extname(entry.name).slice(1).toLowerCase() || 'none';
        const size = statSync(path).size;
        byExt.set(ext, (byExt.get(ext) ?? 0) + 1);
        bytesByExt.set(ext, (bytesByExt.get(ext) ?? 0) + size);
        total += 1;
        bytes += size;
      }
    }
  };
  walk(root);
  const top = (map) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
  let cards = 0;
  try {
    const doc = JSON.parse(readFileSync(join(root, 'index', 'cards.index.json'), 'utf8'));
    cards = (doc.cards ?? []).length;
  } catch {
    cards = 0;
  }
  return {
    totalFiles: total,
    totalGb: Number((bytes / 1e9).toFixed(2)),
    cards,
    filesByExt: Object.fromEntries(top(byExt)),
    gbByExt: Object.fromEntries(top(bytesByExt).map(([ext, size]) => [ext, Number((size / 1e9).toFixed(2))])),
  };
}

function table(rows) {
  const lines = [
    '| cards | index JSON | linear (today) p50/p95 | cached scan p50/p95 | postings p50/p95 | FTS5 p50/p95 | shards p50/p95 | FTS5 size |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
  ];
  const cell = (engine) =>
    row => (row[engine] ? `${row[engine].p50.toFixed(row[engine].p50 < 10 ? 2 : 1)} / ${row[engine].p95.toFixed(row[engine].p95 < 10 ? 2 : 1)} ms` : '-');
  for (const row of rows) {
    lines.push(
      `| ${row.cards.toLocaleString('en-US')} | ${(row.json.bytes / 1e6).toFixed(1)} MB (${row.json.bytesPerCard} B/card, parse ${row.json.parseMs.toFixed(0)} ms) | ` +
        `${cell('linear')(row)} | ${cell('cached')(row)} | ${cell('postings')(row)} | ${cell('fts')(row)} | ${cell('shards')(row)} | ` +
        `${(row.ftsBytes / 1e6).toFixed(1)} MB |`,
    );
  }
  return lines.join('\n');
}

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

function main() {
  const cardArg = arg('cards', '2000,20000,100000');
  const scales = cardArg.split(',').map(Number).filter((value) => value > 0);
  const indexFile = arg('index');
  const root = arg('root');
  const queries = Number(arg('queries', '40'));
  const vectorsAt = Number(arg('vectors-at', '20000'));
  const outFile = arg('out');
  const workdir = arg('workdir') ?? mkdtempSync(join(tmpdir(), 'asset-search-bench-'));
  const engines = new Set((arg('engines', 'linear,cached,postings,fts5,shards,vectors') ?? '').split(','));

  const report = { queries: QUERIES.length, node: process.version };
  if (root) {
    report.library = libraryReport(root);
    console.log('library:', JSON.stringify(report.library, null, 1));
  }
  const rows = [];
  if (indexFile) {
    const doc = JSON.parse(readFileSync(indexFile, 'utf8'));
    const cards = (doc.cards ?? doc).map((card) => ({ ...card, resolved: card.resolved ?? {} }));
    rows.push(bench(cards, { queries, workdir, vectorsAt, engines }));
  } else {
    for (const count of scales) rows.push(bench(makeCards(count), { queries, workdir, vectorsAt, engines }));
  }
  report.results = rows;
  console.log(table(rows));
  for (const row of rows) {
    console.log(
      `hits ${row.cards}: ` +
        ['linear', 'cached', 'postings', 'fts', 'shards'].filter((name) => row[name]).map((name) => `${name} ${row[name].hits} `).join('') + '; ' +
        `build: cached fields ${row.cachedFieldsBuildMs} ms, postings ${row.postingsBuildMs} ms, fts5 ${row.ftsBuildMs} ms, ` +
        `shards ${row.shardsBuildMs} ms (${(row.shardsBytes / 1e6).toFixed(1)} MB); vectors ${row.vectors.p50} ms for ` +
        `${row.vectors.rows} rows (${(row.vectorsBytes / 1e6).toFixed(1)} MB, ${row.vectors.msPer100k} ms per 100k rows)`,
    );
  }
  if (outFile) {
    writeFileSync(outFile, `${JSON.stringify(report, null, 1)}\n`);
    console.log(`wrote ${outFile}`);
  }
}

main();
