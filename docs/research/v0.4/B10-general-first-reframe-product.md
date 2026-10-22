# B10: General-first reframe of the v0.4 product decisions

- **Trigger:** owner direction, 2026-10-22: "let's not make this entire project kid focused, just a general game maker with parental controls."
- **Inputs:** spec v0.4 §1, §2, §4, §5, §10, Appendix A; research B1–B8; the published decision page (`gm-decisions/index.html`); the owner's comments of 2026-10-22, which are authoritative.
- **Companion:** B9 (`B9-general-audience-reframe-legal.md`) covers the legal and vendor-terms side. It did not exist when this was written. §7 lists every conclusion that depends on it.
- **Labels:** [V] verified in a primary source or cited B-report; [I] inferred or design proposal; [U] unverified. Research only: nothing was bought, filed, committed or sent. This is not legal advice.

## 1. TL;DR

- **The spec is already general-first. The research round was not.** §1.1 and Appendix A say all-ages, with child supervision layered on. B2, B3 and B5 and the decision page then applied child-data rules to every account. This report puts those rules back inside one parental-controls module that turns on only for child accounts [I].
- **One account model, three age bands:** adult (18+), teen (13–17) and child (under 13). The module is on for child accounts and cannot be switched off. A family can opt a teen in. Adults never inherit it (§1.1) [I].
- **Most B1–B8 engineering survives unchanged:** API-key funding, the E2B sandbox, bucket storage, bug routing and the edit lease. Their reasons were security and cost, not age. What changes is wording, plus three product-wide rules that become child-only: self-hosted-only speech, the publication gate and private-by-default repos, and signed-form consent [I].
- **Sign-in:** recommend **both** passkey and Google for every account, with email mandatory as the recovery path. Child accounts use a passkey the guardian enrolls. Google stays off for them unless a guardian turns it on after the Family Link device test [I].
- **Under the owner's decisions,** voice uses the aiur package (ElevenLabs first, OpenAI second) and V1 art uses skills and code only. This removes most vendor-exclusion debate from the default product. The open question narrows to which voice provider a child account may use [I].
- **A possible sequencing win:** adult and teen creators can go live without the COPPA document set. That set gates the first *child* account, not the product [I; depends on B9].

## 2. Per-area decisions

| # | Area | (a) Question for every user | (b) Default for adult and teen creators | (c) What changes for a child account |
|---|---|---|---|---|
| 1 | Sign-in | How does anyone sign in, and how do they recover a lost device? | Passkey or Google, the user's choice. Email is required and serves as the magic-link recovery path. | The guardian enrolls a passkey per device. The guardian's email is the recovery address. Google is off by default. |
| 2 | Consent and authority | Who can agree to terms, and who can turn on features that collect data? | Users accept terms and toggle their own features, each with a short notice. Admins manage family settings, not other adults' data. | Only the guardian grants data scopes (voice, uploads, publishing the child's words). Admins can only make settings stricter. |
| 3 | Repos and public source | Where does my game's source live, and who can see it? | Connect GitHub at setup. Game Maker creates the repo. Visibility is the user's own GitHub choice, with a plain disclosure. | A guardian-owned GitHub hosts the repo. Private by default. Public needs the guardian's publishing scope, and the publication gate runs. |
| 4 | Voice | Can I talk to the builder, and how do my games speak? | aiur voice package, ElevenLabs first, OpenAI second. No-transcript mode. Narration rendered once and reused. | Voice input is off until the guardian grants the scope. It then routes only to a provider cleared for children's data. |
| 5 | Art and audio | What makes my game's art and sound? | V1 uses skills and code tools: CC0 kits, code-built props and sprites, code-composed music and SFX. Paid generators come later. | Uploads need the guardian's scope. Faces are rejected. Derived assets stay private until the guardian approves publishing them. |
| 6 | Storage and CDN | Where do files live, and who can fetch them? | Hash-keyed bucket, signed links, no CDN in V1. Every user gets EXIF stripping. | Child uploads are never redistributable without the scope. A guardian's deletion overrides forks. |
| 7 | AI funding | Who pays for builds, and on what credentials? | Kevin's API keys through aiur profiles. No subscriptions. AI disclosure for everyone. | Child jobs never fall back to a provider whose children's-data condition is unmet (for example OpenAI before ZDR). |
| 8 | Sandbox | How is generated code kept from harming anyone? | VM per job with an egress allowlist, model proxy, commit service, separate-site iframe, no microphone in games. | No change. |
| 9 | Bug reports | What happens when someone reports a bug? | One report button. Reproducible crashes auto-repair within the admin's allowance. Diagnostics stay private, and issues carry only IDs. | No auto-repair spend from a child's report unless the admin allows it. Voice reports need the voice scope. |
| 10 | Edit handoff | What if two people want to edit one game? | Single-writer lease. The owner moves between their own devices. Admins cannot take over an adult's game. | The guardian or an admin takes over instantly. The child taps "Ask to edit." |
| 11 | Legal review | What review do we need before whom joins? | Ordinary terms and privacy policy, a neutral age screen, and a lawyer before opening beyond invited families. | COPPA document set and design-to-comply plan before the first child account. Lawyer before any outside family's child joins. |
| 12 | Spending | Who sets spending limits? | Admins set all limits: family cap, per-member caps, slots, repair allowance. | Child cannot raise or approve spend. A per-child sub-cap applies. |

