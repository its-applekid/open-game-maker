# B5 — V1 generative toolchain: 2D sprites, low-poly 3D, music, SFX, image upload (U05 / R16)

> **Scope note (2026-10-22):** Open Game Maker 2000 is a general, all-ages game maker. Parental controls apply only to child accounts, and under-18 vendor routing applies to teens. Where this report applies a child rule product-wide, B9 (legal) and B10 (product, incl. §8) rescope it.

Research spike B5, v0.4 pass. All sources accessed **2026-10-21**. Markers: **[V]** = the claim was read today on the primary page, license file or `gh api`. **[I]** = inferred from verified facts. **[U]** = unverified (secondary source, page not reachable, or recalled). This is research, not legal advice, and it authorizes no spending.

Inputs: spec v0.4 §5.3, §5.13, §9.6, §10.7, §11.1, §12, §14.1 U05; v0.3 A2, A3 and A8; the editor mockups. The racetrack mockup is chunky, flat-shaded, vertex-coloured low-poly in the same family as the Kenney and KayKit kits. The dungeon mockup is cute, stylized and toy-like.

---

## 1. TL;DR

- **Most of V1's art and audio can be made with no outside vendor.** The agent kit-bashes CC0 packs (Kenney, KayKit, Quaternius), builds custom low-poly props as Three.js code, composes music as data played through Tone.js with VCSL samples, and writes SFX as ZzFX/jsfxr parameters. That covers the mockups' look and keeps child data in-house.
- **Paid generation is a layer on top for things the agent cannot build.** For 2D, the best-fit vendor is OpenAI gpt-image (you own the output, no training by default, ZDR eligible, about $0.005–0.05 per image). For rigged 3D characters it is Meshy on a paid plan (about $0.40–0.60 per model plus $0.06–0.10 to rig). Both should receive agent-written prompts only.
- **A photo of a child's drawing stays on our own infrastructure in V1.** The pipeline is: crop and strip EXIF in the browser, remove the background with rembg/BiRefNet on our worker, quantize to the game palette, then use the result as a sprite, a "paper cutout" or an extruded 3D shape. Sending it to a restyling vendor needs OpenAI ZDR approval plus separate parental consent.
- **Several vendors are out on their terms:** Google (Gemini, Nano Banana, Lyria), fal.ai, ElevenLabs (unless it approves in writing), Suno and Udio (no API, and personal-use or no-download terms), MusicGen (non-commercial), TRELLIS.2 (its GLB export needs non-commercial nvdiffrast), Hunyuan3D (unlicensed in the EU, UK and South Korea), and BRIA RMBG (non-commercial).
- **Self-hosted open models are licence-clean but all need a GPU.** These are ACE-Step 1.5 (MIT), FLUX.2 [klein] 4B and FLUX.1 [schnell] (Apache-2.0), and SF3D/SPAR3D (Stability Community License). Hosting them is Kevin's call, and V1 does not need them.
- **Every generated asset is post-processed and logged.** Each one gets palette quantization, a poly budget, and a provenance record stating vendor, model, prompt hash and licence. A raw child prompt never reaches a generator.

---

## 2. Findings by category

### 2.1 Child-data eligibility: two different gates

Vendor feasibility depends on two separate questions:

