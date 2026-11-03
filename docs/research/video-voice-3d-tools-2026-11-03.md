# Video, voice, and 3D tool evaluation

- **Checked:** 2026-11-03
- **Host:** Linux, Node 24.14, FFmpeg 7.1.5, Blender 4.3.2, Chromium, 12 CPU cores, 31 GiB RAM, no detected NVIDIA GPU
- **Boundary:** no paid API, provider key, cloud asset upload, or persistent MCP configuration

This is a source and host-fit evaluation, not approval to copy arbitrary upstream files. Project licenses cover their
code or model weights, not the rights to input voices, images, music, video, or downloaded references.

## Recommendation matrix

| Tool | Confirmed source and license | Local-host fit and overlap | User | One-line recommendation |
|---|---|---|---|---|
| Remotion Skills | [`remotion-dev/skills`](https://github.com/remotion-dev/skills); GitHub reports no detected license and the repository has no root license file | Guidance is coupled to Remotion and duplicates the smaller job-specific skill proposed below | Neither | **Do not adopt or copy:** the repository has no confirmed reuse license and its workflow inherits Remotion's licensing decision. |
| Remotion | [`remotion-dev/remotion`](https://github.com/remotion-dev/remotion); [special source-available license](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md), free for individuals, nonprofits, and for-profit entities with three or fewer people but otherwise requiring a company license | Runs locally, but overlaps local HTML-to-video rendering and introduces an entity-size license boundary | Neither | **Do not adopt:** HyperFrames covers the short local-render job under Apache-2.0 without Remotion's company-size threshold. |
| HyperFrames | [`heygen-com/hyperframes`](https://github.com/heygen-com/hyperframes), Apache-2.0; evaluated release `0.9.8` | Requires Node 22+ and FFmpeg, both present; renders deterministic HTML/CSS locally, but CLI telemetry is enabled unless `HYPERFRAMES_NO_TELEMETRY=1` or another documented opt-out is set | Game Maker agents | **Adopt in `gm-video`:** pin `hyperframes@0.9.8`, disable telemetry, and validate the final FFmpeg output. |
| GSAP | [`greensock/GSAP`](https://github.com/greensock/GSAP), [GSAP Standard “no charge” license](https://gsap.com/community/standard-license/) rather than an OSI license | HyperFrames supports it, but the license restricts use in no-code visual-animation builders that compete with Webflow; CSS/Web Animations cover ordinary motion without that ambiguity | Neither by default | **Do not adopt by default:** use GSAP only after a ticket explicitly confirms that the planned use fits its current license. |
| FFmpeg | [`FFmpeg/FFmpeg`](https://github.com/FFmpeg/FFmpeg), mainly LGPL with optional GPL parts; see [FFmpeg legal](https://ffmpeg.org/legal.html) | Installed as 7.1.5; the host build enables GPL components, so distribution must be evaluated separately from running the host executable | Game Maker agents and showcase tooling | **Adopt as the media gate:** encode and inspect local outputs, while keeping generated binaries and paid-pack media out of Git and cloud services. |
| Blender | [`blender/blender`](https://github.com/blender/blender), GPL-3.0 | Installed as 4.3.2; headless Python and Eevee work locally without a provider key | Game Maker agents and asset tooling | **Adopt in `gm-3d`:** use deterministic Blender CLI scripts for procedural meshes, GLB preparation, stills, and short turntables. |
| Blender MCP | [`ahujasid/mcp-for-blender`](https://github.com/ahujasid/mcp-for-blender), MIT (the old `blender-mcp` name redirects here) | Requires a Blender add-on, a local socket, and MCP client configuration; it overlaps safer checked-in CLI scripts and can execute arbitrary Blender Python | Operator tooling only | **Document, do not install:** an operator may explicitly enable it for interactive work, but agents must not edit MCP configuration or rely on it in builds. |
| Three.js | [`mrdoob/three.js`](https://github.com/mrdoob/three.js), MIT | Already pinned in the workspace at `0.186.1`, with vendored Three.js skills; it is the runtime renderer, not an offline authoring replacement | Game Maker agents | **Keep the existing adoption:** route runtime scene work to the vendored Three.js skills and offline creation to Blender. |
| Chrome DevTools MCP | [`ChromeDevTools/chrome-devtools-mcp`](https://github.com/ChromeDevTools/chrome-devtools-mcp), Apache-2.0 | Official support targets Google Chrome or Chrome for Testing, while this host has Chromium; telemetry is enabled by default unless disabled, and Playwright already drives repository verification | Operator tooling only | **Do not adopt now:** Playwright plus `gm-verify` remains the deterministic acceptance path; document the MCP only as an optional operator debugger. |
| faster-whisper | [`SYSTRAN/faster-whisper`](https://github.com/SYSTRAN/faster-whisper), MIT; evaluated package `1.2.1` | Supports CPU inference, uses PyAV rather than requiring system FFmpeg, and the pinned tiny English model is small enough for a short local caption test; its open-ended `av>=11` constraint is incompatible with PyAV 19's removed `metadata_errors` argument | Game Maker agents | **Adopt in `gm-voiceover`:** pin `faster-whisper==1.2.1`, `av==16.0.1`, and model revision `0d3d19a32d3338f10357c0889762bd8d64bbdeba` for local draft timings. |
| Chatterbox | [`resemble-ai/chatterbox`](https://github.com/resemble-ai/chatterbox), MIT; [Chatterbox Nano model card](https://huggingface.co/ResembleAI/chatterbox-nano), MIT | Nano is a 110M CPU-oriented model whose repository is about 3 GB, below the ticket's 5 GB approval gate; the PyPI `0.1.7` wheel predates Nano, and a clean no-GPU environment must seed CPU-only PyTorch before resolving its dependencies | Game Maker agents | **Adopt Nano only in `gm-voiceover`:** pin source revision `5de7a54aa4e5e2baadb0182dde554908b48b85c2`, CPU-only PyTorch and torchaudio 2.6.0, and Nano revision `71ccd1d0081b430592cea481f4307e764e07bc64` for short, consented local voice tests. |
| Impeccable | [`pbakaus/impeccable`](https://github.com/pbakaus/impeccable), Apache-2.0 | Its design linting and installer overlap the fixed prototype, project-specific visual rules, and `gm-verify`; installing its engine would add an unrelated moving surface | Neither | **Do not adopt:** preserve prototype fidelity and use the repository's existing visual checks rather than a generic design-opinion layer. |
| ComfyUI | [`Comfy-Org/ComfyUI`](https://github.com/Comfy-Org/ComfyUI), GPL-3.0 | The application can run locally and offline, but useful model licenses and sizes are separate, this host has no detected NVIDIA GPU, and no audited model set is in scope | Neither | **Defer:** adopt only after a ticket selects rights-cleared local models, verifies their size and license, and defines a viable host profile. |
| yt-dlp | [`yt-dlp/yt-dlp`](https://github.com/yt-dlp/yt-dlp), Unlicense | Not installed; useful for explicit reference intake but unnecessary for generation, and site/source rights remain independent of the tool license | Operator tooling only | **Keep user-directed only:** use it only when Kevin points to a specific reference and confirms the intended use; never crawl or bulk-download. |

## Overlap decisions

- **Video rendering:** HyperFrames owns small scripted compositions. The existing asset-showcase renderer still owns
  its pre-rendered set reels, and Playwright still owns browser interaction and visual evidence. Remotion is not a
  fallback.
- **Animation:** CSS and Web Animations are the default. GSAP needs explicit ticket-level license clearance and is
  not a repository-wide dependency.
- **Voice:** Chatterbox Nano is for local synthetic draft voice. It does not replace a product narration service or
  authorize ElevenLabs/provider calls. Text remains the caption source of truth; faster-whisper checks timing and
  intelligibility rather than rewriting the script.
- **3D:** Blender owns offline authoring and export; Three.js owns runtime rendering. Blender MCP is an optional
  interactive operator bridge, not an agent prerequisite.
- **Verification:** `gm-verify`, Playwright, FFmpeg/FFprobe, and file-level checks remain authoritative. Chrome
  DevTools MCP and Impeccable do not replace the repository gates.

## Skills added

- `gm-video`: make a short deterministic composition with pinned, telemetry-disabled HyperFrames, encode locally,
  and verify H.264, `yuv420p`, duration, and `moov`-before-`mdat` fast-start structure.
- `gm-voiceover`: make a short consented local draft with pinned Chatterbox Nano, preserve the script, and obtain
  draft caption timings with pinned faster-whisper.
- `gm-3d`: author procedural or rights-cleared assets through Blender CLI, then hand runtime scene work to the
  existing Three.js skill set.

Each skill has a worked example under the writable ignored library area `assets-local/sets/examples/`: `gm-video/video.mp4`,
`gm-voiceover/voiceover.wav` plus `captions.srt`, and `gm-3d/turntable.mp4`. These local evidence files are never
committed. Model downloads over 5 GB or generation beyond a short test require Kevin's approval before starting.

## Local verification

- HyperFrames 0.9.8 rendered the three-second 640x360 title card locally with telemetry disabled. Its own check
  reported no lint, runtime, layout, motion, contrast, or craft errors. FFprobe reported H.264 and `yuv420p`; top-level atoms were
  `ftyp, moov, free, mdat`. A middle frame was visually inspected.
- Chatterbox Nano revision `71ccd1d0081b430592cea481f4307e764e07bc64` occupied 2.8 GB and generated a
  2.64-second mono 24 kHz PCM WAV with CPU-only PyTorch and torchaudio 2.6.0 from its bundled synthetic conditionals. faster-whisper tiny English
  revision `0d3d19a32d3338f10357c0889762bd8d64bbdeba` transcribed the approved line exactly. Audio playback was not
  available in the issue workspace and is not claimed.
- Blender 4.3.2 rendered 36 procedural Workbench frames headlessly. FFmpeg encoded a 1.5-second 360x360 H.264,
  `yuv420p`, fast-start MP4; frames 1, 18, and 30 were visually inspected and showed distinct angles, the complete
  object, and all diagnostic markers.
