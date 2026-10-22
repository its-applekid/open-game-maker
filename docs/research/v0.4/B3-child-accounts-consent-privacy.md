# B3 — Child accounts, consent, oversight, retention, and public-source leakage (U03 / U07 / U17)

- **Spec inputs:** v0.4 §4.1–4.5, §5.2, §5.13–5.14, §5.19, §9.2, §10.1–10.7, §14.1 U03/U07, §14.2 U14–U17.
- **Prior inputs:** A7 (R04 auth matrix, R07 leakage vectors), A8 (§4 COPPA, §5 retention map), A5 (analytics), A6 (aiur tickets are GitHub issues/PRs), B2 (voice), B6 (assets).
- **Primary sources accessed:** 2026-10-21 (listed in §7).
- **Labels:** **[V]** verified against a primary source today. **[I]** inferred from verified facts. **[U]** unverified, secondary, or untested.
- **Scope:** research only. Nothing was signed up for, deployed, or sent to any vendor. **I am not a lawyer, and this memo is not legal advice or a compliance determination.**

## 1. TL;DR

- **Google's own developer policy conflicts with "Google sign-in for everyone."** Google says apps aimed mainly at children "should not use Google Sign-In". Mixed-audience apps "shouldn't require" it and must work fully without it. So Game Maker needs a second, non-Google way to sign in. Passkeys or email links would do. Google can stay as an option for adults.
- **Supervised child Google accounts can sign in to outside apps, but only with parent approval.** Parents control this in Family Link and can revoke access. On iPad, a parent usually has to approve the first sign-in, and most Family Link supervision does not work there. Nobody has tested our exact flow on a real child account yet.
- **A parent signing in with Google and tapping "I approve" is not, alone, a recognized COPPA consent method.** The cheapest listed method that is always acceptable is a **signed consent form returned as a scan or photo**. Use it once per child, and link it to the parent's own account.
- **The guardian is the parent.** Kevin, as uncle, inviter, and family admin, is not the guardian. Family admins can make safety controls *stricter*. Only the guardian can consent to new data uses, such as voice, photo uploads, or publishing a child's text.
- **Parents can see enough without transcripts.** They get play and edit access to the child's games, a one-line change log per build, and a short refusal digest. Microphone audio is never stored. Scoping transcripts are deleted 7 days after a job finishes. A per-data-type retention table is in §2C.
- **Public game source is the largest leak.** aiur works through GitHub issues, PRs, and CI. If the games repo is public, children's requests and agent notes become public too. Keep a **private working repo** and publish each release as a scrubbed, bot-authored snapshot to a public repo. Under COPPA, publishing a child's identifiable information counts as "disclosure".

## 2. Findings

### A. Child sign-in with Google

**A1. Google's policy on children's apps [V].** The Google API Services User Data Policy, last updated 15 Feb 2024, says:

> "Child-directed apps: If your application is directed primarily at children, it should not use Google Sign-In or any other Google API Service that accesses data associated with a Google Account… Mixed audience apps: Applications that are mixed audience shouldn't require users to sign in to a Google Account, but can offer, for example, Google Sign-In… as an optional feature. In these cases, users must be able to access the application in its entirety without signing into a Google Account."

The policy points to FTC guidance on what "mixed audience" means.

- **Consequence [I]:** §4.4, "Use Sign in with Google for adults and children" as the only method, does not comply under either reading.
- **Risk [I]:** The first users are 5 and 7. Under the FTC factors (animated characters, child-oriented activities, music, intended audience), Game Maker could be seen as *primarily* child-directed. If so, Google's text says not to use Google Sign-In at all. The practical risk is Google suspending the OAuth client, not a fine.
- **Fix:** A full non-Google sign-in path removes that risk. Google sign-in then becomes a convenience that can be switched off without stranding any account.

**A2. Family Link and third-party apps [V, with gaps].**

- Google's help page says parents go to "Controls → Account settings → Controls for third-party apps" to "select the level of control for third-party apps".
- "When you allow access, you can find a full list of the third-party apps and sites with permission to access your child's account."
- Parents can remove access, but "you may need to request that the third-party delete the data they already have."
- Google's help pages do not name the control levels today. A 2021 Android Police report describes the default as a per-app parent request, plus a blanket toggle for apps "that don't ask for too much data" [U, secondary, may be stale].

