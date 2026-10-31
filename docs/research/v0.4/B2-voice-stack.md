# B2 — Voice stack (U02 / R03)

> **Scope note (2026-10-22):** Open Game Maker 2000 is a general, all-ages game maker. Parental controls apply only to child accounts, and under-18 vendor routing applies to teens. Where this report applies a child rule product-wide, B9 (legal) and B10 (product, incl. §8) rescope it.

Access date for all sources: 2026-10-21. Labels: **[V]** verified against the primary source today, **[I]** inferred, **[U]** unverified. **[aiur-R]** marks a fact taken from aiur's own dated research (`talk/research.md`, 2026-10-10, with primary URLs). I did not re-fetch those facts.

> **Version scope (2026-10-25):** Read this through `docs/spec/release-plan.md`. This report was written when child accounts were in V1, so most of its picks are driven by child-data rules. Those rules are now **V3** (child accounts only). **V1 (adults only, 18+):** voice is the aiur `voice_converse` package (an Elixir host, per the decision log), with **ElevenLabs first and OpenAI second**, a no-transcript mode, and narration rendered once and cached by content hash (§5.1 caching still applies). ElevenLabs' under-18 approval is not needed in V1, so the "Blocked" verdicts on ElevenLabs below apply only to minors. Gaps G2–G7 still apply to V1. **V2 (teens):** any vendor without approval for minors is off for teens (ElevenLabs approval, OpenAI ZDR). **V3 (child accounts):** self-hosted speech only (Kevin's pick), plus everything about child voice, COPPA, iPad dictation and the child-speech benchmark. **Changed:** D3's "TypeScript relay now" is superseded by Kevin's decision that voice is an aiur package regardless.

## 1. TL;DR

- aiur's reusable voice component **does not exist yet as something Game Maker can embed.** What runs today is an ElevenLabs-only speech-to-text (STT) and text-to-speech (TTS) seam inside the aiur app, tied to aiur's dashboard login. The standalone `voice_converse` package is a skeleton: 4 of 66 tickets are closed.
- **(V3)** Treat any **child's voice** as COPPA personal information. Of the vendors checked, only OpenAI (with *approved* zero data retention, ZDR) clearly permits it. Google generative AI and Gemini forbid under-18 services. ElevenLabs needs written approval. Microsoft, AWS, Deepgram and Cartesia have no child clause at all, so you would be relying on silence in their terms.
- **(V3; the V1 adult default is ElevenLabs then OpenAI through the aiur package, see the scope note)** Split the stack. **Narration** carries no child data: generate it at build time with self-hosted **Kokoro-82M** (Apache-2.0, has word timestamps, runs on CPU) and cache it by content hash. **Kid speech input** goes to a self-hosted STT on Railway first, with OpenAI under ZDR as the upgrade path.
- Build two-way scoping as a **cascade**: speech-to-text, then Claude, then TTS, using push-to-talk. Do not use a hosted speech-to-speech agent (a child-data rule; for V1 adults, ElevenLabs Agents or OpenAI speech-to-speech are allowed). That same cascade is a provider family aiur already plans for `voice_converse`.
- **Word highlighting:** Kokoro, Azure, Polly, ElevenLabs and Cartesia return timings. OpenAI TTS, OpenAI Realtime, GPT-Live and Gemini Live do not. Use sentence-level highlighting as the fallback.
- **Browser Web Speech is not a privacy fallback on iPad.** Safari appears to send audio to Apple (secondary sources only). Chrome is safe only with `processLocally = true` and an installed language pack.

## 2. The aiur voice component as it actually exists

**Built and running in the aiur app** (`~/github/everdred/aiur` main, `ad084b1f3`) [V, read from source]:

