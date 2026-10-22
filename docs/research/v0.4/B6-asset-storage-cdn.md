# B6 — Asset source of truth, CDN timing, and retained narration (U06 / R21)

- **Source requirement:** spec v0.4 §9.4–9.7, §12.3, §14.1 U06, §7.7, §7.8, §5.2, §5.17, §5.20, §10.7.
- **Prior inputs:** A7 (topology, private-vs-public meanings, leakage vectors), A5 (immutable `Build` with `assetManifest`, release pointer, retention proposal), A6 (narration keyed by `hash(text, voice, model, settings)`).
- **Primary sources accessed:** 2026-10-21 (listed at the end).
- **Evidence labels:** **[V]** verified against a primary source today; **[I]** inferred from verified facts; **[U]** unverified, an assumption, or a third-party figure.
- **Scope:** research only. Nothing was bought, signed up for, or deployed.

## 1. TL;DR

- Keep code and a small asset manifest in Git. Store every binary asset (images, models, audio, narration) in one S3-compatible bucket, keyed by content hash. Do not use Git LFS.
- At family scale the storage cost is trivial: about $0–2 a month even at 1,000 games. The real costs are delivery bandwidth through the wrong host (Netlify or a Railway service proxy) and child-privacy leaks. Neither is storage price.
- **V1 ships basic delivery, not a configurable CDN.** That means immutable hash keys and backend-issued signed URLs for everything. Browser caching does the rest. Cloudflare-fronted public delivery is a V2 switch over the same keys.
- The bucket is the origin. A CDN is a cache. A nightly copy to a second bucket is the backup. Cached copies are not a backup.
- **Narration identity** is the hash of a canonical JSON of (normalized text, language, provider, model plus version, voice, delivery settings, output format, take). An unchanged line is never regenerated. Releases and forks carry the keys and reuse the same audio.
- Every asset records its license and whether it may be redistributed. That record decides what a public source export or a fork may carry. Moving an asset into a bucket does not make it private.

## 2. Volume estimate

All per-asset sizes are **[U] planning assumptions**, not measurements. They should be replaced by measurements from the first ten real games.

| Asset class | Light 2D arcade | Typical mixed | Heavy RPG / low-poly 3D | Size assumption |
|---|---|---|---|---|
| Sprites, UI, tiles (WebP/PNG) | 50 × 15 KB | 150 × 25 KB | 300 × 30 KB | Small pixel or vector art |
| glTF/GLB models | 0 | 10 × 150 KB | 60 × 300 KB | Low-poly, mostly untextured |
| Textures | 5 × 100 KB | 15 × 300 KB | 40 × 500 KB | 512–1024 px, compressed |
| Music | Pattern data in Git (KB) | 4 rendered tracks × 2 MB | 8 × 3 MB | Only if rendered to OGG/Opus |
| SFX | 20 × 20 KB | 40 × 25 KB | 60 × 30 KB | Short OGG |
| Narrated dialogue lines | 0–30 | 200 | 1,500 | ~80 characters, ~5 s, Opus about 32 kbps, so ~25 KB per line |
| Child uploads (derived only) | 0–3 × 200 KB | 5 × 200 KB | 10 × 200 KB | Re-encoded, EXIF stripped |
| **Live set, one release** | **≈2 MB** | **≈20 MB** | **≈100 MB** | |
| **Lifetime incl. versions and rejected generations** | **≈5 MB** | **≈60 MB** | **≈300 MB** | ×2–3 multiplier [U] |

The narration volume is the main driver for RPGs:

- **Storage:** 1,500 lines × 25 KB is about 38 MB per take.
- **Generation cost:** 1,500 × 80 characters is 120k characters per full voicing. At an assumed $15–30 per 1M characters [U; Google and OpenAI list prices not confirmed today, and ElevenLabs is blocked per A6], one full voicing costs about **$2–4**.
- **Retained audio pays for itself.** Retained audio makes the cost per play zero (A6 H5). One accidental "regenerate everything on every build" policy would cost more than years of storage.

**Projection** (blend of 50% light, 40% typical, 10% heavy, so about 55 MB lifetime per game; round up to **100 MB** to allow for growth):

| Games | Stored, lifetime | First-load delivery per month [U: 30 loads/game/month × 30 MB] |
|---|---|---|
| 10 | ~1 GB | ~9 GB |
| 100 | ~10 GB | ~90 GB |
| 1,000 | ~100 GB | ~900 GB |

## 3. Options compared, with costs

