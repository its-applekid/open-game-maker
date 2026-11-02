import { readFile } from "node:fs/promises";
import path from "node:path";

export function resolveInside(root, relativePath) {
  if (!relativePath || path.isAbsolute(relativePath)) {
    throw new Error(`expected a relative project path, got ${JSON.stringify(relativePath)}`);
  }
  const target = path.resolve(root, relativePath);
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`path escapes showcase project: ${relativePath}`);
  }
  return target;
}

export async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

export async function loadProject(projectRoot) {
  const root = path.resolve(projectRoot);
  const sequence = await readJson(path.join(root, "sequence.json"));
  const regions = {};
  const sheets = {};

  for (const stop of sequence.stops ?? []) {
    regions[stop.region] ??= await readJson(resolveInside(root, stop.region));
    sheets[stop.sheet] ??= await readJson(resolveInside(root, stop.sheet));
  }

  return { root, sequence, regions, sheets };
}

export function parseArgs(argv, required = []) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) throw new Error(`unexpected argument ${token}`);
    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`missing value for --${key}`);
    args[key] = value;
    index += 1;
  }
  for (const key of required) {
    if (!args[key]) throw new Error(`missing required --${key}`);
  }
  return args;
}
