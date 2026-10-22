# A8 — Vendor, legal, licensing and policy feasibility (R19), plus assets, creative inputs, retention and provenance (R16)

Research agent A8, v0.3 research pass. Access date for all sources: **2026-10-21**, unless a row says otherwise.

> **This is research, not legal advice.** Below, "verified" means a quote was read on the vendor's or regulator's current page on the access date. It does not mean the product complies with anything. The items in §9 need qualified counsel or written vendor confirmation.

---

## 0. Bottom line (read this first)

1. **Running the service on Kevin's Claude Pro/Max subscription is not permitted.** Anthropic's Claude Code legal page says it directly. The supported routes are an **Anthropic API key** under the Commercial Terms (Kevin pays; this is allowed), or each end user signing in with their own subscription inside an *unmodified* Claude Code binary. Children cannot do the second: consumer accounts require age 18+.
2. **Every speech, image, music and 3D vendor checked is closed by default to services likely to be used by under-18s**, except Anthropic and OpenAI. Those two allow it with extra safeguards; OpenAI additionally requires **approved Zero Data Retention** before any under-13 personal data is sent. Google (Gemini API, Vertex, and so Lyria and YouTube video understanding) **prohibits** it outright. ElevenLabs prohibits it **unless approved in writing**. fal.ai requires end users to be 18+. Deepgram has no child clause but trains on content by default.
3. **COPPA very likely applies to child accounts.** The inviter marking an account as a child's is *actual knowledge*. The amended rule has been enforceable since **2026-04-22**. It requires a written retention policy, separate consent for disclosure to third parties, and a written security program. Whether a free, family-run service counts as "operated for commercial purposes" is a question for counsel. Design as if it does.
4. **Process locally, never on vendors, for anything that captures a child.** That covers drawings, paper photos, background removal and EXIF stripping (browser canvas plus jscanify/OpenCV.js, or rembg on our own server). Fixed-language dictation can use the browser's *on-device* recognition where available. The fewer vendors that touch child data, the fewer approvals are needed.
5. **Asset-first is legally clean.** Kenney, Quaternius, KayKit and VCSL are CC0. Phaser, Three.js, Tone.js, BeepBox, Colyseus and Better Auth are MIT. Watch two traps: smplr's *sample* repos have mixed or no licenses (one is GPL-2.0), and TRELLIS depends on NVIDIA's **non-commercial** nvdiffrast.

---

## 1. Requirement

- **R19:** verify the inherited §10.5 claims against primary sources. Determine what applies to a mixed-age, invite-only service with child accounts, list what needs written approval, and verify open-source licenses (§11.1).
- **R16:** map how each class of creative input and generated data flows and how long it is kept. Define what forks may copy and what may be public, and choose processing paths that avoid vendors.
- **§8.5 blocker:** can a consumer subscription power the multi-user service?

---

## 2. Verification register (spec claim → status → primary source)

