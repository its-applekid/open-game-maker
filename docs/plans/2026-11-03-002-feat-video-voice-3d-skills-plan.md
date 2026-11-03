---
title: Video Voice and 3D Tool Skills - Plan
type: feat
date: 2026-11-03
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: github-issue-433
execution: code
---

# Video Voice and 3D Tool Skills - Plan

## Goal Capsule

- **Objective:** Evaluate the 14 named video, voice, caption, and 3D projects, then add only the locally viable jobs to the Game Maker skill pack.
- **Authority:** Issue #433 defines the tool candidates, no-spend boundary, local-model rule, and output locations; repository conventions govern skill packaging and validation.
- **Execution profile:** Research first, then add small routed skills and render short host-local examples.
- **Stop conditions:** Do not add provider keys, paid services, cloud asset uploads, agent MCP configuration, unapproved model downloads over 5 GB, or generation beyond a short test.
- **Tail ownership:** The implementation owns focused validation, full-diff review, PR evidence, and CI handoff.

---

## Product Contract

### Summary

The repository will gain a dated, source-linked disposition for all 14 tools and a small skill for each adopted job.
Each adopted skill will have one short MP4 or WAV rendered locally under ignored `assets-local/` and will fit the existing `gm-core` routing model.

### Problem Frame

The source list mixes engines, codecs, agent skills, MCP servers, local models, and download utilities.
Adopting the names wholesale would duplicate installed capabilities, introduce non-open or model-specific licenses, and blur the boundary between in-game agent work and operator tooling.

### Requirements

- R1. `docs/research/video-voice-3d-tools-2026-11-03.md` records the confirmed repository, license, local-host fit, user, overlap disposition, and one-line recommendation for every named tool.
- R2. Every recommendation distinguishes Game Maker agent use, build or showcase tooling, and tools that should not enter either path.
- R3. Adopted capabilities are grouped by job rather than by upstream project and are routed from `skills/gm-core/SKILL.md`.
- R4. Video work is local and deterministic, disables tool telemetry, uses no provider key, and validates the final MP4 with FFmpeg metadata plus MP4 atom-order checks.
- R5. Voiceover and caption work uses pinned local models only, preserves text as the caption source of truth, and requires explicit rights to any reference voice without imitating a real person who has not consented.
- R6. 3D authoring keeps asset provenance and pack rules intact, uses Blender for offline creation and the existing Three.js skills for runtime work, and does not modify MCP configuration.
- R7. Each adopted skill has one short local example under the writable library area `assets-local/sets/examples/` that is inspected or measured and never committed.

### Scope Boundaries

- Remotion's source-available company license and the unlicensed `remotion-dev/skills` repository are evaluated but not vendored.
- MCP servers may be documented for an operator to enable, but this change installs none into agent configuration.
- ComfyUI models and other large generative checkpoints are not downloaded or approved by this change.
- `yt-dlp` remains a user-directed reference-ingest tool, not a bulk downloader or an in-game agent dependency.

---

## Planning Contract

### Key Technical Decisions

- KTD1. Use telemetry-disabled HyperFrames 0.9.8 plus the installed FFmpeg 7.1.5 toolchain for `gm-video`; its Apache-2.0, HTML-native local renderer fits agents and avoids Remotion's entity-size license threshold.
- KTD2. Use CPU-only PyTorch and torchaudio 2.6.0 with Chatterbox source revision `5de7a54aa4e5e2baadb0182dde554908b48b85c2` (declared `chatterbox-tts==0.1.7`) and Chatterbox Nano revision `71ccd1d0081b430592cea481f4307e764e07bc64`, plus `faster-whisper==1.2.1`, `av==16.0.1`, and `Systran/faster-whisper-tiny.en` revision `0d3d19a32d3338f10357c0889762bd8d64bbdeba`, for `gm-voiceover`; both codebases and the selected model weights are MIT, Nano is documented for CPU inference, and Whisper provides local caption timing.
- KTD3. Use Blender CLI plus the already-vendored Three.js guidance for `gm-3d`; the optional community Blender MCP is documented but left for the operator to enable.
- KTD4. Keep Playwright, `gm-verify`, and the existing showcase renderer authoritative for visual acceptance; Chrome DevTools MCP and Impeccable do not replace deterministic repository gates.
- KTD5. Add original first-party skill documents instead of copying upstream skill repositories, so the shipped guidance is short, license-clear, and specific to Game Maker's offline and asset-rights rules.

### Sequencing

The research disposition fixes the adopted set before skill text is written.
The skill router and contract tests land with the new skill directories, then the host-local examples prove the documented paths without entering Git.

### Risks and Dependencies

- Chatterbox installation and its approximately 3 GB Nano repository may be slow; seed the official CPU-only PyTorch wheels before installing the pinned source so the no-GPU host does not resolve CUDA packages.
- HyperFrames is active and version-sensitive; the example and skill pin the evaluated 0.9.8 release rather than `latest`.
- Third-party JavaScript, Python, and model inputs are pinned and run in task-local scratch environments; downloading a pin is evidence gathering, not permission to install persistent agent configuration.
- Model and framework licenses do not cover source media; the skills require provenance and voice-reference permission independently of code licenses.

