# B1 — Provider credentials for the hosted game builder (U01)

Spike: **U01** (spec v0.4 §8.1, §10.6, §14.1). Research only. Sources accessed **2026-10-21**. Nothing was bought, signed up for, sent to a vendor, or committed. This report builds on A8 (V17–V19) and A6 (§5, §15) and rechecks the primary sources behind them.

Labels: **Verified** means I read it in the primary source today. **Inferred** is my reading of verified text. **Unverified** means I could not reach the source or it does not say.

> **Version scope (2026-10-25):** Read this through `docs/spec/release-plan.md`. **V1:** §1–§4 apply as written for adults: API keys only, paid by Kevin, through hosted aiur profiles; a separate hosted aiur instance; no subscription logins. V1 is adults only (18+), so each vendor's ordinary adult terms apply and the minors rules (AN10, OA3 parental consent, OA6 ZDR) do not. **V2:** teens bring back the under-18 rules (AN10, OA3, OA7); bring-your-own provider credentials (D4) is V2. **V3:** under-13 data and OpenAI ZDR (OA6) apply only to child accounts. **Changed since this report:** Kevin's "Build Agent SDK worker now" pick for D1 is superseded: hosted builds use aiur with API-key profiles and build nothing new. His pick for the sandbox coding agent is aiur's own tool loop with Kimi, DeepSeek or OpenRouter models (awaiting confirmation; see option G). Admins set spending limits; the plan sets only defaults (D3).

## 1. TL;DR

- **No subscription may power the hosted multi-user builder.** That covers Claude Free, Pro, Max, Team and Enterprise sign-in, and ChatGPT Plus, Pro and Business sign-in for Codex. Anthropic says so in plain words. OpenAI's terms ban account sharing and programmatic extraction of output. Keeping the credential on the server does not change this.
- **API keys paid by Kevin are allowed** under both vendors' business terms: Anthropic's Commercial Terms and OpenAI's Services Agreement. Both require extra safeguards when minors use the product. That matters from V2 (teens); V1 is adults only.
- **New since A8:** Anthropic's Claude Code page has a clause for *hosting Claude Code* in your own product: "Customers may not pay for… Claude usage on their end users' behalf." aiur's Claude backend runs the Claude Code CLI. The Agent SDK route, which runs the same binary, is explicitly allowed for products used by end users. Until Anthropic confirms in writing, treat **aiur + Claude Code CLI + Kevin's API key for family jobs** as unconfirmed.
- **Kevin's own development sessions can stay on his Max and ChatGPT subscriptions.** Hosted jobs must never fall back to those profiles.
- **Cost gap (estimate):** at the §8.6 sizes, a medium family month (4 new games and 40 features) costs about **$190 on the API**. One Max 20x seat costs about **$200**. The API is cheaper at light use and about 2.4× at heavy use. This is not the order-of-magnitude gap Kevin expects. The token mixes behind these numbers are unmeasured.
- **What Kevin still has to decide:** which hosted Claude path to take, whether to add Codex as a second API-key provider, and the dollar cap (U08).

## 2. Findings with sources

### 2.1 Anthropic