### Platform facts

**GitHub and Git LFS**

- GitHub warns on files over 50 MiB and blocks files over 100 MiB. It recommends keeping repositories under 1 GB, and strongly recommends under 5 GB [V].
- LFS on Free and Free-for-orgs plans includes 10 GiB of storage and 10 GiB of bandwidth a month [V]. Overage costs $0.07 per GiB-month for storage and $0.0875 per GiB downloaded [V via search of GitHub docs].
- A $0 budget blocks LFS for the rest of the month [V].
- "Forking and pulling a repository counts against the parent repository's bandwidth usage" [V]. Every clone of a public repo therefore draws on Kevin's quota [I].
- GitHub Release assets have no limit on total size or bandwidth [V].

**Cloudflare R2**

- Standard storage is $0.015 per GB-month. Class A operations are $4.50 per million and Class B $0.36 per million. Egress is free. The free tier is 10 GB-month, 1M Class A and 10M Class B [V].
- Durability is eleven nines. Durability does not protect against deletion, so Cloudflare points to bucket locks for that [V].
- The `r2.dev` URL is rate-limited and meant for development only. Production public access needs a custom domain whose zone is on Cloudflare, and that domain can use Cloudflare Cache, WAF and Access [V].
- **Presigned URLs work only on the S3 endpoint, not on custom domains.** Authenticated delivery through the cache needs either WAF HMAC token auth (Pro plan or higher) or a Worker [V].

**Cloudflare CDN**

- The cache caps cacheable files at 512 MB on Free, Pro and Business plans [V].
- By default it caches .png, .webp, .mp3 and .ogg, but **not .glb, .gltf, .json or HTML** [V]. Those need a Cache Rule [V].

**Railway Storage Buckets**

- Buckets are S3-compatible and run on Tigris [V].
- Storage is $0.015 per GB-month. S3 operations and bucket egress are free and unlimited. Service egress is billed [V]. Per A7, service egress is $0.05 per GB.
- Buckets are **private-only, with no public buckets**. Files are served through presigned URLs or a proxy [V].
- **There is no versioning, no object lock, no lifecycle rules and no backups.** A deleted bucket can be restored for 52 hours [V].
- Plan limits: Hobby is capped at 1 TB and Pro is unlimited [V].
- Buckets are reachable only over the public network [V].

**Netlify (credit plans)**

- Bandwidth costs 20 credits per GB and each production deploy costs 15 credits [V].
- Plans: Free has 300 credits as a hard cap, Personal is $9 for 1,000 credits, and Pro is $20 for 3,000 credits up to $126 for 20,000 [V].
- That works out to roughly **$0.13–0.18 per GB** [I].

**Backblaze B2**

- Storage is $6.95 per TB-month, with free egress up to 3× the data stored [V].

### Options

| | A. Plain Git | B. Git LFS | C. Hybrid (data in Git, binaries in bucket plus manifest) | D. Object-storage-first (everything but code in bucket) |
|---|---|---|---|---|
| 10 games | Workable (~1 GB, near guidance) | $0 | ~$0 | ~$0 |
| 100 games | ~10 GB, over the 5 GB guidance [I]; every clone and sandbox checkout pulls all history | Storage at the free limit; sandbox and fork pulls exceed 10 GiB of bandwidth → ~$3–10/mo [I] | R2 $0 (free tier) / Railway $0.15/mo | Same as C |
| 1,000 games | Infeasible: history never shrinks | ~$6.30/mo storage plus bandwidth billed to Kevin for every clone or fork | R2 ~$1.35/mo / Railway ~$1.50/mo, plus B2 backup ~$0.70 | Same |
| Deletion / child-data erasure | Requires rewriting history; forks and clones keep it | Same, and LFS objects linger | Delete the blob; the manifest keeps a tombstone | Same |
| Reproducible release | Commit SHA | Commit SHA | Commit SHA plus a manifest of hashes (immutable keys) | Needs a versioned manifest outside Git, which is weaker |
| Sandbox build cost | Full checkout | LFS smudge, billed bandwidth | Fetch only the hashes the build needs | Same |
| Readable source / diffs | Yes | Yes | Yes: level JSON, music patterns and dialogue text stay in Git | Dialogue and design data leave Git, so diffs and reviews get worse |

**Delivery cost** for the volumes in section 2 (9 / 90 / 900 GB a month):