**What the parent sees and approves [I/U]:**

- An access request that names our app and asks for basic profile data: name, email, and photo.
- Later, our app appears in their "third-party app access" list, where they can remove it.
- Google's parental consent covers *Google's* services. Google's child privacy notice says it "does not apply to the practices of any third party (non-Google) apps" [V].
- FTC FAQ I.10: entering "an app store account number or password… without other indicia of reliability" is not enough for verifiable parental consent [V]. **Google's approval step is therefore not our COPPA consent.**

**A3. iPad and Safari [V/I/U].**

- Supervised sign-in to Google on the web is gated by "Controls for signing in": "Yes, ask me every time" or "No, let [name] sign in without me". The parent may have to enter their own password [V].
- On iPad, signing in through iOS Settings fails with "Couldn't sign you in" [V].
- If a child signs out, "they'll need your permission to sign in on that device again" [V].
- Screen-time, app-blocking, and Chrome restrictions "won't work" on iPad [V]. Family Link is therefore no substitute for our own controls.
- **Inferred flow [I]:** A parent is present for the first Google sign-in on each device. After that, our own long-lived session carries the child.
- **Untested [U]:**
  - whether the third-party approval appears inline in Safari on iPad or only in the parent's Family Link app;
  - whether a home-screen (standalone) web app keeps a separate cookie jar and needs its own sign-in;
  - whether the redirect back from Google works in standalone mode.
- **Must test:** Google forbids sending OAuth to "an embedded user-agent under the developer's control" [V]. Any in-app browser or wrapper must use Safari or the system browser.

**A4. Google app requirements [V/I].**

- Apps that use "only non-sensitive scopes" do not need full app verification [V]. openid, email, and profile are non-sensitive [I].
- "For production apps, brand information must be verified" [V]. That needs a non-login homepage, a privacy-policy link on the consent screen, and verified domain ownership [V].
- This costs nothing and needs no account change now. The privacy policy can be the same COPPA notice required in §2B.

**A5. Fit with Better Auth and the §4.1 family model [I].**

- A7 already recommends Better Auth for **authentication only**: Google social provider, email OTP or magic link, and `@better-auth/passkey`. Authorization stays in our own policy module [V via A7].
- Model the *guardian* as an edge created only when a consent record completes, as in A7's supervision state machine. It is separate from `admin`, `creator`, and `player`.
- Proposed edges:
  - `family_role ∈ {owner, admin, member}`, which gives product authority;
  - `capability ∈ {creator, player}`;
  - `child` attribute;
  - `guardian(parentUserId → childId, consentRecordId, scopes[])`, which gives legal and data authority.
- **Child sign-in without Google:** the guardian enrolls a **passkey** on the child's iPad from a one-time enrollment link. After that the child opens the app with Face ID or Touch ID. This is neither the rejected child PIN nor "parent signs in to unlock" (§4.4). Losing the device means re-enrolling through the guardian.

### B. Consent: what COPPA requires for this product

**B1. Does COPPA apply? [V text, applicability open].**

- An "operator" runs a service "for commercial purposes involving commerce among the several States", and nonprofits exempt under FTC Act §5 are excluded [V, 16 CFR 312.2].
- The FTC FAQ says the Rule "applies to operators of commercial websites and online services" [V].
- Whether a free, invite-only family deployment is "commercial" is **not settled by the text**. That question is for counsel (§5).
- If the service is covered, the invite-time child flag is **actual knowledge** for that account (§312.3), so mixed-audience status does not help that account (A8, concurring).
- **Recommendation: design to comply.** At family scale the cost is a few documents and the minimization below, which we want anyway.

**B2. What counts as personal information here [V, §312.2].** Each of these is personal information:

- a first and last name;
- a screen name that "functions in the same manner as online contact information";
- persistent identifiers, such as the session cookie and IP address;
- "a photograph, video, or audio file where such file contains a child's image or voice";
- voiceprints and facial templates;
- information collected from the child "combine[d] with an identifier".

A child's game request stored against their account falls under the last item [I]. A drawing of a dragon is not personal information. A photo that shows the child, or has GPS in its EXIF data, is [V, FAQ F.1–F.3].

**B3. Obligations if covered [V].**