| # | Finding | Status | Source |
|---|---|---|---|
| AN1 | "Anthropic does not permit third-party developers to offer Claude.ai login into their own applications, or to route requests through Free, Pro, or Max plan credentials on behalf of their users." Developers "may not collect, store, or intermediate Claude.ai credentials or session tokens." | Verified | https://code.claude.com/docs/en/legal-and-compliance ("Authentication and credential use") |
| AN2 | OAuth "is intended exclusively for purchasers of Claude Free, Pro, Max, Team, and Enterprise subscription plans and is designed to support ordinary use of Claude Code and other native Anthropic applications." Team and Enterprise are covered by the same OAuth limits as consumer plans. | Verified | same |
| AN3 | Developers building products, "including those using the Agent SDK, should use API key authentication." Customers may configure their own API key "for use by the customer's own authorized users — provided the resulting usage is billed to the key owner … and is not resold or intermediated." | Verified | same |
| AN4 | **Hosting Claude Code:** "preinstalling or running Claude Code in your products or services (e.g. in hosted sandboxes or other agent infrastructure)" requires the Commercial Terms, an unmodified binary, and that "Customers may not pay for, resell, or intermediate Claude usage on their end users' behalf. Each end user must authenticate with their own Anthropic API key, Claude subscription plan credentials, or 3P inference provider credential." The page adds "Unless we've mutually agreed otherwise" and points to sales. | Verified | same ("Can customers offer Claude Code in their products?") |
| AN5 | Agent SDK: "Use of the Claude Agent SDK is governed by Anthropic's Commercial Terms … including when you use it to power products and services that you make available to your own customers and end users." It is "A library that runs the Claude Code binary." "Unless previously approved, Anthropic does not allow third party developers to offer claude.ai login or rate limits for their products." | Verified | https://code.claude.com/docs/en/agent-sdk/overview |
| AN6 | AN4 and AN5 conflict for aiur. Read literally, AN4 says aiur running `claude` headless for family jobs on Kevin's key is a hosted Claude Code product that Kevin pays for on end users' behalf. AN3 (the authorized-users carve-out) and AN5 point the other way. The AN4 clause seems aimed at exposing *Claude Code itself* to end users. Game Maker users never see Claude Code; they see the game builder. Only Anthropic can settle this. | Inferred | AN3–AN5 |
| AN7 | Commercial Terms allow powering "products and services Customer makes available to its own customers and end users". There is no resale "except as expressly approved". The Commercial Terms have no age clause. "Customer is responsible for all activity under its account." | Verified (rechecks A8 V19) | https://www.anthropic.com/legal/commercial-terms (effective 17 Jun 2025) |
| AN8 | Consumer Terms: 18+. "You may not share your Account login information… or make your Account available to anyone else." Automated access is banned "Except when you are accessing our Services via an Anthropic API Key". | Verified (rechecks A8 V17) | https://www.anthropic.com/legal/consumer-terms (effective 8 Oct 2025) |
| AN9 | Claude accounts: "We require all users to be at least 18 years old to create and use a Claude account." Whether this covers Team or Enterprise seats is not stated. | Verified / Team seats unverified | https://support.claude.com/en/articles/13117299 (16 Mar 2026) |
| AN10 | AUP: a minor is anyone under 18. Products serving minors "must comply with the additional guidelines". These include disclosing that users are talking to an AI, plus safety measures and legal compliance. There is no age floor for API products. | Verified (rechecks A8 V18) | https://www.anthropic.com/legal/aup (effective 12 Nov 2026); https://support.claude.com/en/articles/9307344 (16 Mar 2026); https://support.claude.com/en/articles/15591275 (26 Jun 2026) |
| AN11 | "Advertised usage limits for Pro and Max plans assume ordinary, individual usage of Claude Code and the Agent SDK." | Verified | legal-and-compliance page |
| AN12 | Anthropic also offers **Managed Agents**: a hosted agent harness on the Claude API, billed at API rates. It is another clean API-key route. | Verified (existence only) | agent-sdk overview comparison table |

### 2.2 OpenAI (Codex)

| # | Finding | Status | Source |
|---|---|---|---|
| OA1 | Codex supports "Sign in with ChatGPT for subscription access" and "Sign in with an API key for usage-based access". Both are described as ways "for a person to sign in". "API keys are still the recommended default for automation." "Don't expose Codex execution in untrusted or public environments." | Verified | https://learn.chatgpt.com/docs/auth (redirected from developers.openai.com/codex/auth; undated) |
| OA2 | Consumer Terms of Use (ChatGPT, for individuals): 13+, and under-18s need parent or guardian permission. "You may not share your account credentials or make your account available to anyone else". Users may not "Automatically or programmatically extract data or Output". | Verified via Wayback snapshot dated 2026-10-21 (openai.com returns 403 to direct fetches) | https://openai.com/policies/terms-of-use/ (effective 1 Jan 2026) |
| OA3 | The Services Agreement covers "OpenAI's APIs, ChatGPT Enterprise, ChatGPT Business". The grant: "use OpenAI's API to integrate the Services into Customer Applications and to make Customer Applications available to End Users". "Customer will not share … individual login credentials between multiple users." End User Accounts are for "a single End User". Customers may not "allow minors to use OpenAI Services without consent from their parent or guardian." | Verified (Wayback, 2026-10-21) | https://openai.com/policies/services-agreement/ (effective 1 Jan 2026) |
| OA4 | OpenAI has **no** clause matching Anthropic's AN1 about subscriptions in third-party apps. The result is the same anyway. A ChatGPT Plus or Pro login serving family members breaks OA2. A Business seat shared by several users breaks OA3. The only grant for building an end-user product is the **API**. | Inferred | OA2, OA3 |
| OA5 | Codex "access tokens" are for ChatGPT Enterprise workspaces and are "intended for trusted scripts, schedulers, and private CI runners." They are not a route for serving end users. | Verified | learn.chatgpt.com/docs/auth |
| OA6 | Under-13: "You should not use OpenAI services to process any personal data of children under 13 … without first implementing zero data retention in our API." ZDR needs OpenAI's prior approval, per A8 V6. | Verified (guidance page, undated); approval part from A8 | https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance |
| OA7 | Usage Policies: protect minors (no age-inappropriate content and so on). There is no extra credential rule. | Verified (Wayback) | https://openai.com/policies/usage-policies/ (effective 29 Oct 2025) |
| OA8 | I found no Codex-specific limit on hosting Codex the way AN4 limits hosting Claude Code. Service Terms §4 only covers licensing of code output. | Verified (absence, in Service Terms) / Inferred | https://openai.com/policies/service-terms/ (Wayback) |