- `Aiur.Voice` (`src/lib/aiur/voice.ex`) is a provider-neutral seam. The provider is one module named in app config, and the default is `Aiur.ElevenLabs`.
  - `Transcriber` callbacks: `start(owner:)`, `push(base64 PCM16 16 kHz mono)`, `commit`, `stop`. It sends the owner `{:voice_transcript, :partial|:final, text}`, `{:voice_error, …}` and `{:voice_closed}`.
  - `Synthesizer.start(owner, text, opts)` streams back `{:voice_audio, :chunk|:done|:error}`.
  - `Provider` callbacks: `transcriber/0`, `synthesizer/0`, `child_specs/0`, `quota_snapshot/0`, `configured?/0`.
- **Only one provider exists: ElevenLabs.**
  - STT is Scribe `scribe_v2_realtime` over a server-held WebSocket (`realtime.ex`). It uses voice-activity commit, keeps the key in a header, and keeps the key out of process state.
  - TTS is `eleven_flash_v2_5` HTTP streaming at `pcm_44100` (`tts.ex`), limited to 16 KB of text, 8 MB of audio and 60 s.
  - It does **not** request timestamps or alignment.
- **Wire protocol.** The Phoenix socket `/voice` exposes topics `voice:dictation` and `voice:conversation`.
  - Client to server: `audio {data: base64}`, `stop`, `speak`.
  - Server to client: `transcript {kind, text}`, `error`, `stopped`, `audio {data, format: "pcm_44100"}`, `audio_done`, `audio_error`.
  - Connecting requires the aiur dashboard session plus a CSRF token. Limits are 2 sessions per authority, 8 globally, and 5 minutes of dictation.
  - The "conversation" topic is half-duplex. It submits the text to the worker agent and reads the reply aloud.
- **Privacy rules in code:** no audio written to disk or logs, and no text delivered to an agent by the voice layer itself.