| Delivery path | Cost per month at 9 / 90 / 900 GB | Notes |
|---|---|---|
| Netlify | 180 / 1,800 / 18,000 credits, roughly 60% of Free / Pro $20 / Pro $126 [I] | |
| Railway service proxy | $0.45 / $4.50 / $45 [I] | |
| Railway bucket via presigned URL | $0 [V] | |
| R2 via custom domain and cache | $0 egress [V] | Class B operations on cache misses only, well inside 10M [I] |

**Conclusion.** Option C wins.

- Option A is acceptable only as a throwaway for the first handful of games, and migrating off it later means rewriting history (which is also a privacy problem).
- Option B adds cost and quota risk that every fork and clone triggers, and it has no deletion story.
- Option D gives up readable design data for no gain.
- Media should not be served from Netlify or through a Railway service. Netlify should serve the host UI only.

### Origin vs. CDN vs. backup

| Role | V1 | V2 |
|---|---|---|
| Canonical origin | One S3-compatible bucket (`blobs/sha256/<hash>`), written once and never overwritten | Same keys; optionally moved to R2 |
| Index | Postgres `asset` rows, plus `assets.manifest.json` in Git per game | Same |
| Delivery | Signed GET URLs straight from the bucket; `Cache-Control: public, max-age=31536000, immutable` set at upload [U: Railway/Tigris honoring stored Cache-Control is unverified] | Cloudflare custom domain over R2 for public/published blobs; a Cache Rule for glb/gltf/json |
| Backup | Nightly copy (rclone) of new blobs to a second bucket under another account (B2 or R2), plus Postgres backups | Add R2 bucket locks if R2 is the origin |
| Recovery | Narration and procedural assets can be regenerated (at a cost); uploads and hand-picked generations cannot. The backup exists for those | Same |

**Cloudflare's roles.** R2 is the writable store. The Cloudflare CDN is only a cache in front of a hostname. It is never the source of truth. Railway has no CDN for buckets [V: none documented].

## 4. Access and privacy model

Spec v0.4 sets the frame for this section:

- Hosted play always needs authentication.
- Private means hidden from discovery only.
- Game source is meant to be open and forkable.
- Child data must never leak through that openness.

Assets therefore carry two independent fields:

- `visibility`: `private` or `published`.
- `redistributable`: true or false, derived from the license and origin.

| Case | Storage | URL issued | What leaks if the URL is shared |
|---|---|---|---|
| Draft or preview assets | private prefix | Signed, ≤24 h, only after `canView(user, game, build)` | That one file, until it expires |
| Invite-only published game | V1: same as drafts. V2: public immutable only if `redistributable` | V1 signed / V2 hash URL | V1: one file for ≤24 h. V2: that file permanently, but it is unguessable (SHA-256) and already listed in public source if the repo is public [I] |
| Private-in-discovery game | Same as invite-only; hiding is an index concern (A7 P1) | Same | Same, plus nothing about the title or owner (keys are hashes, not slugs) |
| Child upload | Original deleted after preprocessing (EXIF and GPS stripped, re-encoded). Only the derived asset is kept, `private`, `redistributable=false` until a guardian approves publishing | Signed only | The derived image for ≤24 h. **Never public in V1** |
| Public licensed library asset (CC0/CC-BY) | Shared blob, `redistributable=true` | Signed (V1) or public (V2) | Nothing private |
| Fork | Copies manifest entries by reference (same hash); new game ID | Per the fork's own access | None beyond the fork. Private originals and unpublished drafts never get copied (§5.17) |

**Rules:**

- **Opaque keys.** No game, child or file names appear in object keys, so a shared URL reveals nothing about who made what.
- **No bucket listing.** List permission is never granted to clients.
- **Cache-friendly signing.** A signature that changes on every request defeats browser caching, because caches key on the full URL [I]. To avoid this, the backend signs with an expiry rounded to a fixed window, such as the next UTC midnight plus 24 h. Then a day's URLs stay identical and cacheable.
- **Erasure.** A guardian deletion request hard-deletes the blob, even when forks reference it. The manifests keep a tombstone so the game renders a placeholder. Erasure beats fork integrity.
- **Garbage collection.** Unreferenced blobs, meaning those not reachable from any game manifest, retained release or narration-cache row, are collected after a 30-day grace period [proposal]. Retained releases follow A5's proposal: current, the two previous, and anything under 14 days old.

## 5. Narration reuse scheme

**Two identities:**

- **Input key:** the narration request. It decides whether a line needs generating.
- **Content hash:** the audio blob. It decides where the audio is stored and handles dedupe.

