# OGM-005 plan — Filesystem blob store with signed URLs

## 1. Problem frame

V1 has no bucket: nothing S3-shaped runs here without sudo (E05-4, E11-8) and no money may be spent. The decided answer (D-BUCKET) is B6's `BlobStore` interface over a directory, content-addressed, with HMAC-signed GET URLs served by the API. This package is that interface plus the two things a directory does not give for free: safe writes (atomic, idempotent, streaming hash) and safe deletion (GC by explicit roots, never by age alone, because every tested build is kept per D-ARTIFACTS).

Requirements trace: R56 → filesystem-backed content-addressed `BlobStore` on this machine, HMAC-signed URLs served by the API, S3 adapter later, originals never moved.

## 2. Patterns to follow

- `/home/orangekid/games/open-game-maker-2000/docs/research/v0.4/B6-asset-storage-cdn.md` lines 246–258: the interface and key layout; copy, add `open` and typed `head`.
- `/home/orangekid/games/open-game-maker-2000/docs/plans/ogm-v1-build/evidence/T11-hosting-and-ops.md` §4 "Blob signed URL": the wire shape and `Cache-Control`; copy.
- `/home/orangekid/games/open-game-maker-2000/scripts/drive-sync/drive_sync.py` (download then rename into place, read-only files): the atomic-write habit; mirror in `fs-store.ts`.
- `/home/orangekid/games/open-game-maker-2000/scripts/maps/hash_manifest.py`: lowercase hex sha256, `sha256:` prefix convention.

## 3. Implementation units

### U1 `FsBlobStore`: put/head/open/delete

Goal: content-addressed, atomic, idempotent storage with a mime sidecar.

Files: Create `packages/blob-store/package.json`, `tsconfig.json`, `src/index.ts`, `src/fs-store.ts`. Test `test/fs-store.test.ts`.

Approach: `put` accepts `Uint8Array` or an async iterable; it pipes through `createHash('sha256')` into `<root>/tmp/<randomUUID>` with `fs.createWriteStream({ flags: 'wx', mode: 0o600 })`, then computes the hash, checks `blobPath` existence: if present, unlink the temp file and return the existing sidecar's ref (idempotent, first mime wins; if the caller's mime differs, return the stored one); else `mkdir -p blobs/sha256`, write `<hex>.json` to a temp name, `rename` the bytes then the sidecar (bytes first so a sidecar never points at nothing), `chmod 0o444` the blob. `head` reads the sidecar (null when absent). `open` returns `{ ref, stream: createReadStream }`. `delete` unlinks both files, ignoring `ENOENT`. All paths go through `blobPath(root, hash)` which validates `^sha256:[0-9a-f]{64}$` (throws `BadHash` otherwise), so no caller-controlled path segment ever reaches the filesystem.

Interface sketch: the ticket's contract block (`BlobStore`, `FsBlobStore`, `blobPath`).

Test scenarios:
- Property: for arbitrary `Uint8Array` (fast-check `fc.uint8Array({maxLength: 4096})`), `put` twice returns deep-equal refs, `hash` equals `'sha256:' + createHash('sha256').update(bytes).digest('hex')`, `bytes` equals length, and exactly two files exist under `blobs/sha256/` afterwards.
- Given two concurrent `put` calls with the same bytes, when both resolve, then one blob file exists and `tmp/` is empty.
- Given a stream that throws midway, when `put` rejects, then `blobs/sha256/` has no new file and `tmp/` is empty (the temp file is unlinked in `finally`).
- Given `head('sha256:' + 'f'.repeat(64))` on an empty store, then `null`.
- Given `blobPath(root, 'sha256:../../x')`, then it throws `BadHash`.
- Given `put(bytes, 'image/webp')` then `put(bytes, 'application/octet-stream')`, then the second ref's mime is `image/webp`.

Execution note: write the property test first; it fails until the hash and idempotence are right.

### U2 Signing and expiry

Goal: deterministic day-rounded expiry and a constant-time signature check.

Files: Create `src/sign.ts`. Test `test/sign.test.ts`.

Approach: `roundExpiry(d)`: `const day = 86400; const next = Math.ceil((d.getTime()/1000 + 1) / day) * day; return next + day;` (next UTC midnight strictly after `d`, plus 24 h, T11 §4). `signBlobUrl(key, hash, exp)`: `createHmac('sha256', key).update(`${hash}\n${exp}`).digest('hex')`. `verifySignedGet(key, {hash, exp, sig}, nowMs = Date.now())`: validate hash shape (`bad-hash`), `exp` integer and `exp * 1000 > nowMs` (`expired`), recompute and `timingSafeEqual(Buffer.from(sig,'hex'), Buffer.from(expected,'hex'))` only when lengths match (`bad-signature`). `FsBlobStore.signedGet(hash, expiresAt)` returns `{ url: `${publicOrigin}${pathPrefix}/sha256/${hex}?exp=${exp}&sig=${sig}`, expiresAt: new Date(exp*1000).toISOString() }` without checking existence (the handler 404s).

Test scenarios:
- Property: for arbitrary dates in 2026–2030, `roundExpiry(d)` is a multiple of 86400, greater than `d` by at least 24 h and at most 48 h, and monotone non-decreasing in `d`.
- Property: for arbitrary keys (≥16 chars) and hashes, `verifySignedGet` accepts the signature it minted and rejects any sig with one hex character replaced (`bad-signature`).
- Given `exp` one second in the past, then `expired`; given `sig` of odd length, then `bad-signature` without throwing.
- Given the same `(key, hash, exp)`, when signed twice, then the signatures are identical (URLs are cacheable per day).

### U3 Request parsing and the serve handler

Goal: one function the API route calls; it returns status, headers and a stream, framework-free.