---

## Implementation Units

### U1. Tool disposition research

- **Goal:** Produce the source-linked recommendation matrix for all 14 candidates.
- **Requirements:** R1, R2 and the scope boundaries.
- **Dependencies:** None.
- **Files:** `docs/research/video-voice-3d-tools-2026-11-03.md`.
- **Approach:** Prefer project repositories, official documentation, package registries, and publisher model cards; record observed host versions and explain every overlap winner.
- **Patterns to follow:** `docs/research/v0.4/B14-skill-sourcing.md` for evidence labels, concise dispositions, and license caution.
- **Test scenarios:** Test expectation: none -- this is a dated research artifact whose claims are checked against linked primary sources.
- **Verification:** All 14 rows are present, every row has a recommendation, and the adopted-skill section matches U2.

### U2. Job-focused Game Maker skills

- **Goal:** Add `gm-video`, `gm-voiceover`, and `gm-3d` as short, routed, safety-bounded skills.
- **Requirements:** R3 through R6 and KTD1 through KTD5.
- **Dependencies:** U1.
- **Files:** `skills/gm-video/SKILL.md`, `skills/gm-voiceover/SKILL.md`, `skills/gm-3d/SKILL.md`, `skills/gm-core/SKILL.md`, `packages/gm-cli/test/gm-tool-skills.test.ts`, `packages/gm-cli/test/gm-core.test.ts`.
- **Approach:** Keep each skill below the existing short-skill budget, name exact local tools and output gates, and encode cloud, rights, model-size, and MCP boundaries where agents will see them.
- **Patterns to follow:** `skills/gm-audio/SKILL.md`, `skills/gm-asset-showcase/SKILL.md`, and `packages/gm-cli/test/gm-core.test.ts`.
- **Test scenarios:**
  1. The skill-pack contract test discovers all three new `SKILL.md` files and their `gm-core` router rows.
  2. The video skill names the pinned renderer, telemetry opt-out, local-only path, and H.264/yuv420p/faststart verification contract.
  3. The voiceover skill names Chatterbox Nano, CPU-only PyTorch, faster-whisper, caption text authority, voice rights, and the 5 GB approval gate.
  4. The 3D skill names Blender CLI, existing Three.js skills, provenance checks, and the no-MCP-config boundary.
- **Verification:** Focused Vitest, lint, typecheck, and Prettier checks pass, and removing any new skill causes its contract assertion to fail.

### U3. Host-local worked examples

- **Goal:** Render and verify one short ignored artifact for each adopted skill.
- **Requirements:** R7 plus KTD1 through KTD3.
- **Dependencies:** U2.
- **Files:** `assets-local/sets/examples/gm-video/video.mp4`, `assets-local/sets/examples/gm-voiceover/voiceover.wav`, `assets-local/sets/examples/gm-voiceover/captions.srt`, `assets-local/sets/examples/gm-3d/turntable.mp4`.
- **Approach:** Render a tiny HyperFrames 0.9.8 composition, synthesize a short line from Chatterbox Nano's bundled synthetic conditionals and transcribe it with pinned faster-whisper, and render a procedural Blender turntable before encoding it with FFmpeg.
- **Execution note:** Limit every generation to a short test and do not download a model repository over 5 GB.
- **Test scenarios:**
  1. FFprobe reports playable duration, H.264 video, and yuv420p pixels for both MP4s; an MP4 atom-order inspection confirms `moov` precedes `mdat`.
  2. FFprobe reports a non-empty PCM WAV, and faster-whisper emits a non-empty caption file matching the scripted line closely enough for manual review.
  3. The 3D frames contain the procedural object from multiple angles without licensed source assets.
- **Verification:** The outputs exist only under ignored `assets-local/`, their metadata passes the skill gates, and the three examples are named in the research document without being staged.

---

## Verification Contract

| Gate | Scope | Done signal |
|---|---|---|
| Focused tests | `packages/gm-cli/test/gm-core.test.ts`, `packages/gm-cli/test/gm-tool-skills.test.ts`, `packages/gm-cli/test/skills-sync.test.ts` | New skill routing, content contracts, and install discovery pass. |
| Package quality | `@ogm/gm-cli` lint and typecheck | Changed TypeScript test code meets repository rules. |
| Formatting | Changed plan, research, skill, and test files | Prettier reports no changes. |
| Media evidence | Three primary outputs under `assets-local/sets/examples/` | FFprobe, MP4 atom-order, and caption inspection meet U3 without staging local media. |
| Review | Full branch diff against `main` | `ce-code-review` reports no blocking findings. |

---

## Definition of Done

- The research document has a source-backed recommendation for all 14 tools and explains every overlap choice.
- `gm-core` routes to three short first-party skills whose boundaries match the research.
- Focused automated checks pass and each new test is proven to fail without the corresponding skill change.
- Three short worked examples are rendered and verified under ignored `assets-local/` without paid APIs, provider keys, cloud uploads, or oversized model downloads.
- The diff contains no abandoned experiments, generated media, secrets, MCP configuration, or unrelated changes.