### 2.3 How aiur routes credentials (read-only, aiur `ad084b1f3`)

- **Backends** (`src/lib/aiur/coding_agent/registry.ex`): `codex` (the default), `claude` (headless Claude Code CLI), `claude-repl` (Claude Code in tmux), `muse`, and OpenAI-compatible `kimi`, `deepseek` and `openrouter` (`open_ai_compat/registry.ex`). Verified.
- **Claude:** each profile is a `CLAUDE_CONFIG_DIR` directory with its own OAuth login (`accounts/shims/claude.ex`). `auth_modes: ~w(subscription api_key)` is observed, not enforced. Verified. `*_API_KEY` env vars are passed through to agents (`agent_environment.ex:31,215`). Verified.
- **Codex:** `CODEX_HOME` profiles. The auth modes observed are `apikey chatgpt chatgptAuthTokens headers agentIdentity personalAccessToken bedrockApiKey`. Also `rate_limit_fallback: "claude"`. Verified.
- **Account selection** (`accounts/headroom.ex`) ranks profiles by how much rate-limit window each has left. That is a tool for spreading load across several subscriptions. Verified.
- **Muse** is Meta's Muse Code CLI (`muse serve`, model `muse-spark-1.3-contributor`). It uses one native login and has no isolated profiles. Vendor identity Inferred from secondary sources; its terms are unchecked.
- **Kimi, DeepSeek and OpenRouter** use API keys only. Their terms on minors are unchecked.
- **Gap (Inferred, from grep):** I found no config setting that limits one aiur instance to `api_key` profiles. The hosted instance therefore needs its own `~/.aiur` and profile set with no subscription logins, and fallback pointed only at API-key profiles. This matches spec §7.1 ("Do not conflate their credentials").

### 2.4 Kevin's own development sessions (platform-development aiur)

- Kevin may use his own Max subscription and ChatGPT login for his own Claude Code and Codex sessions (AN2, OA1). Verified.
- Caveat: limits "assume ordinary, individual usage" (AN11). The Consumer Terms ban automated access other than through an API key (AN8). Heavy multi-agent aiur orchestration on a Max login is his own account, but it strains both clauses. This is Kevin's existing risk, not something this product introduces. Inferred.
- A platform bug a user reports must reach Kevin as a ticket. It must not trigger a subscription-backed run for that user. If an automated run would happen because of a user's request, that run belongs to the hosted side. Inferred from spec §7.1.

## 3. Options compared

The minors part of the second column applies from V2 (teens) and V3 (children). In V1, only the adult terms apply.

