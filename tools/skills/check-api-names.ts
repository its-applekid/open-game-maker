import { createRequire } from 'node:module';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export type Lib = 'three' | 'phaser';

export interface ApiCheckResult {
  skill: string;
  library: Lib;
  classes: string[];
  methods: string[];
  missing: { name: string; kind: 'class' | 'method'; file: string; line: number }[];
}

const here = dirname(fileURLToPath(import.meta.url));
const CODE_FENCE = /^\s*```\s*(ts|js|typescript|javascript|tsx|jsx)\s*$/;
const CLASS_USE = /new\s+(?:THREE\.|Phaser\.(?:\w+\.)*)?([A-Z]\w*)\s*\(/g;
const IMPORT_USE = /import\s*\{([^}]*)\}\s*from\s*['"]three/g;
const METHOD_USE = /\.([a-z]\w*)\s*\(/g;
const LIB_DEFS = [
  /\bclass\s+(\w+)/g,
  /\bfunction\s*\*?\s*(\w+)/g,
  /\bexport\s+(?:default\s+)?(?:async\s+)?(?:function\*?|const|let|var|class)\s+(\w+)/g,
  /\b(\w+)\s*[:=]\s*(?:async\s+)?function\b/g,
  /\b(\w+)\s*=\s*new\s+Class\s*\(/g,
  /^\s*(?:static\s+|async\s+|get\s+|set\s+)*(\w+)\s*\([^)]*\)\s*\{/gm,
  /\bregister\s*\(\s*'(\w+)'/g,
  /\baddMethodChaining\s*\(\s*'(\w+)'/g,
];
const DTS_DEFS = [
  /\b(?:class|interface|namespace|function|var|const)\s+(\w+)/g,
  /^\s*(?:static\s+)?(\w+)\??\s*[(<:]/gm,
];
const BLOCK_DEFS = [
  /\b(?:function\*?|class|interface|type|enum)\s+(\w+)/g,
  /\b(?:const|let|var)\s+(\w+)/g,
  /^\s*(?:(?:public|private|protected|static|async|readonly|override|get|set)\s+)*(\w+)\s*\([^)]*\)\s*(?::[^{]+)?\{/gm,
  /\b(\w+)\s*[:=]\s*(?:async\s+)?(?:function\b|\([^)]*\)\s*(?::[^=]+)?=>|\w+\s*=>)/g,
  /\b(\w+)\??\s*:\s*\([^)]*\)\s*=>/g,
  /[{;,]\s*(\w+)\??\s*\([^)]*\)\s*:\s*\w/g,
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function collect(text: string, patterns: RegExp[], into: Set<string>): Set<string> {
  for (const pattern of patterns) for (const match of text.matchAll(pattern)) into.add(match[1]);
  return into;
}

/** Adds the names in `export { a, b as c }` lists. */
function collectExportLists(text: string, into: Set<string>): void {
  for (const [, list] of text.matchAll(/\bexport\s*\{([^}]*)\}/g)) {
    for (const name of list.match(/\w+/g) ?? []) into.add(name);
  }
}

/**
 * Names the platform provides: JavaScript globals with their properties, and the browser APIs (DOM, Canvas,
 * Web Audio) declared in TypeScript's `lib.dom.d.ts`.
 */
function platformNames(): Set<string> {
  const dom = createRequire(import.meta.url).resolve('typescript/lib/lib.dom.d.ts');
  const names = collect(readFileSync(dom, 'utf8'), DTS_DEFS, new Set<string>());
  for (const key of Object.getOwnPropertyNames(globalThis)) {
    names.add(key);
    const value = (globalThis as Record<string, unknown>)[key];
    if (value && (typeof value === 'object' || typeof value === 'function')) {
      for (const own of Object.getOwnPropertyNames(value)) names.add(own);
      const proto = (value as { prototype?: object }).prototype;
      if (proto) for (const own of Object.getOwnPropertyNames(proto)) names.add(own);
    }
  }
  return names;
}

const libraryCache = new Map<string, Set<string>>();

/** Every name the library source defines, so a skill's name can be looked up. */
export function libraryNames(libSrcRoot: string): Set<string> {
  const cached = libraryCache.get(libSrcRoot);
  if (cached) return cached;
  const names = new Set<string>();
  for (const sub of ['src', 'examples/jsm', 'types']) {
    const root = join(libSrcRoot, sub);
    if (!statSync(root, { throwIfNoEntry: false })?.isDirectory()) continue;
    for (const file of walk(root)) {
      if (file.endsWith('.d.ts')) collect(readFileSync(file, 'utf8'), DTS_DEFS, names);
      else if (file.endsWith('.js')) {
        const text = readFileSync(file, 'utf8');
        collect(text, LIB_DEFS, names);
        collectExportLists(text, names);
      }
    }
  }
  if (names.size === 0) throw new Error(`no library source found under ${libSrcRoot}`);
  libraryCache.set(libSrcRoot, names);
  return names;
}

interface Block {
  start: number;
  lines: string[];
}

function codeBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let current: Block | undefined;
  let inOtherFence = false;
  text.split('\n').forEach((line, index) => {
    if (current) {
      if (/^\s*```\s*$/.test(line)) {
        blocks.push(current);
        current = undefined;
      } else current.lines.push(line);
    } else if (inOtherFence) {
      if (/^\s*```\s*$/.test(line)) inOtherFence = false;
    } else if (CODE_FENCE.test(line)) current = { start: index + 2, lines: [] };
    else if (/^\s*```/.test(line)) inOtherFence = true;
  });
  return blocks;
}