```ts
type NarrationSpec = {
  v: 1;                         // bump this to deliberately change the key format
  text: string;                 // NFC-normalized, whitespace-collapsed, SSML/markup included verbatim
  lang: string;                 // BCP-47
  provider: string; model: string; modelVersion: string; // pinned snapshot, not "latest"
  voiceId: string;
  delivery: Record<string, string | number>; // speed, pitch, style/emotion, instructions; sorted keys
  format: { codec: 'opus'; bitrateKbps: number; sampleRate: number };
  take: number;                 // 0 by default; "regenerate this line" increments it
};
narrationKey = 'nk1:' + sha256(canonicalJson(spec))   // RFC 8785 JCS-style canonical JSON

// Postgres: narration_cache(scope_id, narration_key) -> {
//   audio: AssetRef, alignment?: AssetRef /* word/char timings JSON */,
//   chars, cost_basis, created_at, provider_terms_ref }
```

**Regeneration rules:**

- A change to the text, voice, delivery, format or take produces a new key, so the line is generated.
- Anything else is a cache hit. Edits to other lines regenerate only the lines that changed.
- A provider shipping a new model does **not** change existing keys, because `modelVersion` is pinned per game. Upgrading the voice for the whole game is an explicit creator action, with its cost shown before it runs.
- A provider deprecating a model leaves stored audio valid. Only new or changed lines are affected.

**Lifecycle:**

- **Builds and releases.** Each build's manifest lists, per line, `{lineId, narrationKey, audio hash}`. Publishing freezes that list.
- **Rollback.** Rollback republishes an older manifest, so its audio is reused as-is. If the old blobs were garbage-collected, the keys allow regeneration, with a warning that the voice may differ, because TTS output is not deterministic [I].
- **Forks.** A fork copies manifest references, so the audio is shared and there is no new generation. The fork's later edits produce new keys under its own scope.
- **Cache scope.** The cache is scoped per family (`scope_id`), not global. A global cache would reveal through hit/miss timing or cost that some other family once voiced a given string [I].
- **Cross-family reuse** happens only through forks of published games, which hold the published release's lines and audio, not drafts.
- **Privacy.** Narration is generated game content. It is not conversational input. Raw microphone audio and scoping transcripts never enter this table (§9.7).
- **Pre-publish lint.** The A7 lint that catches children's names in dialogue applies to narration text before publish.

## 6. Recommendation

### V1 minimum

1. **Storage layout.** A single S3-compatible bucket with write-once `blobs/sha256/<hex>` keys, a private prefix for everything, and Postgres `asset` and `narration_cache` tables.
2. **Manifest in Git.** `games/<id>/assets.manifest.json` lives in Git, while bytes never do. Design data stays in Git as text: levels, music patterns, dialogue scripts, small SVGs.
3. **Commit-service check.** The commit service rejects binary media files and any file over 256 KB under `games/**` (a proposed threshold).
4. **Delivery.** Signed GET URLs issued by the API after an authorization check, with day-rounded expiry and immutable Cache-Control. No CDN product.
5. **Sandbox uploads.** Builds upload new blobs through the worker. They are never given bucket credentials.
6. **Backup.** A nightly copy of new blobs to a second account, and a restore drill once.
7. **Narration.** Narration keys and cache as specified in section 5.

### V2 path (each step is triggered by evidence, not scheduled)

1. Move the origin to R2, or put R2 alongside the existing bucket, and serve **published, redistributable** blobs through a Cloudflare custom domain. Trigger: first-load latency complaints, sharing beyond the family, or measured delivery bandwidth.
   - This needs no manifest change, because keys are hashes.
   - The move is a one-time copy, using `rclone sync` or R2 Super Slurper [U: not re-checked today].
2. Keep signed URLs for drafts and uploads. Add WAF HMAC auth or a Worker only if authenticated content must also be served from the edge.
3. Add an Infrequent Access tier or lifecycle rules for blobs of old releases, plus R2 bucket locks for uploads.
4. Add a public "export source" step that bundles redistributable assets as a GitHub Release asset, which carries no bandwidth limit [V]. It adds a `fetch-assets` script that resolves manifest hashes from the public URL, and lists non-redistributable assets as missing with placeholders.

### Required V1 interfaces (one implementation, no provider abstraction)