1. **Does the input contain child personal information?** A photo of a drawing can (COPPA §312.2 covers a "photograph … where such file contains a child's image", plus handwriting or names on the paper) [V, A8 V11]. A recorded child voice does. An agent-written prompt built from a scrubbed design brief ("a cute low-poly red race car, flat colours") does not [I].
2. **Does the vendor ban services used by minors, whatever the input?** Some do:
   - Google's Gemini API: "will not use the Services as part of a … service that is directed towards or is likely to be accessed by individuals under the age of 18". This covers Nano Banana and Lyria [V, https://ai.google.dev/gemini-api/terms].
   - fal.ai: "your End Users are at least 18" [V, https://fal.ai/terms].
   - ElevenLabs: "experiences directed at individuals under 18 are prohibited unless we have assessed and approved them in writing" [V, https://elevenlabs.io/use-policy].
   - Agent-only prompts **do not get around** these clauses, because the generated asset still ends up in a child-used product [I].

Vendors that pass the second gate with an adult (Kevin) as account holder include:
- OpenAI. Its services agreement says not to "allow minors to use OpenAI Services without consent from their parent or guardian" [V, OSA §3.3(c), https://cdn.openai.com/osa/openai-services-agreement.pdf]. Under-13 personal data needs ZDR first [V, https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance].
- Recraft: developers must be 18+, and no end-user age is stated [V, https://www.recraft.ai/legal/developer-terms].
- Stability: account holder 18+ for image services, 13+ for audio [V, https://stability.ai/terms-of-service].
- Meshy: minimum age 14, parental permission under 18 [V].
- Rodin: 18+ or parental permission [V].
- PixelLab: no age clause [V, absent].

None of these four checks amounts to an "approved for a child-facing service" statement. Treat them as **adult-operated, agent-prompt-only** inputs [I].

### 2.2 2D sprites and backgrounds

| Tool | Price (per image, ~1024²) | Output rights / training | Child gate | Fit |
|---|---|---|---|---|
| **OpenAI gpt-image** (1-mini, 1.5, 2, 2.5) | 1-mini $0.005 / $0.011 / $0.036 (low / med / high); gpt-image-2 $0.006 / $0.053 / $0.211 [V, https://developers.openai.com/api/docs/guides/image-generation] | "Customer … owns all Output" (OSA §4.1); no training by default; `/v1/images/generations` and `/edits` are ZDR-eligible with limits [V, https://developers.openai.com/api/docs/guides/your-data] | Best available; ZDR needs approval | Transparent PNG via `background:"transparent"` [V]; edits with a reference image help keep a character consistent [V]. Strong for cute/cartoon; real pixel art drifts off-grid [I, A2] |
| **Recraft** V4.1 | raster $0.035, Flash $0.007, vector (SVG) $0.08 [V, https://www.recraft.ai/docs/api-reference/pricing] | "You own all Assets"; API assets not used for training; whether inputs are used is unstated [V] | 18+ developer | SVG output fits flat UI and icons; good fallback |
| **PixelLab** | 4-direction 64 px character $0.012; 8 rotations $0.03; 4-frame animation $0.016 [V, https://www.pixellab.ai/pixellab-api] | You own the output; no training "without notifying" [V] | No age clause | The only checked tool that makes multi-direction animated pixel sprite sheets. Small vendor, below the maturity bar [I] |
| **Retro Diffusion** | $0.03–0.18 per image; animation $0.07 [V, GitHub api-examples README] | "yours to use for personal or commercial projects" [V]; terms page unreadable (JavaScript-rendered) [U] | Unknown | True grid-locked pixel art; hold until its terms are read |
| **Stability** Core / Ultra | $0.03 / $0.08 [V, https://docs.stability.ai/pricing] | Trains on inputs and outputs **by default**, with an opt-out [V] | 18+ account | No advantage over OpenAI |
| Google Nano Banana / Imagen | $0.034–0.134 [V] | — | **Prohibited** | Excluded |
| fal.ai, Replicate | — | Replicate: "NOT SUITABLE FOR CHILDREN" [V] | **Prohibited** / parent bears liability | Excluded |
| Self-hosted **FLUX.2 [klein] 4B** / **FLUX.1 [schnell]** | GPU time | Apache-2.0 [V, HF tags + flux2 README]; klein 4B "fits in ~8GB VRAM" [V] | No vendor | Only route for child-drawing restyling without a third party. FLUX.1 [dev] and klein 9B are **non-commercial** [V] |

**Consistency and style lock.** Every game gets a style card covering palette, resolution and filter (A2 `gm-art-style`). After generation: (1) remove the background, (2) downscale to the target grid with nearest-neighbour, (3) quantize to the locked palette, (4) run the A2 palette-conformance check [I]. For multi-frame animation, ask in order:
- Can the agent build it as a tiny procedural sprite (SVG or canvas shapes, tweened)? That suits the cute flat style.
- Is it a pixel character needing 4- or 8-direction walk cycles? Use PixelLab.
- Can it be made as a low-poly 3D model and rendered to a sprite sheet in Three.js? That gives frames that match by construction [I; a known technique, not benchmarked here].

**Background removal.** Use rembg (MIT, 25.2k★, pushed 2026-10-21) with the u2net/isnet (Apache-2.0) or BiRefNet (MIT, 4.3k★) models, on our own worker [V]. Exclude BRIA RMBG-1.4/2.0 (non-commercial, CC BY-NC) and `@imgly/background-removal-js` (AGPL-3.0, inactive since 2025-07) [V].

### 2.3 Low-poly 3D

**(a) Kit-bashing CC0 packs** is the default for the mockup look.
- Kenney: "public domain licensed (CC0) … Attribution is not required" [V, https://kenney.nl/support].
- KayKit: LICENSE.txt says CC0, "free to use in personal, educational and commercial projects" [V, GitHub KayKit-Character-Pack-Adventures-1.0]. The itch page asks people not to "resell unmodified copies" [V].
- Quaternius: FAQ says "All models are under the CC0 License" [V], but the per-pack pages were not checked [U], so keep A8's per-pack rule.
- Poly Pizza: mostly CC-BY with a per-model licence [U], under-13s prohibited, and no AI training [V]. Restrict it to CC0 entries fetched at build time by the adult-operated pipeline, or skip it.

**(b) Code-built low-poly** is the default for custom props. The agent writes Three.js geometry (merged primitives, `flatShading`, vertex colours, a palette lock) as a typed module in the game repo. This needs no vendor or GPU, and the source is the asset, which is ideal for public, forkable games [I]. Three.js is MIT, 116.7k★ [V]. For checking budgets and simplifying, glTF-Transform (MIT, 2.0k★) and meshoptimizer (MIT, 8.6k★) work [V]. Quality is unbenchmarked; this is the most important item in the evaluation in §6.

**(c) Blender via MCP** is optional. `ahujasid/mcp-for-blender` is MIT, 31.9k★, pushed 2026-10-20 [V]. Blender's own MCP server (v1.0.3, Blender 5.1+) warns it "will execute LLM generated code in Blender without any guards" [V, https://www.blender.org/lab/mcp-server/]. It may be used only inside the build sandbox (U04). It adds sculpt, bevel and modifier quality beyond (b) [I]. It is a V1.x candidate, not the default.

**(d) Text- or image-to-3D services:**

| Tool | Price | Low-poly / rig / glTF | Rights / training | Notes |
|---|---|---|---|---|
| **Meshy** | Text-to-3D preview 20 + refine 10 credits; image-to-3D 20–30; remesh 5; rig 5; animation 3 per action [V, https://docs.meshy.ai/en/api/pricing]. Pro $20 / 1,000 credits, Ultra $100 / 8,000; **no API on Free** [V]. So about **$0.38–0.60 per model**, $0.06–0.10 per rig [I] | `target_polycount` 100–300k; smart topology `meshy-t2` 100–15k faces; **`lowpoly` model_type retires 2026-10-30** [V]; GLB output [V] | Paid plans own the output; Free plan output is Meshy-owned CC BY 4.0. **Non-Enterprise inputs and outputs may be used for training** [V, https://www.meshy.ai/terms-of-use] | Best documented option for rigged and animated characters. **Never send child images.** |
| Tripo | about $0.01/credit [U]; P2 100–130 credits, retopology 35–40 [V, developers.tripo3d.com llms-full.txt] | P1 "best low-poly performance; 50–20,000 faces", `smart_low_poly`, rig/retarget, GLB default [V] | Terms page returned 403; free output reportedly CC BY [U] | Strong technical fit; hold until its terms are readable |
| Rodin / Hyper3D | 0.5 credit at $1.50/credit, about $0.75 [V] | Smart Low-Poly on the Creator plan [V] | 18+ / parental permission; API data kept 7 days, "not used to train models" [V] | Pricier and tuned for fidelity |
| Stability SF3D / SPAR3D | API $0.10 / $0.04 [V]; self-hostable | Remesh tri/quad, GLB [V] | Community License: free under $1M revenue, "You own any outputs", "Powered by Stability AI" notice when distributing [V] | Repos stale (2025) [V]; the self-hosted route for drawing-to-3D |
| Hunyuan3D 2.1 | self-host | — | "DOES NOT APPLY IN THE EUROPEAN UNION, UNITED KINGDOM AND SOUTH KOREA"; Output use outside the Territory "unlicensed" [V] | **Excluded**: public forks reach those regions |
| TRELLIS.2 | self-host | — | Code is MIT, but `to_glb()` imports nvdiffrast, "non-commercially … research or evaluation purposes only" [V] | **Excluded** for production |

**Drawing to 3D.** The deterministic local options are:
- (i) A billboard sprite or "paper" cutout (A2's paper style).
- (ii) Trace the contour, simplify it, and extrude it with `ExtrudeGeometry` into a chunky toy.
- (iii) Use the drawing as a texture on a kit model.

None of these needs a vendor [I]. Genuine image-to-3D of a child's drawing would need self-hosted SF3D/SPAR3D on a GPU, or Meshy, which is excluded because it trains on inputs. Per §5.13, do not advertise it in V1.

### 2.4 Music

| Tool | Facts | Fit |
|---|---|---|
| **Tone.js** + **Tonal** + **VCSL** | Tone.js MIT 14.8k★, Tonal MIT 4.3k★, VCSL CC0 (356★; content, so the star rule doesn't apply) [V] | **Default.** The agent writes `song.json` (key, tempo, motifs, intensity layers, stingers) as in the A3 design; zero marginal cost |
| BeepBox | MIT, 1.2k★, pushed 2026-08 [V] | Optional chiptune format |
| **ACE-Step 1.5** | MIT code and weights, 13.9k★, "less than 4GB of VRAM"; model card: "Professionally licensed music tracks … public domain and royalty-free" (self-reported, not audited) [V] | Best licence-clean generative option; needs a GPU host |
| Stable Audio 2.5 API | about $0.08 per generation [V]; Stability trains by default with an opt-out [V] | Paid fallback for ambient beds; audio age floor 13 for the account [V] |
| Stable Audio Open | Community License; training data includes CC BY clips [V] | Attribution has to travel with forks [I]; low priority |
| ElevenLabs Music / SFX | Music $0.15/min, SFX $0.12/min [V]; under-18 approval needed [V]; Free plan terms contradict each other [V] | Blocked until written approval |
| Suno / Udio | No public API (Suno "exploring … partners" [V, news]); Udio: "You may not download copies of any Output", personal non-commercial use only [V, https://www.udio.com/terms-of-service] | **Excluded** |
| Lyria | $0.04–0.08 per song [V] | **Excluded** (Gemini terms) |
| MusicGen | weights CC-BY-NC 4.0 [V] | **Excluded** |
| Strudel | AGPL-3.0; GitHub repo archived and moved to Codeberg [V] | Avoid (copyleft would reach the editor) |

### 2.5 SFX

- **Default:** ZzFX (MIT, 806★) or jsfxr (Unlicense, 459★) [V]. Both are below the 1k★ preference, but a parameter array the agent writes is the asset itself, and the fallback is plain Tone.js synthesis (14.8k★). Record this as a justified exception [I].
- **Library:** Kenney audio packs, CC0 [V].
- **Generated:** Stable Audio 2.5 (about $0.08) for foley-like sounds that code can't make. ElevenLabs SFX only after written approval.

### 2.6 Image upload, including a photo of a drawing (V1, §5.13)

The pipeline, from A8 and still valid:
1. In the browser, jscanify (MIT, 1.8k★) with OpenCV.js finds and crops the paper. The canvas re-encode strips EXIF/GPS. Only the crop is uploaded [V for licences; A8].
2. On our worker: rembg/BiRefNet, then trim, downscale, quantize to the palette, and an optional outline.
3. The creator picks a purpose: "use as-is", "use as a character", "use as inspiration".
4. The original crop stays in **private context**. Only the derived asset can enter public source, with a renamed file and no child name (A8 §5).

A typed description of the drawing, written by the agent after looking at it, can feed the vendor generators as an agent-written prompt. The image itself must not go to the generator [I]. Note that "looking at it" means sending the image to the Claude API. That is already the build engine and is covered by A8's Anthropic row, but it still counts as a disclosure for the consent screen [I].

---

## 3. Options table

| Layer | Option | Cost per asset | Child data allowed? | Redistributable in public forks? | Maturity | Look fit |
|---|---|---|---|---|---|---|
| 3D | CC0 kits (Kenney/KayKit/Quaternius) | $0 | n/a | Yes (CC0) | High | **Matches the mockups** |
| 3D | Agent-written Three.js geometry | tokens only | n/a | Yes (source) | Three.js 116.7k★ | Good for props [I]; characters weaker [I] |
| 3D | Blender MCP in sandbox | tokens + CPU | n/a | Yes | 31.9k★ | Better than code; adds sandbox work |
| 3D | Meshy paid API | ~$0.40–0.60 + rig | **No** (trains) | Yes on paid plans | Vendor | Good, after decimation [U] |
| 3D | Tripo / Rodin | ~$0.75 (Rodin) | No / unknown | Unverified / Yes | Vendor | Good [U] |
| 3D | SF3D self-hosted | GPU | Yes (our infrastructure) | Yes, with a "Powered by Stability AI" notice | 1.9k★, stale | Middling [U] |
| 2D | Procedural SVG/canvas by the agent | tokens | n/a | Yes | n/a | Good for flat/cute [I] |
| 2D | OpenAI gpt-image | $0.005–0.05 | Only with approved ZDR + consent | Yes (you own it) | Vendor | Strong for cartoon |
| 2D | PixelLab / Retro Diffusion | $0.01–0.18 | No (unknown terms) | Yes (stated) | Small vendors | Best for pixel art |
| 2D | Recraft | $0.007–0.08 | No | Yes | Vendor | Vector/UI |
| 2D | FLUX.2 klein 4B self-hosted | GPU | Yes | Yes (Apache) | BFL | Good [U] |
| Upload | jscanify + rembg/BiRefNet + quantize | CPU | **Yes (local)** | Derived asset only | 1.8k★ / 25k★ | Kid's own art |
| Music | Tone.js song.json + VCSL | $0 | n/a | Yes | 14.8k★ | Good, if the skill is good [U] |
| Music | ACE-Step 1.5 self-hosted | GPU | n/a | Yes (MIT) [provenance self-reported] | 13.9k★ | Full songs |
| Music/SFX | Stable Audio 2.5 API | ~$0.08 | No | Yes ("you own") [V, Community License; API terms I] | Vendor | Ambient/foley |
| SFX | ZzFX/jsfxr + Kenney audio | $0 | n/a | Yes | Exception | Retro/cartoon |

---

## 4. Recommended V1 toolchain

Each request is tried down this ladder, and the agent records which rung it used in the asset's provenance:

1. **Library rung:** CC0 kits from an allowlisted, vendored set (per-pack LICENSE recorded), Kenney audio, and the A2 palettes.
2. **Code rung (default for custom work):**
   - Three.js low-poly modules for 3D.
   - SVG/canvas procedural sprites for flat 2D.
   - `song.json` with Tone.js and VCSL for music.
   - ZzFX parameter arrays for SFX.
   - Everything is versioned source, with no vendor, GPU or child-data exposure.
3. **Generative rung (adult-operated, agent prompts only, budgeted):**
   - OpenAI gpt-image (1-mini, or 2 at low/medium) for 2D sprites and backgrounds.
   - Meshy paid API for rigged or animated characters that kits and code can't cover.
   - PixelLab for pixel-art walk cycles, once its terms are re-read.
   - Each call is followed by deterministic post-processing (background removal, quantize/grid snap, glTF-Transform simplify to the style card's poly budget) and a provenance entry `{vendor, model, prompt_hash, licence, cost}`.
4. **Child-input rung (local only):** the upload pipeline in §2.6. The outputs are the child's own art as a sprite, a cutout, an extrusion or a texture.

**Must stay off third-party generators:**
- photos and crops of drawings;
- anything with a face, handwriting or a name;
- child voice recordings;
- raw child prompts or transcripts. Only the agent's rewritten, PII-checked brief may leave, and only to Anthropic (the build engine) and the rung-3 vendors.

Reference screenshots of real games are never image inputs (A8 §6).

**Excluded for V1:** Google image and audio, fal.ai, Replicate, ElevenLabs (until written approval), Suno, Udio, MusicGen, Hunyuan3D, TRELLIS/TRELLIS.2, BRIA RMBG, imgly, Strudel, FLUX [dev] and klein 9B, and Stability image (it trains by default and offers no advantage).

**Rough per-game generative cost [I, list prices]:**
- 20 sprites at gpt-image-1-mini medium ($0.011) × 3 attempts ≈ $0.66.
- 4 Meshy characters × (30 + 5 + 3×3 credits) at $0.02/credit ≈ $3.50.
- So about $4 at the high end, versus the spec's ~$20 per new game hypothesis (§8.6).
- Music and SFX on the code rung cost tokens only.
- Meshy Pro's $20/month minimum dominates at family scale.

---

## 5. Decisions for Kevin

**D1. Which paid generators may V1 call (with agent-written prompts only)?**
- (a) None: library and code rungs only.
- (b) OpenAI gpt-image only.
- (c) OpenAI gpt-image plus Meshy Pro ($20/month).
- (d) (c) plus PixelLab.
- **Recommended: (c).** OpenAI has the strongest child and ownership terms, and Meshy is the only well-documented route to rigged characters.
- **Consequences:** two vendors on the consent and retention notice, and about $20/month fixed plus usage. Option (a) keeps V1 vendor-free but probably can't produce custom animated characters [I]. Meshy may train on our prompts and outputs.

**D2. What can a photo of a child's drawing become in V1?**
- (a) A local cleanup only, used as a sprite, cutout, extrusion or texture.
- (b) (a) plus AI restyling through OpenAI after ZDR approval and separate parental consent.
- (c) (a) plus restyling or 3D on a self-hosted GPU.
- **Recommended: (a).** The child's own lines are the point, and this needs no approvals.
- **Consequences:** no "turn my drawing into a real 3D model" feature in V1. Options (b) and (c) can be added later without changing the upload pipeline.

**D3. Should V1 have a GPU host for self-hosted models (ACE-Step 1.5, FLUX.2 klein 4B, SF3D)?**
- (a) No.
- (b) Kevin's own GPU machine as a build-time worker.
- (c) A rented serverless GPU (another vendor to review).
- **Recommended: (a) for launch, reconsidered after the §6 music evaluation.** Code-composed music already meets §12.1 as "generated music", and Railway has no GPU (A3; [U] today).
- **Consequences:** no full-song generation in V1. Option (b) adds an always-on home dependency. Option (c) adds data-processing review.

**D4. Should V1 have a paid generated-audio vendor?**
- (a) None: Tone.js, ZzFX and Kenney only.
- (b) Stable Audio 2.5 API with training opt-out (~$0.08 per clip).
- (c) Apply for ElevenLabs written approval (which would also serve voice, U02).
- **Recommended: (a), and pursue (c) only if U02 picks ElevenLabs anyway.**
- **Consequences:** (a) limits realistic foley and ambience. (b) adds a vendor that trains by default.

---

## 6. Zero-cost evaluation plan

No paid API calls without approval. Steps 1–3 use Kevin's own development sessions, which A8 says are allowed for personal development, and offline tools.

1. **Kit coverage audit (no model use).** List every object in both mockups (tree, rock, lighthouse, bridge, checkpoint, cars, barriers, dungeon rooms, monsters, treasure). Map each to a Kenney, KayKit or Quaternius pack and record the pack's LICENSE.txt. Metric: share of items covered with a matching look, judged by Kevin.
2. **Code-built 3D bake-off.** Have the agent build 10 of those items as Three.js modules to a style card (palette, under 500 triangles per prop). Compare them blind against the kit equivalents in one scene; Kevin and the kids rate each 1–5. Pass mark: median ≥ 3.5 on props. Record tokens per prop.
3. **Audio.** Produce three `song.json` tracks (cozy, epic, creepy) on Tone.js with VCSL, plus 15 ZzFX SFX. Rate them blind against Kenney audio. Check loudness with the A3 ffmpeg `ebur128` check.
4. **Drawing pipeline, offline.** Run A8's 20 consented household drawings, never sent anywhere. Measure crop success, rembg versus BiRefNet edge quality, and the appeal of quantized sprites and extrusions (1–5).
5. **Optional, only if Kevin already has an 8 GB+ GPU at no cost:** try ACE-Step 1.5, FLUX.2 klein 4B and SF3D locally on the same briefs.
6. **Paid benchmark, needs approval: proposed cap $30.**
   - About $5 of OpenAI gpt-image (about 60 sprites across 1-mini and 2).
   - One month of Meshy Pro ($20) for about 15 text-to-3D models, rigs and animations. Compare after decimation against steps 1–2.
   - Agent-written prompts only; stop at the cap.

---

## 7. Uncertainty

- **Quality.** No tool was run. "Matches the mockup look" is inferred, and so is the quality of code-built 3D and agent-composed music. Step 2 of §6 is the key evidence.
- **Terms that could not be read:**
  - Retro Diffusion and Tripo terms (JavaScript-rendered or 403).
  - Mixamo FAQ (403).
  - OpenAI usage policy at openai.com (403; the OSA PDF was read instead).
  - Quaternius per-pack pages.
  - Poly Pizza's licence mix.
  - Recraft's input-training stance.
- **Terms that changed recently.** Several pages were updated in Sept–Oct 2026, and Meshy's `lowpoly` mode retires on 2026-10-30. Re-check before adoption.
- **Conflicting vendor statements:** Meshy's API retention (3 days vs 14), and ElevenLabs Free-plan music rights (pricing page vs Music Terms).
- **Inferred legal reading.** That agent-written prompts carry no child personal information, and that vendors with no age clause are acceptable with an adult account holder, are both inferences; they need counsel (A8 §9). Vendor training-data claims (ACE-Step, Stability) are self-reported.
- **Sub-1k★ exceptions:** ZzFX, jsfxr and VCSL.
- **Prices** are list prices from 2026-10-21. Per-game cost estimates are arithmetic, not measurements.
