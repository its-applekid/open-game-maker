// Usage: node validate.mjs <schemas dir> [extra json files to validate as cards/specs...]
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2];
const extra = process.argv.slice(3);
const ajv = new Ajv2020({ allErrors: true, strict: true, strictTypes: false, strictRequired: false, allowUnionTypes: true });
addFormats(ajv);
const load = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const card = ajv.compile(load(path.join(dir, "asset-card.schema.json")));
const spec = ajv.compile(load(path.join(dir, "map-layout-spec.schema.json")));
console.log("schemas compiled (draft 2020-12, strict mode)");

const exDir = path.join(dir, "examples");
const files = fs.readdirSync(exDir).filter((f) => f.endsWith(".json")).map((f) => path.join(exDir, f)).concat(extra);
const docs = Object.fromEntries(files.map((f) => [f, load(f)]));
let fail = 0;

// 1. Schema validation
for (const [f, d] of Object.entries(docs)) {
  const v = d.schema?.startsWith("ogm.map-layout-spec") ? spec : card;
  const ok = v(d);
  console.log(`${ok ? "ok  " : "FAIL"} schema  ${path.basename(f)}`);
  if (!ok) { fail++; console.log(JSON.stringify(v.errors, null, 1)); }
}

// 2. Code checks the schema cannot express (C3 "Checks code runs")
const byId = Object.fromEntries(Object.values(docs).filter((d) => d.id).map((d) => [d.id, d]));
const ORDER = { audience: ["private", "public"], redistribution: ["none", "in-build", "free"] };
const minOf = (k, a, b) => (ORDER[k].indexOf(a) <= ORDER[k].indexOf(b) ? a : b);
function effective(basis) {
  const lic = basis.filter((b) => b.type === "license" && b.confirmed_by);
  const ceiling = lic.length ? lic[0] : basis.find((b) => b.type === "default");
  if (!ceiling) throw new Error("no confirmed license and no default entry");
  let e = { uses: new Set(ceiling.uses), audience: ceiling.audience, redistribution: ceiling.redistribution };
  // An interpretation (admin reading of silent terms) adds uses only, never one the license forbids.
  // A license's prohibitions apply whether or not the entry is confirmed yet.
  const forbids = new Set(basis.filter((b) => b.type === "license").flatMap((l) => l.forbids || []));
  for (const i of basis.filter((b) => b.type === "interpretation")) {
    const banned = i.uses.filter((u) => forbids.has(u));
    if (banned.length) throw new Error(`interpretation adds forbidden use(s) ${banned}`);
    i.uses.forEach((u) => e.uses.add(u));
  }
  for (const d of basis.filter((b) => b.type === "decision")) {
    e.uses = new Set([...e.uses].filter((u) => d.uses.includes(u)));
    e.audience = minOf("audience", e.audience, d.audience);
    e.redistribution = minOf("redistribution", e.redistribution, d.redistribution);
  }
  return e;
}
function resolvedRights(d) {
  if (d.rights) return d.rights;
  const c = byId[d.collection];
  return c ? c.rights : null;
}
const check = (name, f, cond, msg) => {
  console.log(`${cond ? "ok  " : "FAIL"} ${name}  ${path.basename(f)}${cond ? "" : "  " + msg}`);
  if (!cond) fail++;
};
for (const [f, d] of Object.entries(docs)) {
  if (d.schema?.startsWith("ogm.asset-card")) {
    if (d.rights) {
      let e;
      try { e = effective(d.rights.basis); } catch (err) { check("rights=basis", f, false, err.message); continue; }
      const same = e.audience === d.rights.audience && e.redistribution === d.rights.redistribution &&
        e.uses.size === d.rights.uses.length && d.rights.uses.every((u) => e.uses.has(u));
      check("rights=basis", f, same, `effective ${JSON.stringify({ ...e, uses: [...e.uses] })}`);
    }
    const bad = Object.entries(d.provenance).filter(([k, p]) => k.startsWith("rights") && p.by === "model");
    check("no-model-rights", f, bad.length === 0, "model provenance on rights");
    const modelOutsideDescribe = Object.entries(d.provenance).filter(([k, p]) =>
      p.by === "model" && !(k.startsWith("describe") || /^(kit\.(open_edges|connects_to)|vfx\.blend|audio\.ucs_cat_id|subkind)$/.test(k)));
    check("model-writes-allowlist", f, modelOutsideDescribe.length === 0, JSON.stringify(modelOutsideDescribe.map((x) => x[0])));
    if (d.card_type === "asset") {
      const r = resolvedRights(d);
      if (byId[d.collection]) check("rights-resolvable", f, !!r, "no rights on card or collection");
      if (d.kind === "inspiration") {
        check("map-not-in-game", f, r && !r.uses.includes("in-game") && !r.uses.includes("placeholder"), "inspiration map allows in-game");
      }
    }
  } else if (d.schema?.startsWith("ogm.map-layout-spec")) {
    const src = byId[d.source.card_id];
    const r = src && resolvedRights(src);
    check("spec-source-allows-derive-layout", f, r && r.uses.includes("derive-layout"), "source lacks derive-layout");
    check("spec-linked-from-card", f, src && src.map?.layout_spec?.id === d.id, "card does not link this spec");
    // graph metrics
    const ids = new Set(d.rooms.map((r) => r.id));
    const internal = d.connections.filter((c) => typeof c.from === "string" && typeof c.to === "string");
    const nodes = new Set([...ids, ...(internal.some((c) => c.from === "outside" || c.to === "outside") ? ["outside"] : [])]);
    const parent = {}; const find = (x) => (parent[x] === undefined || parent[x] === x ? (parent[x] = x) : (parent[x] = find(parent[x])));
    internal.forEach((c) => { parent[find(c.from)] = find(c.to); });
    const comps = new Set([...nodes].map(find)).size;
    const loops = internal.length - nodes.size + comps;
    const deg = {}; d.connections.forEach((c) => { for (const e of [c.from, c.to]) if (typeof e === "string") deg[e] = (deg[e] || 0) + 1; });
    const deadEnds = [...ids].filter((i) => (deg[i] || 0) === 1).length;
    const area = (poly) => Math.abs(poly.reduce((s, [x, y], i) => { const [x2, y2] = poly[(i + 1) % poly.length]; return s + x * y2 - x2 * y; }, 0)) / 2;
    const areaOk = d.rooms.every((r) => r.area_cells === undefined || area(r.polygon) === r.area_cells);
    const total = d.rooms.reduce((s, r) => s + area(r.polygon), 0);
    const t = d.tags.computed;
    check("spec-loop-count", f, loops === t.loop_count, `computed ${loops}`);
    check("spec-dead-ends", f, deadEnds === t.dead_end_count, `computed ${deadEnds}`);
    check("spec-room-count", f, d.rooms.length === t.room_count && d.connections.length === t.connection_count, "");
    check("spec-areas", f, areaOk && total === t.total_area_cells, `total ${total}`);
    check("spec-secrets", f, d.connections.filter((c) => c.type === "secret-door").length === t.secret_count, "");
    check("spec-endpoints-exist", f, internal.every((c) => (ids.has(c.from) || c.from === "outside") && (ids.has(c.to) || c.to === "outside")), "");
  }
}
console.log(fail ? `\n${fail} failure(s)` : "\nall checks passed");
process.exit(fail ? 1 : 0);