| Option | Allowed for hosted multi-user + minors? | Fits aiur today? | Who pays | Notes |
|---|---|---|---|---|
| **A. Claude Agent SDK, Messages API, or Managed Agents + Kevin's Console API key** | **Yes** (AN3, AN5, AN7), plus the AUP minors guidelines | No. aiur drives the CLI, not the SDK, so this needs a new aiur backend or a Game Maker worker (A6 option) | Kevin, metered | The cleanest Anthropic route |
| **B. aiur `claude` CLI backend + Kevin's API key** | **Unclear** (AN4 against AN3/AN5) | Yes, no code change | Kevin, metered | Needs written confirmation from Anthropic sales |
| **C. aiur `codex` backend + Kevin's OpenAI API key** | **Yes** (OA3), with parental consent; under-13 personal data needs approved ZDR (OA6) | Yes (Codex is aiur's default backend) | Kevin, metered | Codex needs bubblewrap, which is unverified on Railway (A6) |
| D. Kevin's Claude Pro/Max/Team/Enterprise OAuth | **No** (AN1, AN2, AN4) | Yes technically | Flat | Allowed only for Kevin's own sessions |
| E. Kevin's ChatGPT Plus/Pro/Business sign-in for Codex | **No** (OA2, OA3, OA4) | Yes technically | Flat | Allowed only for Kevin's own sessions |
| F. Each user's own credentials (BYO) | Anthropic: adults only, via an unmodified hosted Claude Code and Anthropic's own sign-in (AN1, AN4, AN9). OpenAI: BYO API key is plausible; BYO ChatGPT login is not documented | Partly | Each user | V2+ (U20). Children cannot hold Claude accounts |
| G. Kimi, DeepSeek, OpenRouter, Muse | Unverified (terms not reviewed) | Yes | Kevin, metered | Not for V1 without a terms check. Kevin's sandbox pick (aiur's own tool loop) uses these, so the check is now needed before V1 |

### Cost gap (estimates, not quotes)