- **Before collecting anything:** obtain verifiable parental consent and give direct notice to the parent (§312.5(a)(1), §312.4). Material changes need fresh consent.
- **Disclosure to third parties:** the parent must be able to say no to disclosure "unless such disclosure is integral". Disclosure needs **separate** consent (§312.5(a)(2)).
- **Online notice:** must list operators, what is collected, "the identities and specific categories of any third parties" receiving data, and the **written retention policy** (§312.4(d), §312.10). Data "may not be retained indefinitely".
- **Written security program (§312.8(b)):** a named coordinator (Kevin), an annual risk assessment, safeguards, testing, and an annual review. Before any vendor receives child data, we need **written assurances** from them (§312.8(c)).
- **Parent rights (§312.6):** the parent can review what we hold, refuse further collection, and direct deletion. We must "ensure that the requestor is a parent".
- **Audio exception (§312.5(c)(9)):** applies only when there is "no other personal information" and the audio is deleted "immediately". A signed-in child always has a persistent identifier, so **do not rely on this exception** [I; A8 and B2 agree].
- **Public posting is disclosure:** "Disclose" includes "making personal information… publicly available in identifiable form by any means" [V, §312.2]. Public Git is such a means [I]. This ties B to D.

**B4. Realistic consent methods for two families [V list, I fit].**

| §312.5(b)(2) method | Fit for Game Maker |
|---|---|
| (i) Signed consent form returned "by postal mail, facsimile, or electronic scan" | **Best fit.** Free, works whatever we disclose, and takes minutes per child. A phone photo of a signed PDF should count as an electronic scan [I]. |
| (iv) Video conference with "trained personnel" | Possible: Kevin video-calls his sibling. Whether "trained personnel" fits an uncle is unclear [U]. |
| (viii) Email plus (email, then a confirmatory email, letter, or call) | **Allowed only if we do not "disclose".** Fails if child data goes public in Git. Also fails if counsel decides that model, voice, or hosting vendors are "third parties" rather than "support for the internal operations" [V for the condition, open for applicability]. |
| (ii) Card transaction; (v)–(vii) ID or facial checks | Cost money or are disproportionate. Not recommended. |

**Does the parent's own Google sign-in plus "I approve" qualify? [I]** Not on its own. It proves control of a Google account, which is about the same assurance as email. With a confirmatory email afterwards, it becomes email plus, with the no-disclosure limit above. Its real value is **binding**: it ties the consent record to an authenticated parent account. That account then serves for later review and deletion requests, which FAQ I.8 supports. **Recommended flow:**

1. The parent signs in.
2. The parent reads the notice and chooses scopes: core; voice input; photo uploads; publishing child-authored text.
3. The parent uploads a signed form. It is generated already filled in, so signing is the only manual step.
4. Kevin confirms the form, and the guardian edge becomes active.
5. A confirmation email is sent.

**B5. Guardian vs family admin vs inviter [V/I].**

- "Parent includes a legal guardian" [V]. Consent must come from someone "reasonably calculated… to [be] the child's parent" [V].
- An inviter or family admin (Kevin) does not get consent authority by holding those roles. This matches spec §4.1 and §10.1.
- **Recommendation [I]:** separate *safety controls* from *consent scopes*.
  - Any family admin may change safety controls, as §4.1 decided: content, playtime, invitations, and publishing visibility within consented scopes.
  - Only the guardian may grant or revoke consent scopes that collect or disclose more data. Examples: turning on voice input or photo uploads for the child, or publishing child-authored text.
  - Admins can always make settings stricter.
  - Parent review, export, and deletion requests are guardian-only.
  - If two guardians disagree, the more restrictive choice wins until they resolve it.

### C. Oversight vs retention

**C1. The least intrusive way for parents to oversee [I].** Each layer below is either already required or cheap.

1. **Game access.** Play the game and edit it on the child's behalf. This is already decided (§4.2).
2. **Change log per build.** A one-line summary of each build or release, such as "Added a jumping frog enemy; made level 2 shorter". It is derived from the structured scope brief, which the job needs anyway (§7.2), and is kept with the game.
3. **Refusal digest.** When §10.3 redirects a child away from a request, record the category ("violent content"), the time, and a neutral 1-line summary. Do not keep the child's words. The guardian sees these in a weekly digest or the dashboard, and they are deleted after 90 days.
4. **Data page (§312.6).** It lists the categories we hold for the child, offers an export of uploads, design data, and saves, and has a delete button. Few raw records exist, so this page is small.

