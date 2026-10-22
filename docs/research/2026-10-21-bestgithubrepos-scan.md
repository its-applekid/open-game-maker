# r/BestGitHubRepos scan + OpenPencil evaluation

Date: 2026-10-21 · Status: **awaiting owner review** (no decisions made)

Stats verified with `gh api` on 2026-10-21. Verdicts are based on GitHub metadata and READMEs only; nothing was installed or run.

## How the scan was done

- Source: the RSS feeds for the subreddit's top posts. The JSON endpoints returned 403 and old.reddit returned redirects.
  - `https://www.reddit.com/r/BestGitHubRepos/top/.rss?t=all|year|month&limit=100`, plus a second all-time page.
- About 200 unique posts. The subreddit is young: the all-time, year and month top lists are about 97% the same posts.
- **Star counts there are weak evidence.** Several featured repos grew implausibly fast:
  - morluto/rea: 358k stars in about 6 months;
  - wheresryan22/anatomy: 18.6k stars in 2 weeks;
  - lexmount/moli: 20k stars in 2 months.

## OpenPencil — skip as a dependency

[Reddit post](https://www.reddit.com/r/BestGitHubRepos/comments/1xbx1pe/openpencil_the_worlds_first_opensource_ainative/). The post matches [ZSeven-W/openpencil](https://github.com/ZSeven-W/openpencil). A different project, [open-pencil/open-pencil](https://github.com/open-pencil/open-pencil), has almost the same name.

| | ZSeven-W/openpencil | open-pencil/open-pencil |
|---|---|---|
| Stars | 6,349 | 9,174 |
| Contributors | 15 (2 do ~all commits) | 45 |
| Created | 2026-02-17 | 2026-02-27 |
| License | MIT | MIT |
| Open issues | 25 | 141 |

**What it is:**
- An AI-native vector UI design editor, a Figma-like clone of the paid Pencil.dev.
- You prompt and agents lay out the screen.
- It ships an MCP server for Claude Code and an `op` CLI.
- It exports React/Tailwind, HTML and Vue, and has a read-only embeddable viewer.

**Fit for our needs:**
- **Kids' drawing tool:** no. It's precision layout, not freehand. Stay with perfect-freehand or Excalidraw.
- **Edit-mode knobs overlay:** no. It has no game runtime, and its SDK is view-only.
- **Designing the platform's own UI (Create wizard, Play wall):** maybe. It would be a dev-time tool only, never shown to kids. If we try one, prefer open-pencil/open-pencil (more contributors, a web app with nothing to install).
- **Game assets:** no. It only produces UI.

**Risks:**
- ZSeven has a bus factor of 2.
- Both projects are 8 months old, and the file format is still changing.
- "World's first" marketing, and the README opens with paid ads for AI API resellers.
- Star inflation hasn't been ruled out.

## Candidates

| Name | Repo | Stars | License | Need | Verdict |
|---|---|---|---|---|---|
| rembg | [danielgatis/rembg](https://github.com/danielgatis/rembg) | 25.2k | MIT | Photo of a paper drawing → sprite (background removal) | **Adopt.** Mature (2020), runs server-side. The in-browser alternative, imgly, is AGPL, so avoid it. |
| OpenSpec | [Fission-AI/OpenSpec](https://github.com/Fission-AI/OpenSpec) | 72.7k | MIT | Kid's idea → spec the agents build from | **Trial.** Overlaps with the CE brainstorm/plan skills and aiur. Use it only if those are too heavy for kid-sized requests. |
| Caveman | [JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman) | 114k | Apache-2.0 | Token cost (shorter agent output) | **Trial.** Began as a joke repo, so measure the savings before relying on it. |
| MCP for Blender | [ahujasid/mcp-for-blender](https://github.com/ahujasid/mcp-for-blender) | 31.9k | MIT | Agent-built low-poly models exported to glTF | Consider. Needs Blender running on the server. |
| VoxCPM | [OpenBMB/VoxCPM](https://github.com/OpenBMB/VoxCPM) | 39.7k | Apache-2.0 | Local TTS and character voices | Consider. Needs a GPU. |
| OmniVoice | [k2-fsa/OmniVoice](https://github.com/k2-fsa/OmniVoice) | 15.5k | Apache-2.0 | Local TTS | Consider. An alternative to VoxCPM, not an addition. |
| OpenUI | [thesysdev/openui](https://github.com/thesysdev/openui) | 12.9k | MIT | Agent-generated UI | Consider. React-centric; Tweakpane/Leva may already cover it. |
| Tabler Icons | [tabler/tabler-icons](https://github.com/tabler/tabler-icons) | 22.4k | MIT | UI icons | Consider. A plain, solid icon set. |
| OmniRoute | [diegosouzapw/OmniRoute](https://github.com/diegosouzapw/OmniRoute) | 79.5k | MIT | Routing calls to cheap models | Caution. Stars look inflated; LiteLLM is the safer default. |
| Mesh Avatar Studio | [shinshin86/mesh-avatar-studio](https://github.com/shinshin86/mesh-avatar-studio) | 961 | MIT | One drawing → animated WebGL character | Watch. Exactly the concept we want, but under 1k stars and 3 weeks old. |

## Skipped

- **REA:** reverse-engineers binaries, far deeper than shallow "make it like X". Its star count isn't credible.
- **token-optimizer:** a custom license, not permissive.
- **anti-slop / Taste Skill:** push an adult "premium" look, not kid-friendly UI.
- **Agent workflow packs** (gstack, mattpocock/skills, addyosmani/agent-skills, The Agency): overlap with aiur and the CE skills.
- **Agent memory tools** (Hindsight, agentmemory, Cognee): not a current need.
- **Browser agents** (jev-ultrafast, Moli): new and hyped. Playwright stays our playtest base.
- **Desktop STT apps** (Handy, CrispASR, OpenWhispr): not browser components.
- **AI music generators** (YuE2 Studio, audio.cpp): Tone.js and BeepBox already cover music.
- **Native or Rust game ports:** inspiration only.
- **Alternative auth** (Keycloak, Authelia, Pocket ID): we already chose Better Auth.
- **UniMate, MCP for Unity, Project AIRI, FreeLLMAPI, gods-eye-view:** the wrong fit.
- **About 150 off-topic posts.**

## Open for owner

- Try OpenSpec vs CE brainstorm/plan on a real kid game idea?
- Measure Caveman's token savings on a feature build?
- Is a dev-time UI mockup tool (open-pencil) wanted at all, or is Claude Design enough?