List prices on 2026-10-21, per million tokens (Verified, https://platform.claude.com/docs/en/about-claude/pricing and https://developers.openai.com/api/docs/pricing):

| Model | Input | Cache write (5 min) | Cache read | Output |
|---|---|---|---|---|
| Opus 5.5 | $4 | $5 | $0.20 | $20 |
| Sonnet 5.5 | $2 | $2.50 | $0.10 | $10 |
| Haiku 5.5 | $0.10 | – | $0.01 | $0.50 |
| gpt-5.6-sol | $4 | – | $0.40 | $20 |
| gpt-5.6-terra | $2 | – | $0.20 | $12 |

Per job, using A6's token mixes (Inferred):

| Job | Claude | Codex equivalent |
|---|---|---|
| New game | Opus 5.5: **$20.00** | sol: about $22 |
| Feature | Sonnet 5.5: **$2.75** (A6's $3 assumed a $0.20 cache read) | terra: about $3.20 |
| Clarify | Haiku 5.5: $0.0015 | – |

Per family month, Claude API, excluding retries, voice and infrastructure:

| Scenario | Jobs | API cost (estimate) | Max 20x seat |
|---|---|---|---|
| Light | 2 games, 20 features | **about $95** | about $200* |
| Medium | 4 games, 40 features | **about $190** | about $200* |
| Heavy | 10 games, 100 features | **about $475** | about $200* |

\* claude.com/pricing shows Max as "From $100/month" (Verified). The $200 price for 20x is Unverified. ChatGPT Pro is $100, $200 or $500 a month (Verified, learn.chatgpt.com/docs/pricing). How many tokens a subscription actually allows per month is not published.

Takeaway (Inferred): the API looks expensive mainly compared with heavy, subsidized personal subscription use. At family scale, with Opus 5.5 cache reads at 0.05× input, the cost is roughly the price of one subscription seat, and a subscription is not a legal option here anyway. These costs are dominated by how many tokens each job uses. The planned ≈$150 benchmark (§8.6) should measure that before anyone sets budgets.

## 4. Recommendation

1. **Hosted V1 uses API keys only, paid by Kevin.** Subscriptions stay with Kevin's own development sessions. This follows from the evidence (AN1–AN4, OA2–OA4); it is not a preference. In spec §8.1 terms, the desired subscription route is unavailable, for a specific reason, for every provider checked.
2. **Default Anthropic path:** ask Anthropic sales to confirm in writing that option B is allowed. Option B is aiur's unmodified Claude Code CLI, on Kevin's Console key, run by Kevin's free family service for invited adult users in V1 (and minors from V2). If Anthropic says no, or does not answer, use option A (an Agent SDK or Messages API worker), which is clearly allowed. *Note (2026-10-25): Kevin has since said to use aiur with API keys and build nothing new, so option A is no longer the planned fallback; C or G would be.* Codex on an API key (C) is usable today as the first or a fallback provider, with no confirmation needed. **(V3)** Keep it away from under-13 personal data unless OpenAI approves ZDR.
3. **Separate the hosted aiur instance:** its own state directory, API-key profiles only, no subscription logins on that host, and fallback targets limited to API-key profiles. aiur records the auth mode but does not enforce it, so the hosted instance should fail closed if a subscription profile appears.
4. **(V2 teens, V3 children) Minors obligations for whichever provider is used.** V1 has no minors, so only the adult terms apply. From V2: AI disclosure, safety measures, parental consent (OA3), and Anthropic's minors guidelines (AN10). These overlap with U03 and U07.

## 5. Decisions for Kevin

**D1 — Which Anthropic path does the hosted builder use?**
- (a) Keep aiur's Claude Code CLI backend on your API key, but only after Anthropic confirms in writing.
- (b) Build an Agent SDK or Messages API worker now and skip the question.
- (c) Use Codex on an API key as the hosted primary and leave Claude for later.
- **Recommended: (a), with (b) as the fallback.** It reuses aiur as it is, and the confirmation is cheap to ask for.
- Consequences: (a) blocks hosted Claude jobs until Anthropic replies, which could take weeks. (b) means building and maintaining a second agent runner beside aiur, with less reuse. (c) needs bubblewrap on Railway and gives up Claude; from V2/V3 it also needs parental-consent handling and OpenAI's under-13 ZDR approval.
- **Kevin's pick (2026-10-22):** (b). **Superseded** by his later comment: use aiur with API-key profiles and build nothing new. So (b) is off; (a) waits on the Anthropic email (decision log, open question 3).

**D2 — Add a second API-key provider (Codex) in V1?**
- (a) Claude only.
- (b) Claude primary, Codex as rate-limit and outage fallback.
- (c) Choose per job by measured cost and quality.
- **Recommended: (b).** aiur already supports fallback, and a second provider avoids a single point of failure.
- Consequences: (a) is simplest, but a Claude outage or rate limit stops all builds. (b) means two sets of vendor terms and two budgets; from V2 it also means two minors regimes, and in V3 the OpenAI ZDR question for children's data. (c) is the same as (b) plus benchmarking work before launch.

**D3 — Monthly API spend cap for V1 (feeds U08).**
- (a) About $100 a month (light use).
- (b) About $200 a month (medium use, roughly one Max seat).
- (c) Set the cap after the ≈$150 measurement spike.
- **Recommended: (c), with a provisional hard stop at (b).** The per-job figures are unmeasured guesses.
- *Note (2026-10-25): Kevin decided admins configure all spending limits; this cap is only the starting default.*
- Consequences: (a) may pause builds mid-month and frustrate users. (b) is about the subscription price Kevin is used to, with medium headroom. (c) delays the final number but bases it on real data.

**D4 — Bring-your-own credentials later (V2, U20).**
- (a) Adults may bring their own API key only.
- (b) Also let adults sign in with their own Claude subscription inside an unmodified hosted Claude Code.
- (c) No BYO at all.
- **Recommended: (a) when the time comes.** It is allowed, simple, and has no OAuth-handling rules.
- Consequences: (b) is allowed only through Anthropic's own sign-in flow, never for children, and aiur cannot hold the tokens. (c) keeps all costs on Kevin.

## 6. Uncertainty and unverified items

- **AN4 against AN5:** whether aiur running the Claude Code CLI on Kevin's key for family users counts as "paying on end users' behalf". Only Anthropic can answer this, ideally in writing.
- **(V2+)** Whether Claude Team or Enterprise seats can be issued to minors. The support page says Claude accounts are 18+ but does not mention Team.
- Max 20x price (the pricing page shows "From $100"), and the real token capacity of any subscription.
- OpenAI text came from Wayback snapshots dated today, because openai.com returns 403 to direct fetches. The wording should be rechecked in a browser.
- **(V3)** OpenAI ZDR approval route and timing; whether a game prompt from a child under 13 counts as "personal data" (see A8, A-voice).
- Terms for Muse (Meta), Kimi, DeepSeek and OpenRouter, including minors and resale, were not reviewed. aiur supports these backends, but they are not cleared.
- The cost token mixes are A6 assumptions. They leave out retries, repairs, specialists, voice and infrastructure. The Codex equivalents assume similar caching behaviour.
- The Anthropic AUP version is dated 12 Nov 2026, in the future. Recheck it after that date (as A8 already noted).
- Not legal advice. The consent and COPPA questions (V3) belong to U03 and counsel.