### Notes by area

**1. Sign-in.**
- *(d)* B3 is right on substance: Google must never be the only way in. Google's policy says mixed-audience apps "shouldn't require" Google sign-in [V via B3 A1]. B3 framed this as a child problem. Under general positioning it is simply the mixed-audience rule. "Kids default to passkey" survives as a module setting.
- *(e)* Owner options:
  - (a) Passkey only. Cleanest on Google policy, but every adult enrolls each device.
  - (b) Google only. Simplest, but it breaks the mixed-audience rule, and a client suspension would lock out every account.
  - (c) **Both (recommended).** No account depends on Google, and turning Google off strands nobody.
- *(e)* Open question: may a guardian switch on Google for a child who has Family Link? Recommend not until the iPad device test passes [U per B3 A3].

**2. Consent and authority.**
- *(d)* B3's split between safety controls (admins) and consent scopes (guardian) survives exactly, and it is the core of the module (§3). B3's K4 recommendation (a) becomes the spec rule.
- *(d)* Over-scoped: the decision page posed consent as a product-wide question. Adults and teens decide for themselves.
- *(e)* Remaining choice for the consent method: (a) **signed form plus confirmation email (recommended)**, (b) email-plus "I approve", (c) video call. This applies only when a child account is created.
- *(e)* Open: do teens need a parent's agreement to the terms? A B9 question.

**3. Repos and public source.**
- *(d)* Superseded by the owner's decision (no multi-repo, no platform monorepo):
  - B3's private working repo plus a public release export;
  - B7's Q3 recommendation of an unpublished draft branch;
  - the decision page's "private by default when the family has kids."
- *(d)* Survives for everyone:
  - issue and PR bodies carry only redacted briefs and IDs, never transcripts (B8);
  - the commit-service path checks (B4);
  - opaque creator handles in public credit.
- *(d)* Child-only: B7's publication content gate and B3's never-public list. They are needed only where a child's words could reach a public repo.
- *(e)* Remaining choice for child games. Recommend (a).
  - (a) **A dedicated repo per child, in the guardian's GitHub.** Private. The publishing scope is what unlocks public.
  - (b) The child's games go into the guardian's own repo.
  - (c) An admin's GitHub may host them.
- *(e)* Open questions:
  - Is a teen (GitHub allows 13+) allowed to connect their own GitHub? Recommend yes [I; B9 to confirm].
  - aiur serves one repo per daemon today [V via B8]. Do repo-per-user setups need a multi-repo hosted aiur? That is an upstream gap, not an owner choice.