**Package skeleton** (`packages/elixir/voice_converse`, merged in PR #4162) [V]:

- It contains `Config`, the ports `BriefingSource`, `AgentChannel`, `CommandSource` and `Credentials`, a `Briefing` struct, a redactor, and port deadlines of 100–300 ms.
- A CI job enforces zero dependencies on aiur.
- Defaults: 30-minute sessions, a 60 min/day cap, a 4,000-token context budget.
- **`transcript_root` is a required config field.**
- It has no sessions, no providers, no wire codec and no transport yet.

**Planned, not built** (MP-E6 plan §17–§20 on branch `research/refactor-findings`; epic #4083 has 62 of 66 sub-issues open) [V for the plan text and issue state]:

- Provider families:
  - speech-to-speech (OpenAI Realtime, GPT-Live, Gemini Live)
  - hosted agent (ElevenLabs Agents, the default)
  - cascade (STT → LLM → TTS, including browser speech)
  - text-only
- A transport-neutral session API, a `Wire` codec, and an optional local WebSock transport.
- A small browser JS client shipped in `priv/` (no npm package).
- The `talk` binary.
- Character timing normalized across providers, paced against the audio clock when the provider gives none.
- A rule that nothing reaches an agent without a human Confirm.
- `record_voice:false` is enforced, and provider conversations are deleted after each session.

**How Game Maker could embed it** [I]:

1. **Elixir sidecar on Railway.** Run `voice_converse` with Game Maker host ports. Game Maker's TypeScript backend mints a short-lived token, and the browser talks to the sidecar over the planned wire codec.
2. **TypeScript reimplementation** of the same wire frames in Game Maker's backend. This is A6's "small TS relay".
3. **Wait for MP-E6.**

Option 2 or a minimal version of option 1 is the only path to V1 that does not wait on 60+ aiur tickets. *Note (2026-10-25): Kevin decided voice is an aiur package regardless, with a thin `voice_converse` host as the only Elixir besides aiur. That makes option 1 the V1 path; option 2 is off.*

**Gaps that matter for Game Maker** [V from code and plan, consequences I]:

- **G1. (V2/V3 only; not a V1 gap for adults) No child-permitted provider.** The only adapter is ElevenLabs, and the planned default (ElevenLabs Agents) is barred for under-18 experiences without written approval.
- **G2. Transcripts.** `transcript_root` is required, and the plan says "full local transcripts" (D17). Spec §10.4 says full transcripts are *not* approved. Game Maker needs a no-store or ephemeral transcript mode, which `Config.privacy` does not offer.
- **G3. No alignment frame and no usage frame.** The current TTS drops timing data, and spec §7.2 requires usage reporting.
- **G4. No batch or narration path.** It has streaming TTS only: no "render line → file + timings", no cache key.
- **G5. Transport auth is tied to aiur's dashboard.** Game Maker needs its own token issuer, which the package's host-supplied transport allows by design.
- **G6. The language seam.** The component is Elixir and Game Maker is TypeScript. A TS port or a sidecar is unavoidable.
- **G7. The `Briefing` vocabulary.** It is generic enough for a game-scoping card (summary, questions, next_steps), but nobody has tested that.

## 3. Findings with sources

### 3.1 Permission to serve minors, retention, training

The minors clauses here apply from V2 (teens) and V3 (children). Retention and training facts apply in every version.

- **OpenAI.**
  - Serving minors under 18 requires "additional safeguards": age-appropriate disclosures, content filters, monitoring, and age assurance where needed.
  - Developers "should not use OpenAI services to process any personal data of children under 13 … without first implementing zero data retention." [V] https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance
  - ZDR "requires prior approval" through sales.
  - Abuse-monitoring retention by endpoint: `/v1/audio/transcriptions` none; `/v1/audio/speech` 30 days; `/v1/realtime` 30 days; `/v1/live/sessions` 30 days. All are ZDR-eligible, `/v1/live/sessions` "with limitations".
  - API data is not used for training by default. [V] https://developers.openai.com/api/docs/guides/your-data
- **ElevenLabs.** "Apps, products, or experiences directed at individuals under 18 are prohibited unless we have assessed and approved them in writing." Parental-consent records are required. The policy was updated 09 Oct 2026. [V] https://elevenlabs.io/use-policy. Zero Retention Mode is Enterprise-only (A8 V3). Once minors are users (V2+), this bars narration as well, because the game is the experience directed at minors [I]. In V1 (adults only) it does not apply.
- **Google Cloud.**
  - Generative AI Services §20(d): no use in a service "directed towards or is likely to be accessed by individuals under the age of 18." [V] https://cloud.google.com/terms/service-terms
  - Whether classic Cloud TTS/STT (Chirp) falls under "Generative AI Services" is **[U]**. The services list did not render.
  - Cloud STT does not log audio by default. [V] https://docs.cloud.google.com/speech-to-text/docs/data-logging
  - Gemini Live is out [V via §20(d)].
- **Microsoft Azure Speech.** For real-time STT, "audio input is processed only on the Azure's server memory, and no data is stored at rest." TTS is likewise "no data is persisted." [V] https://learn.microsoft.com/en-us/azure/ai-foundry/responsible-ai/speech-service/speech-to-text/data-privacy-security. No Azure Speech clause on children was found **[U]**.
- **AWS.**
  - §50.3: AWS "may use and store AI Content" from Polly and Transcribe to improve them. You can opt out with an Organizations AI-services policy, and opting out deletes the historical content.
  - The only child clause, §50.4, covers Amazon Lex. [V] https://aws.amazon.com/service-terms/ ; https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_ai-opt-out.html
- **Deepgram.** The account holder must be 18+. There is no child clause. "We may also use Your Content to improve our Services." You can opt out of training per request. No retention period is stated, and the license is "perpetual". [V] https://deepgram.com/legal/terms (updated 6 Aug 2026)
- **Cartesia.** The account holder must be 18+. There is no under-13 clause. Inputs and outputs may be used to train its models unless you opt out with a form, and the opt-out only applies going forward. No ZDR is mentioned. [V] https://cartesia.ai/legal/terms. That page says it was revised 14 Jun 2024, so it may be stale **[U]**.
- **COPPA (V3).** A child's voice in an audio file is personal information. The audio exception is narrow and very likely does not cover signed-in accounts (A8 V11, V13). Every vendor that receives child audio is a disclosure.

### 3.2 Word timings, latency, price

| Path | Word/char timing | Latency | Price |
|---|---|---|---|
| ElevenLabs TTS `stream/with-timestamps` or WebSocket | character [aiur-R] | Flash is low [aiur-R] | $0.04 per 1K characters (Flash) [aiur-R] |
| Cartesia Sonic | word + phoneme [aiur-R] | low [U] | [U] |
| Azure neural TTS | word-boundary events (A3) | [U] | not shown on the rendered page [U] |
| AWS Polly | speech marks, billed at the same rate (A3, [V]) | — | $16 per 1M characters neural, $30 generative [V] https://aws.amazon.com/polly/pricing/ |
| OpenAI `gpt-4o-mini-tts` | none [V: no field documented] | — | $0.60 per 1M text tokens in, $12 per 1M audio tokens out [V] |
| OpenAI Realtime / GPT-Live / Gemini Live | none; text deltas only [aiur-R] | speech-to-speech; no official figure | GPT-Live $0.05/min plus the backend model [V]; Gemini about $0.023/min [aiur-R] |
| Kokoro-FastAPI (self-hosted) | word timestamps (`/dev/captioned_speech`) [V] | CPU first chunk about 3.5 s on an older i7, under 1 s on an M3 [V] | compute only |
| OpenAI STT | word timestamps only on `whisper-1`, which shuts down 2027-02-26; `gpt-live-transcribe` is the live model [V] https://developers.openai.com/api/docs/guides/speech-to-text | streaming partials | [U] |
| ElevenLabs Scribe v2 realtime | timestamps on commit [aiur-R] | about 150 ms (vendor claim) | $0.39/h [aiur-R] |
| Cascade (STT → Claude Haiku → TTS) | from the TTS stage | about 1.5 s to first audio (Anthropic cookbook, Haiku 4.5) [aiur-R] | sum of the parts |

### 3.3 Self-hosted

- **Railway has no GPUs.** A forum quote says "We will not do GPUs now" (May 2026) [U, secondary] https://station.railway.com/feedback/plan-for-gpu-support-b9fddca5. Self-hosted therefore means CPU only.
- **Kokoro-82M.** Apache-2.0 code and weights [V] https://github.com/hexgrad/kokoro. The FastAPI wrapper (5.6k stars, has a CPU Docker image) returns word timestamps [V]. On CPU it fits **build-time** narration, where latency does not matter. Live replies would need a sentence-by-sentence pipeline [I].
- **Piper.** GPL-3.0 code, and each voice has its own license [V/U] https://github.com/OHF-Voice/piper1-gpl. No timestamps are documented.
- **VoxCPM2.** Apache-2.0, 2B parameters, about 8 GB VRAM, RTF 0.13–0.30 on an RTX 4090 [V] https://huggingface.co/openbmb/VoxCPM2. It needs a GPU, so it does not fit Railway.
- **OmniVoice.** The weights are **CC-BY-NC** (non-commercial) [V] https://huggingface.co/k2-fsa/OmniVoice. Exclude it.
- **STT options.** faster-whisper is MIT, runs int8 on CPU, and works in batch, which suits push-to-talk. Moonshine v2 is MIT, streams on CPU, and has a JS/WASM build [aiur-R]. Parakeet is CC-BY-4.0 and needs a GPU for speed [aiur-R].
- **Children's speech (V3).** Recognition of children aged 5–7 is worse for every ASR engine [I, general literature, not measured here]. Benchmark on real family recordings before picking an engine. Keep those recordings local and get consent.

### 3.4 Browser Web Speech

- **Recognition.** MDN: recognition is server-based by default. `processLocally = true` together with `available()` and `install()` keeps audio on the device in Chrome 139+ [aiur-R].
- **Safari and iPad.** `webkitSpeechRecognition` exists from iOS 14.5, but `available()` is unsupported [aiur-R]. Developer reports say Safari uses Apple's server recognizer and that Apple's on-device SpeechAnalyzer has no web surface [U, secondary] https://blog.addpipe.com/apple-speechanalyzer-api/. **On iPad (the main child device in V3) there is no verifiable on-device web dictation.**
- **`speechSynthesis`.** Free and on-device, but its boundary events are unreliable on iPad (A3). It is acceptable only as an offline fallback with sentence-level highlighting.

## 4. Options table

The verdicts below were judged on child-data posture, so they are the **V3** child-account view. For V1 adults, ElevenLabs (TTS, Scribe STT, Agents) and OpenAI are the decided providers, in that order.

| Need | Option | Child-data posture | Timing | Railway fit | Verdict |
|---|---|---|---|---|---|
| Narration (build time, no child data) | **Kokoro self-hosted** | no vendor | word | CPU OK | **Recommend** |
| | Azure neural TTS | no persistence [V] | word | API | Upgrade path for quality |
| | Polly | opt-out needed | word | API | Alternative |
| | OpenAI TTS | 30-day abuse retention; minors guidance | none, so needs a local aligner | API | Only with forced alignment |
| | ElevenLabs | written approval | character | API | Blocked |
| Kid speech input (STT) | **Self-hosted faster-whisper or Moonshine** | no vendor | — | CPU, batch | **Recommend for V1** |
| | OpenAI `gpt-live-transcribe` + ZDR | allowed after approval | — | API | Upgrade if accuracy is poor |
| | Azure real-time STT | no storage at rest [V]; no child clause [U] | — | API | Candidate, needs counsel |
| | Deepgram / Cartesia / AWS Transcribe | trains or stores by default | — | API | Not without contract terms |
| | Web Speech | Chrome local OK; iPad goes to Apple [U] | — | — | Chrome desktop only |
| Two-way scoping | **Cascade: STT above → Claude → Kokoro/Azure, push-to-talk** | child audio stays with us | from TTS | CPU OK | **Recommend** |
| | OpenAI GPT-Live/Realtime + ZDR | approval; Live is "with limitations" | none | API | Later, if approved |
| | ElevenLabs Agents (aiur's default) | barred | character | API | Blocked |
| | Gemini Live | barred under 18 [V] | none | — | Out |

## 5. Recommendation

**V1 adult default (2026-10-25):** two-way creation voice through the aiur `voice_converse` package, ElevenLabs first and OpenAI second, push-to-talk, with a no-transcript mode (G2). Narration uses the same providers, rendered once at build or publish time and cached as in item 1 below. Items 1, 4 and the frame list still apply to V1. The self-hosted parts (Kokoro, self-hosted STT, the cascade as the only path) and items 2 and 5 are **V3**, for child accounts.

1. **Narration pipeline (no child data).**
   - At game build or publish time, a Kokoro-FastAPI service on Railway renders each dialogue line to Opus plus word timings, producing A3's `SpokenText`.
   - Store each line under `sha256(normalized_text, voice_id, engine, engine_version, speed, lang)` (spec §9.7). A changed line or voice gives a new hash and a regeneration; an unchanged line is reused across publishes and forks.
   - Captions always show. Highlighting is word-level from the stored timings and falls back to sentence level.
   - Run the generator **outside** aiur's coding loop: deterministic first (spec §3.2).
2. **(V3) Kid input.**
   - Push-to-talk.
   - The browser streams PCM16 at 16 kHz, the same frame format as `Aiur.Voice.Transcriber`, to a Game Maker relay. The relay forwards it to a self-hosted STT on Railway.
   - Audio lives in memory only. The transcript is shown to the child to confirm. Nothing is stored beyond the structured request (spec §7.2).
   - Per-capability parental consent applies even with no vendor involved (A8 §4).
3. **Two-way scoping.**
   - The cascade: STT, then Claude (the existing Anthropic API key and its safeguards), then Kokoro streaming by sentence.
   - The agent proposes the structured plan; the host validates it.
   - Spoken text is always shown on screen.
4. **aiur fit.**
   - Mirror aiur's frames now: `audio`, `stop`, `transcript{partial|final}`, `audio`, `audio_done`, `error`. Add `alignment{words:[{w,t0,t1}]}` and `usage{provider,model,audio_ms|chars|tokens}`. Do this in a small TypeScript relay.
   - Feed these back to aiur as requests: G2 (a no-store transcript mode), G3 (alignment and usage frames), and adapters for a self-hosted `cascade` and for Azure/OpenAI-ZDR.
   - Switch to the `voice_converse` sidecar only once its session API and wire codec ship (C11-T02).
   - *Superseded (2026-10-25): voice is an aiur package from V1, not a TS relay first. The frame additions and G2/G3 requests still stand.*
5. **(V2/V3) Keep vendor approvals open in parallel at no cost:** OpenAI ZDR and Azure terms review. Use them if self-hosted STT accuracy on 5–7-year-olds fails the benchmark.

## 6. Decisions for Kevin

**D1. (V3) Where does a child's voice go?** *Kevin's pick: always the self-hosted provider; ElevenLabs and OpenAI for adults only. Deferred to V3 with child accounts.*

- (a) Self-hosted STT only (our Railway).
- (b) Apply for OpenAI ZDR and use OpenAI STT.
- (c) Azure Speech after counsel review.
- (d) Voice off for under-13s in V1; text and tap only.

**Recommended: (a), with (b) applied for in parallel.** No third-party disclosure means the simplest consent story.

Consequences: (a) costs CPU and may be less accurate for 5-year-olds. (b) depends on OpenAI approving the account, on an unknown timeline. (d) contradicts the core voice requirement.

**D2. Narration voice quality versus vendor exposure.**

- (a) Kokoro self-hosted.
- (b) Azure neural TTS (no persistence, word timings).
- (c) Seek ElevenLabs written approval for its premium voices.

**Recommended: (a).** It is free to run, Apache-licensed, has word timings and involves no vendor. Upgrade to (b) if Kokoro's 54 voices sound too flat in a family listening test.

Consequences: (c) adds an Enterprise contract and consent-record duties.

*Kevin's pick: ElevenLabs once approved; Kokoro until then. Since V1 is adults only, ElevenLabs needs no under-18 approval, so V1 narration reads as ElevenLabs. Kokoro stays the V3 fallback for minors.*

**D3. Embed aiur's component now or later?**

- (a) Game Maker TypeScript relay speaking aiur-compatible frames now; adopt `voice_converse` later.
- (b) Block V1 voice on MP-E6.
- (c) Contribute the child-safe adapters to `voice_converse` first.

**Recommended: (a).** MP-E6 is a skeleton, and its default provider is barred for minors.

Consequences: there will be two hosts until convergence, which matching frames keep cheap.

*Superseded (2026-10-25): Kevin decided voice is an aiur package regardless, plus a self-hosted provider and a no-transcript mode. The "barred for minors" reason no longer applies in V1.*

**D4. (V3) Authorize a small paid benchmark?** *Kevin's answer on all research spends: not yet. Child-speech accuracy no longer blocks V1.* It would cover child-speech word error rate (WER) across self-hosted, OpenAI and Azure on consented family clips, and a narration listening test.

- (a) Up to about $10.
- (b) Free/self-hosted arms only.

**Recommended: (a).** Accuracy for 5–7-year-olds is the biggest unknown, and the paid arms cost cents per clip.

Consequences: the clips are recordings of a child's voice and must be deleted afterwards.

## 7. Uncertainty

- Whether Google Cloud TTS/STT count as "Generative AI Services" [U]. Microsoft's and Cartesia's current child terms [U]. Cartesia's terms page may be stale.
- Safari/iPad Web Speech data flow (secondary sources only). iPadOS `speechSynthesis` boundary behavior (test on a device).
- CPU latency of faster-whisper or Moonshine on Railway, and their accuracy on children's speech: not measured.
- Azure and OpenAI STT per-minute prices: not rendered [U]. GPT-Live ZDR "with limitations": scope unknown.
- **(V3)** Whether COPPA applies to a free, family-only service, and whether self-hosted STT is still a "collection": needs counsel (A8 §4).
- aiur facts reflect `main` at `ad084b1f3` and the research branch at `e9785e0ee`. MP-E6 may change.