function stripComments(line: string): string {
  return line.replace(/(^|\s)\/\/.*$/, '$1').replace(/\/\*.*?\*\//g, '');
}

function checkFile(
  file: string,
  base: string,
  knownFor: (code: string) => Set<string>,
  allowed: (name: string) => boolean,
  result: ApiCheckResult,
): void {
  const classes = new Set(result.classes);
  const methods = new Set(result.methods);
  for (const block of codeBlocks(readFileSync(file, 'utf8'))) {
    const code = block.lines.map(stripComments);
    const local = collect(code.join('\n'), BLOCK_DEFS, new Set());
    const known = knownFor(code.join('\n'));
    const isKnown = (name: string) => known.has(name) || local.has(name) || allowed(name);
    code.forEach((line, offset) => {
      const where = { file: relative(base, file), line: block.start + offset };
      const lineClasses = [...line.matchAll(CLASS_USE)].map((m) => m[1]);
      for (const m of line.matchAll(IMPORT_USE)) {
        lineClasses.push(
          ...m[1].split(',').map((part) =>
            part
              .trim()
              .split(/\s+as\s+/)[0]
              .replace(/^type\s+/, ''),
          ),
        );
      }
      for (const name of lineClasses.filter(Boolean)) {
        classes.add(name);
        if (!isKnown(name)) result.missing.push({ name, kind: 'class', ...where });
      }
      for (const [, name] of line.matchAll(METHOD_USE)) {
        methods.add(name);
        if (!isKnown(name)) result.missing.push({ name, kind: 'method', ...where });
      }
    });
  }
  result.classes = [...classes].sort();
  result.methods = [...methods].sort();
}

function skillsIn(dir: string): { skill: string; files: string[] }[] {
  const md = (files: string[]) => files.filter((f) => f.endsWith('.md')).sort();
  if (statSync(join(dir, 'SKILL.md'), { throwIfNoEntry: false }))
    return [{ skill: basename(dir), files: md(walk(dir)) }];
  return readdirSync(dir)
    .sort()
    .flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return [{ skill: name, files: md(walk(path)) }];
      return name.endsWith('.md') ? [{ skill: name.replace(/\.md$/, ''), files: [path] }] : [];
    })
    .filter((s) => s.files.length > 0);
}

/**
 * Checks every class and method name in the TS/JS code blocks of each skill under `dir` against the library source.
 * `allow` entries are bare names or `<skill>:<name>` to excuse a name in one skill only.
 */
export function checkSkillDir(dir: string, lib: Lib, libSrcRoot: string, allow: string[]): ApiCheckResult[] {
  const platform = platformNames();
  const known = new Set([...libraryNames(libSrcRoot), ...platform]);
  const other: Lib = lib === 'three' ? 'phaser' : 'three';
  let otherKnown: Set<string> | undefined;
  // A block that imports only the other engine (a Phaser skill's three.js aside) is checked against that engine,
  // found next to this one in node_modules.
  const knownFor = (code: string) => {
    if (!importsOnly(code, other)) return known;
    otherKnown ??= new Set([...libraryNames(join(dirname(libSrcRoot), other)), ...platform]);
    return otherKnown;
  };
  return skillsIn(dir).map(({ skill, files }) => {
    const result: ApiCheckResult = { skill, library: lib, classes: [], methods: [], missing: [] };
    const allowed = (name: string) => allow.includes(name) || allow.includes(`${skill}:${name}`);
    for (const file of files) checkFile(file, dir, knownFor, allowed, result);
    return result;
  });
}