| # | Spec claim (§10.5 / §8.5 / §10.6) | Status | Exact quote and source (accessed 2026-10-21) |
|---|---|---|---|
| V1 | ElevenLabs needs written approval for apps aimed at under-18s | **Verified** | "Apps, products, or experiences directed at individuals under 18 are prohibited unless we have assessed and approved them in writing" (§1 Protection of Minors → Use by and for Minors). https://elevenlabs.io/use-policy (last updated 09 Oct 2026). The policy names **no route for requesting approval**; presumably it goes through sales or Enterprise (unverified). |
| V2 | ElevenLabs consent-record obligation | **Verified** | "Where approved, you must obtain any parental consent required by applicable law and maintain records of that consent." Same page. Also: "You may not submit voice recordings of anyone under 18 to create or train a voice model." |
| V3 | ElevenLabs zero retention is Enterprise-only | **Verified** | "Zero Retention Mode is available to select enterprise customers." Covers TTS, STT, Sound Effects and most Music endpoints; "Traffic through the web UI is never covered"; voice cloning is excluded. https://elevenlabs.io/docs/developers/resources/zero-retention-mode |
| V4 | ElevenLabs account holder is 18+ | **Verified** | "If you are under 18 years of age … you may not use our Services". https://elevenlabs.io/terms-of-use (09 Oct 2026) |
| V5 | ElevenLabs Music has its own under-18 prohibition | **Contradicted as stated / Unclear** | The Music API Terms (https://elevenlabs.io/music-api-terms, updated 09 Oct 2026) contain **no minors clause**. The general Use Policy's under-18 rule (V1) still applies to Music, so Music remains blocked without written approval. The Eleven Music v1 terms page returned 404. |
| V6 | OpenAI Realtime allows under-13 use with zero retention | **Partly verified; materially incomplete** | "You should not use OpenAI services to process any personal data of children under 13 or the applicable age of digital consent without first implementing zero data retention in our API." https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance (undated). ZDR is "subject to prior approval by OpenAI and acceptance of additional requirements" (via sales). https://developers.openai.com/api/docs/guides/your-data. So zero retention is a **prerequisite that needs approval**, not something available by default. |
| V7 | OpenAI Realtime and Transcription are ZDR-eligible | **Verified** | Data-controls table: `/v1/realtime` has 30-day abuse monitoring by default and is ZDR-eligible; `/v1/audio/transcriptions` has **no** abuse-monitoring retention and is ZDR-eligible; `/v1/audio/speech` has 30 days and is ZDR-eligible; `/v1/images/generations` is "Yes, with limitations" (gpt-image models only). The API does not train on data by default. Same URL. |
| V8 | OpenAI usage-policy text on minors | **Inaccessible** | https://openai.com/policies/usage-policies/ returned HTTP 403 to WebFetch and curl. A search snippet shows effective date 29 Oct 2025. Re-check in a browser. |
| V9 | Google Lyria excluded for under-18 apps | **Verified (broader than claimed)** | Gemini API terms: "You must be 18 years of age or older to use the APIs. You also will not use the Services as part of a website, application, or other service that is directed towards or is likely to be accessed by individuals under the age of 18." https://ai.google.dev/gemini-api/terms (updated 2026-04-28). Vertex AI has the same rule: "Customer will not, and will not allow End Users to, use a Generative AI Service as part of a website, Customer Application, or other online service that is directed towards or is likely to be accessed by individuals under the age of 18." https://cloud.google.com/terms/service-terms §20(d) (modified 12 Oct 2026). This covers **all** Gemini, Lyria and Veo use, not only music. |
| V10 | Gemini video understanding of YouTube URLs | **Verified, with conditions** | "The YouTube URL feature is in preview"; public videos only; 8 hours per day on the free tier. https://ai.google.dev/gemini-api/docs/video-understanding. Still subject to V9's under-18 rule. |
| V11 | Child voice is personal information under amended COPPA | **Verified** | 16 CFR 312.2: personal information includes "(8) A photograph, video, or audio file where such file contains a child's image or voice" and "(10) A biometric identifier … voiceprints … facial templates". https://www.ecfr.gov/current/title-16/part-312 (fetched via the eCFR renderer API) |
| V12 | A 2025 COPPA amendment exists | **Verified** | 90 FR 16918 (22 Apr 2025), FR Doc 2025-05904: "Effective date: The amended Rule is effective June 23, 2025. Compliance date: Except with respect to Sec. 312.11(d)(1), (d)(4), and (g), regulated entities have until April 22, 2026 to comply." https://www.govinfo.gov/content/pkg/FR-2025-04-22/html/2025-05904.htm |
| V13 | Audio exception lets voice be used without consent | **Verified, but narrow** | §312.5(c)(9): "Where an operator collects an audio file containing a child's voice, **and no other personal information**, for use in responding to a child's specific request and where the operator does not use such information for any other purpose, does not disclose it, and deletes it immediately after responding…" A signed-in child account carries a persistent identifier (also personal information), so the exception very likely **does not cover** our product (inference; needs counsel). |
| V14 | Written data-retention policy is required | **Verified** | §312.10: "Personal information collected online from a child may not be retained indefinitely. At a minimum, the operator must establish, implement, and maintain a written data retention policy that sets forth the purposes … the business need … and a timeframe for deletion", and it must be provided in the §312.4(d) online notice. |
| V15 | Separate consent is needed for third-party disclosure | **Verified** | §312.5(a)(2): "An operator must give the parent the option to consent to the collection and use of the child's personal information without consenting to disclosure of his or her personal information to third parties, unless such disclosure is integral to the website or online service. … must obtain separate verifiable parental consent to such disclosure." |
| V16 | A written security program is required | **Verified** | §312.8(b): "the operator must establish, implement, and maintain a written information security program…" |
| V17 | Consumer subscription may power a multi-user service | **Contradicted** | "Anthropic does not permit third-party developers to offer Claude.ai login into their own applications, or to route requests through Free, Pro, or Max plan credentials on behalf of their users." Also: "Developers building products or services … including those using the Agent SDK, should use API key authentication." And: "Customers may not pay for, resell, or intermediate Claude usage on their end users' behalf" when hosting Claude Code. https://code.claude.com/docs/en/legal-and-compliance. Consumer Terms (effective 8 Oct 2025): "You may not share your Account login information … or make your Account available to anyone else"; automated access is barred "Except when you are accessing our Services via an Anthropic API Key". https://www.anthropic.com/legal/consumer-terms |
| V18 | Anthropic requires safeguards from organizations serving minors | **Verified** | AUP: "We define a minor or child to be any individual under the age of 18", and products serving minors "must comply with the additional guidelines". https://www.anthropic.com/legal/aup (the page shows an effective date of **Nov 12, 2026**, which looks like a pre-announced version; re-check after that date). The guidelines list age verification, content moderation, monitoring and reporting, and educational resources (all "should"). "Organizations must disclose to their users that they are interacting with an AI system rather than a human." Compliance should be "clearly stated on the organization's website". https://support.claude.com/en/articles/9307344 (16 Mar 2026). No age floor and no requirement to notify Anthropic; Anthropic "will periodically audit". |
| V19 | Commercial Terms allow serving our own end users | **Verified** | "power products and services Customer makes available to its own customers and end users"; "Anthropic may not train models on Customer Content from Services"; no reselling "except as expressly approved". https://www.anthropic.com/legal/commercial-terms (17 Jun 2025) |
| V20 | "Copy rules and numbers" is safe, per Tetris v. Xio | **Unclear: incomplete summary** | 863 F. Supp. 2d 394 (D.N.J. 2012). Game rules are not protected, but their *audiovisual expression* (piece shapes, colors, movement, playfield dimensions) is, and Xio was also liable for **trade dress**. Read only through secondary summaries (Loeb & Loeb 2012; Fenwick); the full opinion was **not read**. Some features that look "mechanical" were held to be expression. |

---

## 3. Vendor feasibility matrix for child and mixed-age use

Legend: **OK** = permitted with obligations; **Approval** = needs written vendor approval; **No** = prohibited by default; **Adult-only** = acceptable only in flows no child can reach.

| Vendor / product | Child-account path | Retention / training default | Zero-retention route | Verdict |
|---|---|---|---|---|
| Anthropic API (Claude, Agent SDK with API key) | OK with AUP minors guidelines and AI disclosure | No training on Commercial content | ZDR "isn't available for all organizations" (Claude Code legal page) | **Primary build engine.** Use an API key, not OAuth. |
| Claude Pro/Max OAuth | No, for any multi-user service | n/a | n/a | **Personal dev use by Kevin only.** |
| OpenAI Realtime / Transcribe / TTS / gpt-image | OK for 13–17 with safeguards; under-13 personal data only after **approved ZDR** | Abuse logs up to 30 days (transcriptions: none); no API training | Sales approval | **Best candidate for voice if approval is granted.** Text-only use with no PII is lower risk but still bound by the guidance. |
| ElevenLabs (TTS, STT, SFX, Music, Agents) | **Approval** (written), plus parental-consent records | Standard logging; ZRM Enterprise-only | Enterprise | **Blocked until written approval.** Platform-voice TTS of agent text, with no child audio uploaded, still falls under "experiences directed at" minors. |
| Google Gemini / Vertex / Lyria / Veo / YouTube video understanding | **No** ("likely to be accessed by individuals under the age of 18") | Unpaid tier: human review and training | — | **Exclude from any child-reachable path.** Possible use: an offline, adult-operated research tool Kevin runs himself, with outputs curated before they reach the product (needs counsel; "part of a … service" is broad). |
| fal.ai (FLUX Kontext etc.) | **No**: "you are responsible for ensuring that your End Users are at least 18" (https://fal.ai/legal/terms-of-service, 8 Sep 2026) | No stated retention period; anonymized "Usage Data" may train models | DPA, not read | **Exclude** for child-originated inputs. Adult-only or Kevin-curated asset generation at most. |
| Meshy | Minimum age 14, parental permission if under 18 (https://www.meshy.ai/terms-of-use, 19 Sep 2026) | **Trains on non-Enterprise inputs and outputs**; API outputs deleted after 3 days | Enterprise 1–30 days | **No for child drawings** (training plus an age floor of 14). |
| TRELLIS / TRELLIS.2 (self-hosted) | No vendor involved | Our infrastructure | n/a | Code is MIT, **but nvdiffrast is "non-commercially … research or evaluation purposes only"**. Needs a GPU. Prototype only unless the license is cleared. |
| Deepgram | No child clause; account 18+; "You are responsible for … end users" | **"We may also use Your Content to improve our Services"**; per-request opt-out (https://deepgram.com/legal/terms, 6 Aug 2026) | Not found | **Not recommended** without a DPA and opt-out. |
| AssemblyAI | No child clause found; acts as processor under the DPA | Draft DPA 1 Jan 2026; retention exhibit not read | Unverified | **Unclear**: request DPA and child-data terms. |
| Speechmatics | No child clause found | Training only "if directly Enabled by You" (addendum) | Unverified | **Unclear**. |
| Browser Web Speech API | — | Default is server-based: "Your audio is sent to a web service for recognition" (MDN). `processLocally = true` keeps audio and text on device once a language pack is installed (https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API) | n/a | **Chrome:** use `processLocally` with `available()`/`install()`, and **never fall back to cloud automatically** for child accounts. **Safari/iPad:** `webkitSpeechRecognition` uses Apple's Siri/Dictation service and needs a network (developer reports and WebKit bug 225298, *secondary*). That is a third-party disclosure we cannot control, so treat it as a vendor flow. |
| Pipecat | Orchestration only (BSD-2-Clause) | — | — | Neutral. Each provider it connects to brings its own row in this table. |

**Implication for iPad, the primary child device:** no free, verified on-device dictation path exists in Safari. Choices: (a) OpenAI Transcribe with approved ZDR; (b) a self-hosted open model on our server (for example Whisper-class; not evaluated here, and A-voice owns that); (c) the parent records consent covering Apple dictation, with counsel's view on whether that is our "disclosure".

---

## 4. COPPA applicability to this product (analysis; needs counsel)

- **Operator test.** "Operator" requires a service "operated for commercial purposes involving commerce among the several States" (§312.2). Kevin is in a different state from the children, and the spec says this is "a general product, not only a family project". Whether a free family deployment is commercial is **not settled by the text**; counsel should decide. Recommendation: **design to comply**, because the design cost is small at this scale and the product is meant to grow.
- **Actual knowledge.** §312.3 covers "any operator that has actual knowledge that it is collecting or maintaining personal information from a child". The invite flow's **child-account flag is actual knowledge** for that account, so mixed-audience status does not help there. For accounts *not* flagged, the mixed-audience definition requires age screening "in a neutral manner that does not default to a set age". Ask every invitee's age neutrally, or have the inviting adult attest to it.
- **Directed-to-children factors.** "animated characters or child-oriented activities", "music or other audio content" (§312.2). A playful game maker will look child-directed regardless of the all-ages positioning. The **all-ages positioning is not an exemption** (confirms §10.5's last row).
- **Who consents.** Verifiable parental consent must come from a **parent**, "reasonably calculated … to ensure that the person providing consent is the child's parent" (§312.5(b)(1)). An uncle-inviter is not automatically that person. This bears directly on the spec's open question about supervision authority (§4.2).
- **Third parties.** Every model or voice vendor receiving child personal information (voice, photos, possibly identifiable text) is a disclosure. Either show that each vendor is a service provider "integral" to the service, or collect **separate** consent (§312.5(a)(2)). Practical design: a per-capability consent screen ("Voice: audio goes to [vendor], deleted within [N]").
- **Required documents:** an online notice with the **written retention policy** (§312.10), a written security program (§312.8), parental review and deletion rights (§312.6), and direct notice to the parent.
- **Other laws, briefly and unverified:** the UK Age Appropriate Design Code applies to services "likely to be accessed by" children and has 15 standards, including data minimisation, default settings, geolocation and nudge techniques (ICO page). It matters only for UK users, but it is a good design checklist. US state laws (California CCPA minors opt-in; the California Age-Appropriate Design Code litigation; state app-store and age-verification statutes) are **not verified here**. Counsel should scope them to the states where the family lives.

---

## 5. Retention and data-flow map (R16) with proposed defaults

Principles: **process locally first**, keep only what is needed to fulfil the purpose, keep **private context** (raw inputs) separate from **game source** (published), and give every class a deletion timer that §312.10 can cite.

| Data class | Where processed | Sent to vendor? | Proposed default retention | In public game source? | Copied into forks? |
|---|---|---|---|---|---|
| Transient mic audio (dictation) | On device if possible; else approved STT vendor | Only an approved, zero-retention vendor | **Not stored**; held in memory until the transcript returns | Never | Never |
| Voice-chat media (multiplayer, post-MVP) | WebRTC peer-to-peer or SFU, not recorded | SFU provider if used (separate review) | **Never recorded** | Never | Never |
| Transcripts / raw prompts | Server | Model vendor (Anthropic API) | 30 days in private job context, then summarized into a non-identifying design brief; parent can delete | **No**: only the agent-written spec/brief, reviewed for PII | Brief only, if the creator allows |
| Drawings (canvas) | Browser | No; the PNG goes to our storage | Keep as an **original-in-private-context** while the game exists; derived sprites are game assets | Derived sprite yes (if published); original **no** by default | Derived asset yes; original no |
| Camera photos of paper | Browser: jscanify/OpenCV.js finds and crops; canvas re-encode **drops EXIF/GPS** | No | **Raw photo never uploaded**; only the crop is kept (spec §5.9) | Crop treated as a drawing | As drawing |
| Photos containing faces / real people | Should not be accepted | — | Local face check (on-device face detection, not evaluated) → reject or blur before upload | Never | Never |
| Background removal for sprites | rembg on our Railway worker (u2net/isnet Apache-2.0, BiRefNet MIT) or in-browser | No | As derived asset | Yes | Yes |
| Generated assets (AI) | Vendor | Adult-only vendors or Anthropic-written procedural assets | Lifetime of game; keep a provenance record | Yes, with a provenance manifest | Yes |
| User-recorded dialogue / SFX (child voice) | Browser record; server stores | No vendor; **no voice cloning ever** (ElevenLabs bars minors' voices for models) | Opt-in, with **separate parental consent**; deleted with the game or on request; flagged `contains_child_voice` | **Default private**: a published game swaps in TTS/placeholder unless the parent opts in | **Not copied** into others' forks |
| Gameplay previews / screenshots / video | Our headless playtest | No | Latest N per build; 30 days | Thumbnails of game art only; no webcam, no names | No |
| Diagnostics / bug bundles | Server | No (unless an error tracker; review) | 30 days; scrub transcripts, names, voice | Never | Never |
| Analytics | Our DB, first-party only | **No third-party analytics SDKs on child accounts** (avoids disclosure and persistent identifiers going to third parties) | Raw events 90 days, then aggregates | Never | Never |
| Cloud saves | Our DB | No | Until the game or account is deleted | Never | Never (a fork starts fresh) |
| Account and supervision records, consents | Our DB | Auth provider only if hosted (Better Auth is self-hosted) | Account lifetime; **consent records kept** for the vendor duty (V2) and as COPPA evidence | Never | Never |
| Provider credentials | Secret store | — | — | Never | Never |

**Metadata leakage checklist for public game source:** git author name and email (use a pseudonymous per-creator bot identity, never a child's real name or email); asset filenames ("emmas-dog.png"); EXIF in any committed image (re-encode at ingest); comments or changelogs quoting raw child prompts; save files; the timezone in commit timestamps (minor). The repo layout is decided elsewhere (R07). This list is the input A8 hands to it.

**Image-generation candidates, as a group:** none of fal, Meshy or Google can take child-originated inputs. OpenAI gpt-image is the only checked vendor whose child terms allow it (with approved ZDR for under-13 personal data; a drawing of a dragon is arguably not personal information, but a child's handwriting or name on paper might be). The safest MVP is **Kenney/Quaternius/KayKit assets plus local cleanup of the child's own drawing**, with AI restyling left for later.

---

## 6. IP guidance for agents ("make it like X")

Tetris v. Xio makes clear that "rules are free" is not a safe harbor: the *expression* of those rules, and distinctive visual trade dress, can infringe. Agent rules:

1. **Mechanics may be borrowed; expression may not.** Allowed: genre conventions, abstract rules ("falling blocks clear lines", "jump on enemies"), tuning *ranges* found by playtesting. Not allowed: matching distinctive visual arrangements, piece shapes *and* colors *and* playfield proportions together, character designs, level layouts copied tile for tile, UI layouts, music or melodies, sound effects, fonts, logos.
2. **No protected identity.** Never use franchise names, character names, trademarks or recognizable silhouettes in game titles, assets, code identifiers or published metadata. Rewrite "make Mario" into a neutral brief ("a cheerful plumber-like hero" becomes "a cheerful hero in overalls"; the agent picks original design traits).
3. **Distance test.** For any reference game, the agent writes down ≥3 deliberate visual differences (palette, proportions, camera or framing, theme) before building, and runs a final check: "Would a casual observer mistake this for X?" If yes, revise.
4. **References are analysis inputs only.** Screenshots and videos may inform a design brief. They are never committed, traced, used as image-to-image inputs, or sent to generators.
5. **Assets come only from the allowlist** (§7). Every asset gets a provenance entry: `{source, license, url, author, date, modified_by}`. Generated assets record vendor, model and prompt hash.
6. **Real people:** no names, likenesses or voices of real people (this also carries forward the §10.3 always-off rule), including family members in published games unless the parent opts in.
7. **Tetris specifically:** avoid it. The Tetris Company enforces actively.

---

## 7. License table (verified via `gh api` repo metadata or the vendor's license page, 2026-10-21)

| Component | License | Evidence | Notes / risk |
|---|---|---|---|
| Phaser | MIT | gh `phaserjs/phaser` | 40.5k★ |
| Three.js | MIT | gh `mrdoob/three.js` | |
| Tone.js | MIT | gh `Tonejs/Tone.js` | |
| smplr (code) | MIT | package.json `"license": "MIT"`; GitHub shows none | **Samples are fetched at runtime from `smpldsnds` repos, which mostly declare no license**: one CC0, one **GPL-2.0** (hydrogen-drum-samples), several NOASSERTION. Allowlist instruments individually or self-host VCSL instead. Below the 1k★ tool rule (328★); this is the spec's "optional exception". |
| BeepBox | MIT | LICENSE.md "Copyright (c) 2012-2024 John Nesky" | Songs are encoded in URLs, so there are no server data. |
| VCSL samples | CC0-1.0 | README: "Creative Commons 0 … no royalties, no credit" | Below the 1k★ rule (356★), but it is content, not a tool. |
| ACE-Step 1.5 | MIT (code and weights per the HF card) | gh `ace-step/ACE-Step-1.5`; https://huggingface.co/ACE-Step/Ace-Step1.5 | Training data are self-described as "licensed tracks … public domain and royalty-free … synthetic MIDI-to-Audio", with **no dataset list**. The README disclaimer warns of "unintentional copyright infringement due to stylistic similarity". Self-hosting needs a GPU. Treat as **medium provenance risk**; generated songs need a "not similar to a named artist" prompt policy. |
| Better Auth | MIT | gh | Self-hosted, so it adds no auth vendor. |
| Colyseus | MIT | gh | |
| Kenney | CC0 | https://kenney.nl/support: "public domain licensed (CC0) … Attribution is not required"; logo excluded | |
| Quaternius | CC0 | https://quaternius.com/faq.html: "All models are under the CC0 License." | |
| KayKit | CC0 | itch page (e.g. kaylousberg.itch.io/kaykit-adventurers): "Creative Commons Zero v1.0 Universal"; asks not to "resell unmodified copies" | GitHub repos say "Other"; read each LICENSE.txt per pack at ingest. |
| Lospec palettes | **No stated license** | lospec.com terms are silent on palette ownership | Hex lists are probably not copyrightable (inference, not verified). Credit palette authors anyway and fetch via `/palettes/api`. |
| jscanify | MIT | gh `puffinsoft/jscanify` (1.8k★) | Needs OpenCV.js (Apache-2.0). Runs in the browser, so no vendor. |
| rembg | MIT | gh 25k★ | Model licenses: U-2-Net Apache-2.0, BiRefNet MIT, DIS/isnet Apache-2.0. **Check bria-rmbg's model license before use** (not verified; commonly non-commercial). |
| TRELLIS / TRELLIS.2 | MIT | gh | **nvdiffrast: NVIDIA license, "non-commercially … research or evaluation purposes only"**, a blocker for production. |
| perfect-freehand | MIT | gh | |
| Pipecat | BSD-2-Clause | gh | |

---

## 8. Options, stack integration and costs

**Build credentials (§8.5).** *Option A (recommended):* an Anthropic Console org with an API key held by the Railway backend and aiur. Kevin pays, Commercial Terms apply, no training on content; request ZDR (availability not guaranteed). *Option B:* bring-your-own key. Adults may supply their own Anthropic API key, which the Claude Code legal page permits ("the resulting usage is billed to the key owner"). *Option C:* per-user subscription sign-in inside an unmodified hosted Claude Code. This is allowed for adults through Anthropic's own flow only, and impossible for children. Never collect or store tokens. **Not allowed:** Kevin's Max OAuth token serving other users. aiur's provider-credential layer (R06) should make "API key" the only kind available for multi-user jobs.

**Voice (R03).** MVP: text-first with on-device dictation where supported. Child voice to a vendor only after (1) vendor approval or ZDR and (2) separate parental consent. Kid-facing TTS is lower risk in data terms (only agent text is sent), but ElevenLabs still requires approval for "experiences directed at" minors. OpenAI TTS falls under the under-18 guidance.

**Costs.** Vendor list prices were not retrieved in this pass. The spec defers pricing, and other agents own cost (R15). One stated figure: the Gemini YouTube URL feature is "available at no charge" while in preview. Legal review and vendor Enterprise plans (ElevenLabs ZRM, Meshy retention control) are the likely non-trivial costs. **No quotes were obtained.**

**Output-quality evaluation (R16).** Run the local drawing pipeline on 20 consented household drawings, *offline and never sent anywhere*. Measure crop success rate and background-removal edge quality on a 1–5 scale, judged by Kevin and the child.

---

## 9. Items needing written vendor approval or qualified legal review

**Written vendor approval or contract**
1. ElevenLabs: written approval under "Use by and for Minors", the approval route (unknown), whether platform-voice TTS alone needs it, and the cost of Enterprise ZRM.
2. OpenAI: ZDR approval for Realtime/Transcribe/TTS/gpt-image on the project, plus written confirmation of what OpenAI counts as "personal data of children under 13" in transcribed speech.
3. Anthropic: ZDR availability for the org; confirmation that a hosted aiur running Claude Code or the Agent SDK *with Kevin's API key* for invited family users is fine under the Commercial Terms (it appears permitted; confirm in writing because the service includes minors).
4. Google: written confirmation that adult-only, offline reference research (Gemini video understanding run by Kevin) is outside "part of a … service likely to be accessed by individuals under 18". Otherwise drop Google.
5. Any STT fallback (AssemblyAI or Speechmatics): DPA, retention, training opt-out, and acceptance of child audio.

**Qualified legal review**
6. Whether a free, invite-only, family-run service is a COPPA "operator … for commercial purposes", and whether that changes if it opens to other families.
7. Who can give verifiable parental consent when the inviter is an uncle; which consent method to use.
8. Whether sending child audio or images to a model vendor is a "disclosure" needing separate consent, or "integral"; whether §312.5(c)(9) can ever apply to signed-in children.
9. Safari/Apple dictation as a third-party flow.
10. The publication model for child-authored content (drawings, voice) in public repositories.
11. Applicable state laws for the households' states; the UK AADC only if UK users are invited.
12. IP: a review of the agent rules in §6 against the full Tetris v. Xio opinion and later case law (the opinion was **not read** here).

---

## 10. Next steps

1. Kevin creates an Anthropic Console org and API key. Keep OAuth only for his own dev sessions.
2. Draft three short documents now (they are cheap): a **COPPA-style online notice with the retention table from §5**, a parental-consent flow with per-vendor toggles, and a one-page security program.
3. Build the MVP creative-input path entirely locally: canvas drawing, camera capture → jscanify crop → canvas re-encode (EXIF gone) → upload of the crop only → rembg/BiRefNet on our worker.
4. Ship text-first; enable on-device Chrome dictation; gate iPad voice on decision D3.
5. Ingest assets through an allowlist with provenance manifests; drop smplr's unlicensed samples and use VCSL.
6. Re-fetch the OpenAI usage policies (403 here) and the Anthropic AUP after 12 Nov 2026.

---

## 11. Decisions for Kevin

- **D1 — Credentials:** confirm an API-key-only backend (Kevin-paid) and drop the subscription-backed idea. BYOK for adults: yes or no?
- **D2 — Consent authority:** for the niece and nephew, will their **parents** create or approve the child accounts (needed for verifiable consent), with Kevin as admin only?
- **D3 — Child voice in MVP:** (a) text and on-device only, with no voice on iPad yet; (b) pursue OpenAI ZDR approval; (c) pursue ElevenLabs written approval. A and B can run in parallel.
- **D4 — AI art in MVP:** asset packs plus local drawing cleanup only (recommended), or wait for an approved generator?
- **D5 — Child-recorded dialogue and SFX:** allowed in private games only, or also publishable with parent opt-in?
- **D6 — Legal budget:** engage counsel for §9 items 6–8 before inviting any family beyond Kevin's own, or at all?
- **D7 — Google:** drop it entirely, or keep it as an adult-only research tool pending item 4?

*Not checked:* full OpenAI usage policies (403), the full Tetris opinion, bria-rmbg's model license, AssemblyAI/Speechmatics full terms, Apple's Web Speech data handling (secondary sources only), US state laws, and vendor prices.