**4. Voice.**
- *(d)* B2 recommended self-hosted speech-to-text and Kokoro for everyone, and treated ElevenLabs as blocked. That was over-scoped: it applied an under-18 rule to the whole product.
- *(d)* Owner decision: aiur package, ElevenLabs then OpenAI. Under it, the default is ElevenLabs for adult and teen speech input and narration [assumption A2, A3].
- *(d)* B2's gap list survives as aiur package work for everyone: no-transcript mode, alignment and usage frames, a narration render path. B2's TypeScript relay recommendation (D3) is superseded.
- *(e)* Remaining choice: the child-account voice provider. Recommend (a).
  - (a) **Apply now for ElevenLabs written approval and OpenAI ZDR. Use the first approved. Until then, a self-hosted provider inside the same package.**
  - (b) Text and tap only until approval.
  - (c) Self-hosted only, permanently.
- *(e)* Open question: may a child *play* a game narrated by ElevenLabs? Narration carries no child data, but ElevenLabs' clause covers "experiences directed at" under-18s [V via B2]. See assumption A3.

**5. Art and audio.**
- *(d)* The owner's decision (skills and code tools first) matches B5's library and code rungs and makes B5's D1 and D4 moot for V1. B5's long vendor-exclusion list was over-scoped. It returns, scoped by account band, when paid generators come back.
- *(d)* Survives for everyone: the drawing-photo pipeline (crop, strip EXIF, local background removal, palette snap) and provenance records.
- *(d)* Child-only: the upload scope, face rejection, and "never to a third-party generator."
- *(e)* None in V1. Defer the $30 art benchmark.

**6. Storage and CDN.**
- *(d)* B6 survives intact: Railway bucket, hash keys, signed links, no V1 CDN, nightly backup. Two items change:
  - "Erasure beats forks" becomes a child-upload rule. For adults, a published, redistributable asset stays in forks under its license. An adult's deletion removes it from their own game, not from forks [I].
- *(e)* Remaining choices: (a) Railway bucket (recommended) or (b) R2. For adult erasure against forks: (a) **forks keep published assets (recommended)**, (b) deletion wins everywhere.

**7. AI funding.**
- *(d)* B1 survives: no subscriptions for hosted multi-user builds [V via B1 AN1–AN4, OA2–OA4]. The owner's decision settles the mechanism: aiur API-key profiles, nothing new built. The open item is still the Anthropic hosting clause (AN4 against AN5).
- *(d)* B1's AI disclosure becomes product-wide; parental consent and ZDR become module routing rules.
- *(e)* Remaining choices:
  - Claude path: (a) **confirm with Anthropic, with Codex on an API key as fallback (recommended)**.
  - Second provider: **Codex as backup (recommended)**, with the child-routing rule from the table.

**8. Sandbox.**
- *(d)* B4 survives entirely. Reword threat T3 from "kid text" to "user text." No-mic-in-games rests on untrusted code, not age.
- *(e)* B4's choices are unchanged and audience-neutral.

**9. Bug reports.**
- *(d)* B8 survives. Redaction and private diagnostics apply to everyone; "a child's repeated taps" becomes "any player's repeated reports."
- *(e)* Remaining choices: (b) auto-repair for reproducible crashes within the allowance (recommended); repairs share the edit slots; 2 attempts, provisional. Open question: should a player-only friend's report count against the creator's allowance? Recommend yes, deduplicated.

**10. Edit handoff.**
- *(d)* The B7 lease and fencing survive. Over-scoped: §4.2's admin assistance was written for supervised members, but B7 and the decision page applied takeover to any family game.
- *(e)* Remaining choices:
  - Supervised accounts: (a) **admin takes over instantly, child asks (recommended)**.
  - Adult games: (a) **owner only, plus optional per-game "helper" grant later (recommended)**, (b) any admin may take over.