Files: Create `src/serve.ts`. Test `test/serve.test.ts`.

Approach: `parseBlobRequest(url, prefix='/blobs')` matches `${prefix}/sha256/([0-9a-f]{64})` and reads `exp` (integer) and `sig`; returns null on any mismatch. `serveBlob(store, key, url, nowMs)`: parse → 404 when null; verify → 403 with `{ 'Cache-Control': 'no-store' }` on failure; `store.open` → 404 when null; else 200 with `Content-Type: ref.mime`, `Content-Length: ref.bytes`, `Cache-Control: public, max-age=31536000, immutable`, `ETag: "<hex>"`, `X-Content-Type-Options: nosniff`, `Content-Disposition: inline`, and the stream. The handler never sets cookies and never reads them.

Interface sketch: `serveBlob` as in the ticket. Example API mount (for the consumer, not written here): `app.get('/blobs/*', async c => { const r = await serveBlob(store, key, new URL(c.req.url)); return new Response(r.stream ? Readable.toWeb(r.stream) : null, { status: r.status, headers: r.headers }) })`.

Test scenarios:
- Given a stored blob and a URL from `signedGet`, when `serveBlob` runs, then 200 with the five headers and the streamed bytes equal the stored bytes.
- Given the URL with `sig` altered, then 403 and no stream; with `exp` expired, 403; with an unknown hash and a valid signature, 404.
- Given `/blobs/sha256/<hex>` without query, then 404 (parse fails).
- Given a prefix mismatch (`/x/sha256/...`), then 404.

### U4 GC and the CLI

Goal: delete only unreferenced, old blobs; dry-run by default in the CLI.

Files: Create `src/gc.ts`, `bin/ogm-blob-gc.mjs`. Test `test/gc.test.ts`.

Approach: `gc(store, roots, {graceMs, nowMs, dryRun})`: load roots into a `Set<BlobHash>` (accept sync or async iterables; validate shape); walk `blobs/sha256/` entries that are bytes files (skip `.json`), `stat` each, and for hashes not in the set with `mtimeMs < nowMs - graceMs` call `store.delete` unless `dryRun`; also unlink `tmp/*` older than the grace; return counts. `ogm-blob-gc.mjs`: `--root DIR --roots FILE [--grace-days 30] [--apply]`; roots file is one `sha256:<hex>` per line (`#` comments allowed); prints the summary; without `--apply` it is a dry run. It takes no signing key.

Interface sketch:

```
ogm-blob-gc --root DIR --roots FILE [--grace-days 30] [--apply]
# roots file: one sha256:<hex> per line, '#' comments; prints {"scanned","kept","deleted","dryRun"}; exit 1 on a malformed roots line
```

Test scenarios:
- Property: for random sets of blobs partitioned into roots/non-roots and random ages, after `gc` every root still exists, every non-root older than the grace is gone, every non-root younger than the grace exists, and `deleted` lists exactly the removed hashes.
- Given the CLI without `--apply`, when run against a root with one deletable blob, then the summary shows `deleted: 1, dryRun: true` and the file still exists; with `--apply` it is gone.
- Given a roots file containing a line `sha256:xyz`, when the CLI runs with `--apply`, then exit 1 and no file was deleted (validation precedes the walk).
- Given `dryRun: true`, then `deleted` is non-empty but every file still exists.
- Given a roots line with bad shape, then `gc` throws before deleting anything.
- Given a stale `tmp/` file older than the grace, then it is removed; a fresh one is kept.

## 4. Verification

```
pnpm --filter @ogm/blob-store test
pnpm --filter @ogm/blob-store typecheck && pnpm --filter @ogm/blob-store lint
tmp=$(mktemp -d) && node -e "
const {FsBlobStore,serveBlob}=await import('./packages/blob-store/dist/index.js');
const s=new FsBlobStore({root:'$tmp',signingKey:'k'.repeat(32),publicOrigin:'https://example.test:8443'});
const r=await s.put(new TextEncoder().encode('hello'),'text/plain');
const g=await s.signedGet(r.hash,new Date());
const res=await serveBlob(s,'k'.repeat(32),new URL(g.url)); console.log(r.hash, g.url.replace(/sig=.*/,'sig=…'), res.status, res.headers['Cache-Control']);"
```

Paste into `## Local tests`: the Vitest summary with the fast-check run counts, and the one-liner's output (`sha256:2cf24d…`, the URL, `200`, the immutable cache header).

## 5. Deferred to implementation

- Grace default for the CLI: default 30 days (T11 row 4).
- `put` for very large files (build artifacts): streaming is required; default no size cap in the library (callers cap).
- `open` returning a Node stream vs web stream: default Node stream (`Readable.toWeb` at the Hono seam).
- Blob file mode: default `0444` (immutable by convention; `delete` chmods before unlink if needed).

## 6. Scope boundaries

- API route, auth before minting signed URLs: OGM-010 / first consumer. Ingress for `/blobs`: OGM-006.
- Import of `assets-local/`, previews, tiers, lockfile: OGM-063/064/062. Roots lists: OGM-045/080/067.
- Backups of the root: OGM-008. S3 adapter: deferred.

## 7. Risks

- A consumer forgetting to pass roots deletes build artifacts: the CLI is dry-run by default and `gc` requires a roots argument (no overload without it).
- Day-rounded expiry makes a leaked URL valid up to 48 h: accepted in B6 §4 for a family instance; drafts are private by sign-in, not by URL secrecy.
- Hash collisions between vendors' files and tier-3 assets: content addressing makes identical bytes one blob by design; provenance lives in cards (OGM-060), not here.
- `fast-check` is a new dev dependency (>4k stars): meets the rule; pinned exact.