Full transcripts add surveillance and storage risk, and they make the §312.6 review burden larger. Layers 1–3 already answer "what is my child building and is anything wrong". **Do not build a transcript viewer**, as §10.4 already concluded.

**C2. Draft retention table [I; proposals for the §312.10 written policy].** "Game lifetime" means deleted when the game is deleted, or when the owner account is deleted or purged.

| Data type | Purpose | Store | Retention (proposal) | Who can see it | Public source? |
|---|---|---|---|---|---|
| Mic audio (speech input) | Turn speech into text | Memory only; self-hosted STT first (B2) | **Not stored.** Dropped when the final transcript returns | Nobody | Never |
| Scoping transcript (text) | Clarify the request and build the brief | Private DB | Deleted **7 days after the job ends**, for retries and "what did I ask?"; earlier on guardian request | Child, guardian; operator only for support | Never |
| Structured brief and change summaries | Build the game; parent oversight | Private DB | Game lifetime | Owner, guardian, authorized admin | No (§D) |
| Refusal and moderation events | Parent oversight | Private DB | 90 days | Guardian, admins in that family | Never |
| Generated narration (TTS of agent text) | Reusable game asset | Bucket, keyed by content hash (B6) | Game lifetime plus asset GC | Players of the game | Only if its text passes the D-scrub |
| Child-recorded voice assets | (Not in V1, §5.13) | — | Requires a separate guardian scope if ever added | — | Never by default |
| Uploads and photos | Game input or asset | Re-encoded in the browser (EXIF and GPS removed); raw original never uploaded; faces rejected or blurred (FAQ F.3) | Stripped copy kept privately for game lifetime; derived sprite treated as a game asset | Owner, guardian, admins | Derived asset only with guardian scope |
| Design data and overrides | The game itself | DB | Game lifetime | Owner, guardian, editors | Yes, after scrub |
| Cloud saves | Resume play | DB | Until game or account deletion; inactive child accounts get a guardian notice at 12 months and are deleted at 18 months | That player, their guardian | Never |
| Analytics (A5) | Help creators improve games | First-party DB | 90 days raw, then aggregates of at least 3 players | Creator sees aggregates; guardian sees their own child | Never |
| Bug evidence | Repair | Private store; the ticket holds only an ID | 30 days, or until the fix ships plus 7 days if that is shorter | Operator, owner | Never |
| aiur logs and agent transcripts | Build and debug | aiur dashboard (operator only) | 30 days; ticket text is the redacted brief, never the raw transcript | Kevin as operator | Never |
| Auth, session, and IP logs | Security | DB and logs | 30 days | Operator | Never |
| Account, consent, and guardian records | Proof of consent and authority | DB | Account lifetime; after deletion, keep only a minimal consent record (who, when, which scopes, no content) for a period counsel sets | Operator, guardian | Never |

aiur needs changes for this to work [I]:

- a no-store or ephemeral transcript mode (B2 G2 already flags this);
- deletion of each job's agent conversations after 30 days;
- a redaction step before any ticket is created, which removes family-roster names and contact strings.

### D. Public-source leakage

**D1. Why this reopens the "private monorepo" question.**

- aiur's unit of work is "a tracker ticket that produces a PR" on GitHub [V via A6]. Agents write ticket bodies, workpad and review comments, PR descriptions, branch names, and CI logs. On a public repo **all of that is public**. GitHub Actions logs on public repos are public too [V via A7].
- Scrubbing agent-written free text reliably is not achievable [I].
- Public posting of identifiable child information is COPPA "disclosure" [V]. That would also rule out the email-plus consent method.
- Public history cannot be recalled after clones and archives [V via A7].

**D2. Never put these in public Git [I, extends A7 R07 and A8 §5]:**

- real names, nicknames tied to real names, emails, Google IDs, user or family IDs;
- raw prompts, transcripts, scope conversations, agent workpads, and refusal events;
- child voice audio and photos that show a person, or any image with EXIF data;
- saves, analytics, bug bundles, screenshots and videos of play sessions;
- invite lineage and family structure;
- asset filenames written by the child ("emmas-dog.png");
- source maps;
- commit timestamps more precise than the release date.