**11. Legal review.**
- *(d)* B3 §5's lawyer list survives, but it is triggered by child accounts and outside families, not by launching at all.
- *(e)* Remaining choice. Recommend (a).
  - (a) **Launch for adults and teens first. Draft the COPPA set before the first child account. Get a lawyer before an outside family's child joins.**
  - (b) Run with your own family's children now under design-to-comply. The decision page's original recommendation.
  - (c) Lawyer now.
- *(e)* (a) delays the motivating use case (§1.2); (b) stays defensible.

**12. Spending.**
- *(d)* The owner's decision (admins configure all limits) generalizes B1 D3 and B8 §5. Defaults: $200 a month family cap, 1 + 3 slots, repair allowance, all admin-editable. "Pause mid-month frustrates the kids" becomes "pauses builds mid-month."
- *(e)* Open question: per-member caps for adults. Recommend optional, off by default. A per-child sub-cap is on by default.

## 3. Parental controls as one module

**Activation.**
- An account is a child account when its age band is under 13, either declared at the neutral age screen or set by the admin who creates it.
- A child account stays in `pending_consent` until a guardian edge with the `core` scope exists. Until then it cannot sign in [I; COPPA requires consent before collection, per B3 B3].
- A family can opt a teen account into the module (`supervised: true`). Teens then get the same controls, but data scopes are recommended rather than required [I; B9].

**Roles (amends §4.1).**

| Role | Can do in the module | Cannot do |
|---|---|---|
| Guardian (edge: parent to child, consent record, scopes) | Grant or revoke data scopes; review, export and delete the child's data; everything an admin can | Act for children it is not linked to |
| Family owner or admin | Change safety controls, but only stricter, or within granted scopes; take over the child's games; set spend sub-caps | Grant data scopes; read transcripts (none exist) |
| Inviter | Nothing extra | Gain any oversight by inviting |
| Child | Use what is enabled; "Ask to edit"; request a setting (which notifies the guardian) | Change any control |

When two guardians disagree, the stricter setting wins [V via B3 B5]. A guardian does not need to be an admin. A guardian who is not a family member gets a guardian-only view of that child.

**Per-child settings.**

| Setting | Kind | Default | Who changes it |
|---|---|---|---|
| Voice input to the builder | Data scope | Off | Guardian |
| Image and photo uploads | Data scope | Off | Guardian |
| Publish the child's words and uploads (and the repo-public switch) | Data scope | Off; repo private | Guardian |
| Sign-in methods | Safety | Passkey only | Guardian (Google after device test) |
| Invite players | Safety | Off (§4.3) | Admin |
| Content preset (themes, combat style, scariness) | Safety | "Younger" preset | Admin |
| Kid-friendly presentation | Presentation | On | Admin or guardian; the child may also turn it off |
| Advanced settings and parent help overlay | Presentation | Behind guardian or admin gate | Admin |
| Build spend sub-cap; auto-repair from the child's reports | Spend | Sub-cap on; auto-repair off | Admin |
| Playtime limits | Safety | None (spec separates budgets from playtime) | Admin |
| Refusal digest and change log | Oversight | On, weekly | Guardian (frequency only) |

**Locked for child accounts (no one can enable):**
- open or stranger chat;
- public discovery;
- the §10.8 always-off content;
- microphone access inside games;
- storing raw audio or full transcripts;
- sending the child's voice, photos or raw prompts to a provider not cleared for children's data;
- Google generative AI products on child data [V via B2 and B5: barred for under-18 services].