const IMPORTS: Record<Lib, RegExp> = { three: /from\s+['"]three['"/]/, phaser: /from\s+['"]phaser['"]/ };

function importsOnly(code: string, lib: Lib): boolean {
  const other: Lib = lib === 'three' ? 'phaser' : 'three';
  return IMPORTS[lib].test(code) && !IMPORTS[other].test(code);
}

/**
 * Picks the library for a skill from its set or name. Other gamedev skills use what their code imports, Phaser first
 * because 2D is the default; skills that import neither engine are skipped.
 */
export function libraryFor(set: string, skillDir: string): Lib | undefined {
  const skill = basename(skillDir);
  if (set === 'threejs' || skill.startsWith('threejs-')) return 'three';
  if (set === 'phaser' || skill.startsWith('phaser-')) return 'phaser';
  const text = walk(skillDir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => readFileSync(f, 'utf8'))
    .join('\n');
  if (IMPORTS.phaser.test(text)) return 'phaser';
  if (IMPORTS.three.test(text)) return 'three';
  return undefined;
}

export function loadAllowlist(path = join(here, 'allowlist.json')): Record<Lib, string[]> {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<Record<Lib | 'common', string[]>>;
  const common = raw.common ?? [];
  return { three: [...common, ...(raw.three ?? [])], phaser: [...common, ...(raw.phaser ?? [])] };
}

export interface SetSummary {
  set: string;
  library: Lib;
  skills: number;
  classes: number;
  methods: number;
  results: ApiCheckResult[];
}

/** Runs the checker over a vendor root holding `phaser/`, `threejs/` and `gamedev/` sets. */
export function checkVendorRoot(root: string, allow = loadAllowlist()): SetSummary[] {
  const summaries: SetSummary[] = [];
  for (const set of readdirSync(root).sort()) {
    const setDir = join(root, set);
    if (!statSync(setDir).isDirectory()) continue;
    const byLib: Record<Lib, ApiCheckResult[]> = { three: [], phaser: [] };
    for (const skill of readdirSync(setDir).sort()) {
      const skillDir = join(setDir, skill);
      if (!statSync(skillDir).isDirectory()) continue;
      const lib = libraryFor(set, skillDir);
      if (lib) byLib[lib].push(...checkSkillDir(skillDir, lib, join(here, 'node_modules', lib), allow[lib]));
    }
    for (const library of ['three', 'phaser'] as const) {
      const results = byLib[library];
      if (results.length === 0) continue;
      const unique = (key: 'classes' | 'methods') => new Set(results.flatMap((r) => r[key])).size;
      summaries.push({
        set,
        library,
        skills: results.length,
        classes: unique('classes'),
        methods: unique('methods'),
        results,
      });
    }
  }
  return summaries;
}

function main(argv: string[]): number {
  const root = argv.find((a) => !a.startsWith('--')) ?? join(here, '../../skills/vendor');
  const listIndex = argv.indexOf('--allowlist');
  const allow = loadAllowlist(listIndex >= 0 ? argv[listIndex + 1] : undefined);
  const summaries = checkVendorRoot(root, allow);
  const missing = summaries.flatMap((s) =>
    s.results.flatMap((r) => r.missing.map((m) => ({ ...m, set: s.set, skill: r.skill }))),
  );
  if (argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(summaries, null, 2)}\n`);
  } else {
    for (const s of summaries) {
      for (const r of s.results) {
        process.stdout.write(
          `${r.skill} ${r.library} classes=${r.classes.length} methods=${r.methods.length} missing=${r.missing.length}\n`,
        );
      }
      const count = s.results.reduce((n, r) => n + r.missing.length, 0);
      process.stdout.write(
        `== ${s.set} ${s.library} skills=${s.skills} classes=${s.classes} methods=${s.methods} missing=${count}\n`,
      );
    }
    for (const m of missing)
      process.stdout.write(`missing ${m.kind} ${m.name} ${m.set}/${m.skill}/${m.file}:${m.line}\n`);
  }
  return missing.length === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