```ts
type AssetRef = { hash: `sha256:${string}`; bytes: number; mime: string };
type ManifestEntry = {
  id: string;                      // logical path used by game code, e.g. "sprites/hero.webp"
  ref: AssetRef;
  kind: 'image'|'model'|'texture'|'music'|'sfx'|'narration'|'upload';
  origin: 'generated'|'library'|'upload'|'authored';
  license: { spdx?: string; terms?: string; attribution?: string };
  redistributable: boolean;
  visibility: 'private'|'published';
  provenance?: { tool?: string; model?: string; sourceGameId?: string };
  narration?: { lineId: string; key: string };
};
interface BlobStore {              // single S3 client; endpoint/bucket/keys from env
  put(bytes: Uint8Array, mime: string): Promise<AssetRef>;   // HEAD-then-PUT, idempotent
  head(hash: string): Promise<boolean>;
  signedGet(hash: string, expiresAt: Date): Promise<string>;
  delete(hash: string): Promise<void>;                       // GC and erasure only
}
// API: GET /games/:id/builds/:buildId/assets -> { [entryId]: url } after authz
```

Environment configuration (§9.5) needs only four variables: `ASSET_S3_ENDPOINT`, `ASSET_BUCKET`, credentials, and an optional `ASSET_PUBLIC_BASE_URL`. The public base URL is unset in V1 and points at the CDN hostname in V2.

**Does basic CDN delivery ship in V1? No.**

- Immutable hash keys plus signed direct-from-bucket URLs already give free egress and browser caching at family scale.
- An authenticated CDN costs extra: a Cloudflare zone, plus either the Pro plan for HMAC tokens or a Worker.
- Without that authentication, a CDN conflicts with the rule that hosted play requires authentication.
- The V1 design keeps CDN as a configuration flip, which honors "first-class" without shipping it early.

## 7. Decisions for Kevin

**D1. Which bucket is the V1 origin?**

- (a) Railway bucket: one vendor, free egress and operations, private-only, no versioning.
- (b) Cloudflare R2: second vendor plus a domain zone on Cloudflare; gains bucket locks and the CDN path.
- (c) AWS S3: not recommended, because egress costs money [U].

**Recommended: (a).** Railway is already the backend vendor, and its private-only buckets with presigned URLs fit V1's auth-everything model exactly. *Consequence:* the backup copy is mandatory because Railway has no versioning, and V2 public CDN means copying to R2, which is cheap because keys are hashes.

**D2. Do invite-only published games eventually get public, unguessable hash URLs (V2 CDN), or stay signed forever?**

- (a) Public for redistributable published assets.
- (b) Always signed.

**Recommended: (a).** The assets are already in public source, and edge caching needs it. *Consequence:* anyone holding a link keeps that one file permanently. That is acceptable only because uploads and drafts are excluded.

**D3. When a guardian deletes a child upload that forks reuse, does erasure override forks?**

- (a) Yes: forks get a placeholder.
- (b) No: forks keep a copy.

**Recommended: (a).** Child-data erasure has to be real. *Consequence:* forks can visibly break, and the UI must explain it.

## 8. Uncertainty

- Every volume and size figure is assumed. Measure the first 10 games, especially narration lines per RPG and how many rejected generations are kept.
- TTS price per character is not verified. The provider is still undecided (U02).
- Not verified: whether Railway/Tigris stores and returns `Cache-Control` on objects; Railway presigned-URL maximum expiry; Railway bucket durability figures.
- The LFS overage prices came from a search summary of GitHub docs, not a direct page read.
- The Netlify credit-to-dollar conversion is inferred from plan prices.
- Whether the games repository is public (§9.2) is still open. It changes how much a public hash URL reveals, but not the V1 design.
- Not verified: R2 object versioning (no doc found today) and Super Slurper/Sippy details.

### Sources (accessed 2026-10-21)

- Cloudflare: [R2 pricing](https://developers.cloudflare.com/r2/pricing/), [Public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/), [Presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/), [Durability](https://developers.cloudflare.com/r2/reference/durability/), [Bucket locks](https://developers.cloudflare.com/r2/buckets/bucket-locks/), [Default cache behavior](https://developers.cloudflare.com/cache/concepts/default-cache-behavior/)
- Railway: [Storage Buckets](https://docs.railway.com/storage-buckets), [Bucket billing](https://docs.railway.com/storage-buckets/billing)
- GitHub: [Large files](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github), [About Git LFS](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-git-large-file-storage), [Git LFS billing](https://docs.github.com/en/billing/concepts/product-billing/git-lfs)
- Netlify: [Credit-based plans](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/)
- Backblaze: [B2 pricing](https://www.backblaze.com/cloud-storage/pricing)