**Oversight surface.** This is B3 C1 unchanged: game access, the one-line change log, the refusal digest (category and time, not the child's words), and the data page with export and delete. There is no transcript viewer.

**Data handling.** B3's C2 retention table is the child-account policy. Adults and teens get the same mechanics (no raw audio, short transcript life, redacted issues) under the ordinary privacy policy.

## 4. Copy and positioning rules

1. **The default actor is "a creator" or "a player."** Say "child account" only where the parental-controls layer is the subject.
2. **Ask every decision for all users first,** then add "What changes for a child account?" as a sub-question.
3. **Scope every restriction.** If a rule applies only to child accounts or under-18s, say so in the same sentence: "For child accounts, voice input…"
4. **Keep the roles distinct:** "guardian" is legal consent, "admin" is settings, "inviter" is neither. Never write "parent" to mean "admin."
5. **Name it once:** "parental controls" is the module. "Kid-friendly presentation" is one setting inside it. Do not say "kid mode" for the product.
6. **Use neutral outcomes,** not "frustrates the kids": "builds pause."
7. **Treat the origin story as origin.** The nephew and niece appear in §1.2 and in tests, not as the audience of every example.
8. **Every vendor exclusion names its trigger:** "barred for under-18 services," not "excluded."

**Decision-page headlines, rewritten:**

| Was | Becomes |
|---|---|
| Kids and families: sign-in, consent, what goes public | Accounts: sign-in, consent, what goes public |
| How do kids sign in? | How does everyone sign in, and what changes for child accounts? |
| Who can say yes to what a child's data is used for? | Who can turn on data-collecting features? (Child accounts: only a guardian) |
| When does a game's source become public? | Where does a game's source live, and who sees it? |
| Where does a child's voice go, and who voices the games? | Which voice providers power talking and narration, and which are cleared for child accounts? |
| A public games repo would publish what kids say | A public repo shows issues, PRs and CI logs, so briefs must be redacted for everyone |
| When a parent and child both want to edit the same game | When two people want to edit the same game |
| "Its planned default provider… isn't allowed for under-18 apps" | "Its default provider needs written approval before child accounts can use it" |

## 5. Spec deltas for v0.5

- **§1.1:** add the account model: adult, teen and child bands; a parental-controls module on for child accounts and opt-in for teens. Positioning is general-audience [pending B9].
- **§1.4 / Appendix A:** replace "Google sign-in for adults and children" with "passkey or Google; email mandatory." Add rows for the parental-controls module and the guardian edge.
- **§2.3:** sign-in row; a "parental-controls module" row replacing the split rows. Add "Bring-your-own GitHub: V1" (moved from §2.6, per the owner). CDN: not V1.
- **§3.5 / §9.2:** no platform games monorepo. The user connects GitHub, Game Maker creates the repo, visibility is the user's choice. Child games go in a guardian-owned, private-by-default repo.
- **§4.1:** add the guardian edge. Only a guardian grants data scopes. Admins hold safety controls, stricter-only for data. Inviters gain nothing.
- **§4.2:** admin takeover applies to supervised accounts. Adult games are owner-only.
- **§4.4:** passkey or Google for any account. Email is required and is the recovery path. Child accounts use a guardian-enrolled passkey, with Google off by default.
- **§4.5 / §10.4:** adopt B3's oversight surface and C2 retention table for child accounts. Use the same mechanics for everyone.
- **§5.13 / §5.14:** voice uses the aiur package (ElevenLabs, then OpenAI, plus a self-hosted provider and a no-transcript mode). Child voice and uploads are guardian scopes.
- **§8.1:** API keys through aiur profiles. Subscriptions are ruled out for hosted builds.
- **§8.3–8.4:** admins configure all limits. Defaults listed. Per-child sub-cap.
- **§10.1:** replace the list of proposed categories with the §3 settings table.
- **§10.5:** the legal gate is per audience: adults and teens get ordinary terms; the first child account needs the COPPA set; an outside family's child needs counsel.
- **§10.6:** rescope the vendor table by account band.
- **§10.7:** the never-public list and the publication gate apply to child-owned content.

## 6. Decisions for Kevin

1. **Sign-in:** passkey only, Google only, or **both (recommended)**. Also: Google for children only after the device test (recommended)?
2. **Teens (13–17):** **ordinary creators, with optional supervision (recommended)**, or always supervised?
3. **Where child games live:** **a dedicated repo per child in the guardian's GitHub (recommended)**, the guardian's own repo, or an admin's.
4. **Child-account voice:** **apply to ElevenLabs and OpenAI now, self-hosted meanwhile (recommended)**, text only until approval, or self-hosted forever.
5. **Admin takeover of adult members' games:** **no (recommended)**, or yes.
6. **Adult erasure against forks:** **forks keep published assets (recommended)**, or deletion wins.
7. **Launch order:** **adults and teens first, then child accounts once the COPPA set is drafted (recommended)**, or the family's children now under design-to-comply.
8. **Unchanged from the decision page:** D7 Anthropic confirmation, D8 sandbox, D9 repair defaults, spending approvals.

## 7. Assumptions pending B9

- **A1:** General-audience positioning with a neutral age screen makes Game Maker "mixed audience" under Google's API policy, so optional Google sign-in is permitted. If B9 finds it child-directed, Google comes off entirely and option (a), passkey only, wins.
- **A2:** Anthropic, OpenAI and ElevenLabs permit adult-account use in a mixed-audience product with child accounts walled off. Anthropic's minors guidelines (AI disclosure, safety) would still apply product-wide whenever any minor can use it [V via B1 AN10]. That is already adopted.
- **A3:** ElevenLabs' clause on "experiences directed at" under-18s is not triggered by general positioning for adult and teen use. Whether a child may *play* an ElevenLabs-narrated game is unresolved. Until B9 rules, child-owned games narrate with the self-hosted voice, and adult games may use ElevenLabs.
- **A4:** COPPA actual knowledge attaches per account, through the age screen or the admin's flag. Adult and teen accounts do not trigger it.
- **A5:** Teens need no parental consent for the default features. B9 should check vendor terms (OpenAI under-18 parental consent [V via B1 OA3]) and state age-appropriate-design laws. If consent is required, teens move into the module by default.
- **A6:** Google generative AI stays excluded *product-wide*, because "likely to be accessed by" under-18s probably still covers a mixed-audience product [V clause via B2; applicability I].
- **A7:** GitHub's 13+ rule lets teens connect their own GitHub. Child repos sit under an adult's GitHub account.

*Not checked:* B9 itself (not yet written); any live vendor page (no new fetches); aiur code beyond what B1–B8 report. *Risk:* if B9 rules the product child-directed, areas 1, 4 and 11 revert toward B3's child-first defaults.

## 8. Reconciliation with B9 (added 2026-10-22 by the orchestrator)

B9 has since been written. Where it changes this report:

- **A1 confirmed, with one sharpening.** B9 places the product as mixed audience: directed partly at children, never mainly. That makes optional Google sign-in allowed and required Google sign-in not. B9 says "general audience" isn't credible once child accounts are offered on purpose, so the public stance is "a game maker for everyone" and the legal stance is "mixed audience by design".
- **A3 and A5 change for teens.** Most vendor clauses use **under 18**, not under 13. Teens (13–17) are ordinary creators for product features and authority. For **vendor routing** they count as minors:
  - Voice (ElevenLabs, OpenAI) uses minor-cleared providers until written approval or ZDR arrives.
  - Teen build jobs prefer Claude. A Codex/OpenAI fallback needs parental consent per OpenAI's Services Agreement.
  - This replaces §2 row 4's "adult and teen default = ElevenLabs". ElevenLabs is the default for **adult** accounts only.
- **A6 confirmed.** Google generative AI (Gemini/Vertex/Lyria) and fal.ai stay excluded product-wide. Their clauses follow the service ("likely to be accessed by" minors, or "End Users are at least 18"), not the account. B9 D4 recommends asking each in writing.
- **New owner decisions from B9:**
  - positioning: mixed audience by design;
  - public name: "Open Game Maker 2000", already adopted 2026-10-21.
- **Signup order (B9 §2):** a neutral age screen comes first, before Google sign-in or any other collection. Under-13 routes to the parent flow.