Child-written in-game text is a **gated** item, not an always or never one. "The frog king wants cake" is not personal information. "Made by Emma, age 7" is.

**D3. Practical controls [I].**

1. **Two repos.** A private **working repo** holds aiur issues, PRs, draft branches, CI, and history. A public **release repo** receives only the export.
   - This is not a product "Private" feature, so §5.2 still holds: the Private toggle remains discovery-only.
   - This is A7's S1 with one change: release export is automatic and is not off by default for everyone.
2. **Deterministic export on release.** A service, not an agent, writes one squashed commit per release under `games/<ULID>/`.
   - Author and committer are the bot. The message is a fixed template. The date is the release date.
   - The export takes files from an allow-list: code, manifest, design data, and assets whose B6 license record permits redistribution.
3. **Export lint that blocks the release on failure:**
   - the family roster's names and emails;
   - email and phone patterns;
   - any image that still has EXIF data;
   - any asset flagged as child upload or child voice without guardian scope;
   - files on a denylist (plans, notes, logs, `.aiur/`).
4. **Pseudonymous provenance.** Public provenance uses an opaque creator handle, never a display name derived from a real name. Fork provenance never points at a working-repo URL.
5. **Child-authored text and uploads.** Child-written dialogue and titles, and sprites derived from uploads, live in the **DB** (design data) and appear in the export as placeholders, unless the guardian has granted the "publish my child's creations" scope for that game. In-product forks copy from the DB (§5.17), so forks inside Game Maker keep working either way.

## 3. Recommendation

1. **Sign-in.**
   - Keep Better Auth.
   - Adults choose Google or an email link.
   - Children sign in with a guardian-enrolled passkey. Children with Family Link accounts may also use Google.
   - No account depends on Google. This satisfies Google's mixed-audience rule, and Google can be turned off without stranding anyone.
2. **Consent.**
   - The guardian signs in, reads a one-page notice with the retention table, chooses scopes, and returns the signed form.
   - Kevin activates the guardian edge.
   - Re-consent is required on material change, for example a new vendor receiving child data.
   - Before any child data reaches a vendor, collect that vendor's written assurances (§312.8(c)) and list them in the notice.
3. **Authority.** Admins control safety settings. Guardians own consent scopes and data rights. Inviters gain nothing from inviting.
4. **Oversight and retention.**
   - Parents get game access, the change log, the refusal digest, and the data page.
   - No transcript archive.
   - Adopt the C2 table as the draft written retention policy.
5. **Source.** Private working repo plus a deterministic, linted public release export. Child text and uploads stay out of the export unless the guardian grants the scope.
6. **Documents (cheap; draft before the first child signs in):**
   - online notice with the retention policy;
   - direct notice and consent form;
   - one-page written security program;
   - vendor assurance checklist.
7. **Test:** one real Family Link account through the flow on Kevin's iPad, in Safari and as a home-screen app (A3 [U] items).

## 4. Decisions for Kevin

**K1 — How do children sign in, given Google's mixed-audience rule?**

- (a) Google sign-in stays optional for everyone, and every account also has a passkey or email-link path. Kids may use Family Link Google accounts.
- (b) Children always use a guardian-enrolled passkey. Adults use Google or an email link. **Recommended:** a 5-year-old needs no Google account, there is no Family Link approval friction on each device, and the Google-policy risk for child accounts disappears.
- (c) Google only, for everyone, as §4.4 now says. This conflicts with Google's policy, and Google could suspend the OAuth client.
- *Consequence:* (a) and (b) both change §4.4's "Google for adults and children". (b) adds a guardian enrollment step per device.

**K2 — Which consent method?**

- (a) Signed form returned as a scan or photo, tied to the guardian's signed-in account, plus a confirmation email. **Recommended:** it is a listed method, it is free, and it stays valid however counsel rules on vendors and public source.
- (b) Email plus only: parent sign-in, "I approve", then a confirmatory email. Lowest friction, but valid only if we never "disclose", which depends on counsel.
- (c) Recorded video call with Kevin. "Trained personnel" fit is uncertain.
- *Consequence:* (a) means one form per child, plus a new form when scopes or vendors materially change.

**K3 — How much of a child's game goes into public source?**

- (a) Every release is exported automatically, including child-authored text and derived uploads, after lint.
- (b) Release export is automatic for code, design, and licensed assets. Child-authored text and uploads become placeholders unless the guardian grants the scope per game. **Recommended:** source stays open by default, and identifiable or creative child content is published only with guardian consent.
- (c) No public export for child-owned games, as in A7 S1.
- *Consequence:* under (b), a public-repo copy of a child's game may show placeholder dialogue until the guardian opts in. In-product forks are unaffected.

**K4 — Can a non-guardian family admin turn on data-collecting features for a child?**

- (a) No. Admins can only make settings stricter; voice, uploads, and publishing need guardian consent. **Recommended:** COPPA ties consent to the parent, and §10.1 already separates scope approval from consent.
- (b) Yes, if the guardian has pre-consented to that scope. Functionally the same as (a), with more UI.
- (c) Yes, freely. This contradicts §312.5.
- *Consequence:* this narrows §4.1's "any admin may adjust parental controls" for data scopes only. Safety controls stay with any admin.

## 5. Where a lawyer is genuinely needed

These questions need qualified US privacy counsel. A memo like this cannot settle them.

1. **Applicability.** Is a free, invite-only, family-run service an "operator… for commercial purposes"? Does that change once other families join, or if Kevin ever charges?
2. **Vendors.** Are LLM, STT, and hosting providers that process child data only to provide the service "support for internal operations" (not third parties), or "integral" disclosures? The answer decides whether email plus is available and whether separate consent screens are needed.
3. **Public export.** Is publishing child-authored text or drawings, without names, a "disclosure" of personal information?
4. **State law** in the states where the children live: state privacy and age-appropriate-design laws [U; not researched here]. Also non-US users, if any (the UK Children's Code is cited in A8).
5. **Records after deletion.** How long to keep consent records once an account is deleted. Final review of the notice, retention policy, and security program before the service opens beyond Kevin's own family.

Counsel is **not** needed for: the retention table's mechanics, scrub controls, Google's sign-in policy (a product choice), or the oversight design.

## 6. Uncertainty

- **Not tested:** the actual Family Link third-party approval screens, the current control-level names, iPad Safari and standalone-mode behavior.
- **Classification:** whether Google would classify Game Maker as "primarily child-directed" or "mixed audience" is unknown. The recommendation is designed to be safe under either.
- **FTC FAQ:** read through a summarizing fetch, so its quotes are partial [V for the quoted fragments only]. The eCFR rule text was read in full for §§312.2, 312.4(d), 312.5, 312.6, 312.8, and 312.10.
- **Retention periods:** every period in C2 is a proposal. None is a legal minimum or maximum.
- **Scope:** state laws and non-US law were not researched.

## 7. Sources (all accessed 2026-10-21)

- Google API Services User Data Policy (child-directed and mixed-audience sections; updated 15 Feb 2024): https://developers.google.com/terms/api-services-user-data-policy
- Google OAuth 2.0 policies (embedded user-agents, brand verification): https://developers.google.com/identity/protocols/oauth2/policies
- Google Cloud Help, OAuth verification requirements: https://support.google.com/cloud/answer/13464321 ; https://support.google.com/cloud/answer/13463073
- Family Link, third-party sites and apps: https://support.google.com/families/answer/9204736
- Family Link, sign your child in to Google websites: https://support.google.com/families/answer/9043123
- Family Link, iPhone/iPad sign-in: https://support.google.com/families/answer/9037996
- Family Link, supervision features: https://support.google.com/families/answer/9055704 ; https://support.google.com/families/answer/9468477
- Family Link FAQ: https://families.google/familylink/faq/
- Google privacy notice for children's accounts: https://families.google.com/familylink/privacy/child-policy ; https://families.google.com/familylink/privacy/notice
- Android Police, kids' third-party sign-in (2021, secondary): https://www.androidpolice.com/2021/06/10/google-accounts-for-kids-can-now-finally-sign-into-third-party-apps/
- 16 CFR Part 312 (COPPA Rule, as amended 90 FR 16977, 22 Apr 2025), eCFR: https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-312
- FTC, Complying with COPPA: FAQs (FAQs F.1–F.3, I.3–I.4, I.8–I.10, K.1–K.2, L.1): https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions
- Internal: A5, A6, A7, A8 (docs/research/v0.3), B2 and B6 (docs/research/v0.4).
