# B9 — General-audience reframe: COPPA, Google sign-in, and vendor terms

- **Question:** What changes if Game Maker is a general, all-ages product for anyone, and children use it only through child accounts that a parent creates?
- **Inputs:** spec v0.4 §1, §4, §10; B1 (minors rows), B2 §3.1, B3, B5 §2.1; A8.
- **Sources:** primary sources only, accessed **2026-10-22** (§11).
- **Labels:** **[V]** verified against the primary text today. **[I]** inferred. **[U]** unverified.
- **Scope:** research only. Nothing was signed up for or sent to any vendor. **I am not a lawyer. This memo is not legal advice.**

> **Operational supersession (2026-11-03):** V1 keeps its adult-only product scope, but the operator allow-list now controls admission and sign-in has no birth-date screen, server attestation or age cookie. The V1 screen-specific analysis below is retained as a dated research record, not current implementation guidance. V3's mixed-audience recommendations remain future research.

> **Version scope (2026-10-25):** Read this memo through `docs/spec/release-plan.md`; the decision log wins on conflict. The three age bands now arrive one per version: **V1 is adults only (18+)**, **V2 adds teens (13–17)**, **V3 adds children (under 13)** with parental controls. What applies where:
> - **V1:** §2a (new, adult-only posture), the general-audience column of §3, the age-screen specifics in §3 (screening at 18), §4 (sign-in), the "Adult accounts OK?" column of §5, the adult-account line in §6, §7 rows marked V1, §9 Q7–Q9.
> - **V2 (teens):** under-18 vendor routing (§5 key distinction, §6 "minor accounts"), D2, §9 Q5.
> - **V3 (children):** mixed-audience positioning (§2), child-account obligations and the parent flow (§3), the "Child-account features OK?" column (§5), the child protections in §6, D1 (b), §9 Q1–Q4.
> - **Changed assumptions:** the memo was written for an all-ages launch with child accounts. V1 now has no child accounts and no minors, so V1 is a general-audience service, not mixed audience [I]. Email is mandatory on every account (Decided). Paid art generators are not in V1 (Decided). Sections below carry **(V1)**, **(V2, teens)** or **(V3)** tags where this matters.

## 1. TL;DR

- **(V1) An adult-only V1 is a general-audience service** [I]. With an 18+ age screen and no child accounts, COPPA applies only on actual knowledge of a child's data (§312.3) [V], and each vendor's ordinary adult terms apply. See §2a. The bullets below describe the V3 product with child accounts.
- **(V3) The FTC will probably not see this as a pure "general audience" service.** If any part of the intended audience is under 13, the FTC treats the service as "directed to children", even when kids are only a portion of that audience. A deliberate child-account feature shows that intent. The realistic target is **"mixed audience"**: directed to children, but not mainly. That category lets us run an age screen and apply COPPA only to users under 13 [V rule text, I applied].
- **The mixed-audience structure fits the product well.** Ask age neutrally *before* collecting anything else (including Google sign-in). Treat users who say they are under 13 as children: get a parent's contact, then the parent creates the child account. Under this structure, COPPA's obligations apply only to child accounts [V].
- **Google sign-in can be offered to adults, but not required.** Google's mixed-audience rule says the app must work "in its entirety" without a Google account. Google could be required only if the service were purely general audience, which is a risky claim (§4).
- **Vendor terms test for under 18, not under 13. Many do not care about our COPPA category.** Gemini/Vertex generative AI ("likely to be accessed by" minors) and fal.ai ("End Users are at least 18") are probably still blocked **product-wide**, even for adult features. The reframe mainly helps ElevenLabs and vendors whose terms only set an age for the account holder.
- **Most protections can apply per account.** Adult accounts (V1) get the whole product with no supervision. Teen accounts (V2) and child accounts (V3) get a gated vendor list, content limits, and scrubbed public export.
- **The biggest classification risk is evidence, not design.** Right now the evidence says the audience is two children: the founding story, the "Uncle Kevin's" name, and the first users. Reduce this with a neutral public name, adult-facing marketing, and adult early users.

## 2a. V1 posture: adults only (added 2026-10-25)

- **Category [I]:** with no child accounts and an age screen that turns away under-18s, V1 fits the "general audience" column of §3. A general-audience service has COPPA duties only with "actual knowledge" of collecting a child's personal information (§312.3) [V]. It may screen and block under-13s (FAQ H.3) [V]. The mixed-audience bar on blocking children (FAQ D.6) does not apply, because V1 offers no child feature [I].
- **Age screen [I]:** use the neutral design in §3 (free birth month and year, a cookie against retries), but screen at 18, not 13. Under-18s are turned away, and nothing but the cookie is kept. Teens are turned away too, because V1 has no minor vendor routing.
- **Actual knowledge (V1) [I]:** if a report shows an account belongs to a minor, delete it and its data. Conversion to a teen or child account waits for V2 or V3.
- **Vendors [I]:** an adult-only service is not "directed at" under-18s, so ElevenLabs' written approval is not needed for V1, and OpenAI's and Anthropic's minors rules do not apply. Gemini/Vertex generative AI and fal.ai are weaker blocks for an adult-only service, but the decision log keeps them out until each confirms in writing, and V2 or V3 would bring the block back.
- **Risks that remain [I]:** the intended-audience factors in §2 condition 3 still count. The rule lists "plans" among them [V, §312.2]. Published V3 plans for child accounts, the origin story and the "Uncle Kevin's" name could argue that the service is partly directed at children even before V3. Keep V1's public pages adult-facing, and ask the lawyer (§9 Q7).
- **Children playing in V1** (release plan §6 Q2): see §9 Q8. Letting a child play on a parent's signed-in device is a deliberate child use, not an absence of knowledge [I]. Game play can collect a child's personal information: persistent identifiers, saves, and voice if a game uses the microphone (games may use it, per the decision log). Whether the internal-operations exception (§312.5(c)(7)) covers this is for the lawyer [U].

## 2. Positioning verdict and conditions (V3)

**Verdict [I]:** For V3, with child accounts, build for **mixed audience**, and present the product as general audience. Do not claim to be "general audience, therefore exempt". Under FAQ D.3, a service that intentionally offers child accounts has "an intended audience [that] includes kids under 13, even if that is only a portion" [V]. The FTC says mixed audience is "a subset of the 'directed to children' category" (FAQ D.4) [V]. A mixed-audience service may not block children outright (FAQ D.6) [V]. Child accounts are how we satisfy that.

**Conditions that keep children from being the *primary* audience:**

1. **Subject matter: a game maker for anyone.** Video-game sites can be general or mixed audience (FAQ H.5) [V]. Do not lead with child-oriented activities such as "dress-up games or playing with toys" (FAQ D.3) [V]. Templates should cover all ages, not focus on toddlers.
2. **Visuals.** "Some animated characters are directed to a general audience" (FAQ D.3) [V]. Default to a neutral, adult-legible UI. Kid mode should be a presentation layer turned on by child accounts (spec §1.1 already says this).
3. **Intended-audience evidence.** Since 2025 the rule names "marketing or promotional materials or plans, representations to consumers or to third parties, reviews by users or third parties, and the age of users on similar websites" [V, §312.2]. Every public page, README, and store listing should describe a tool for adults and families, not a kids' app.
4. **Ads.** None directed at children [V factor].
5. **Empirical audience.** Have adult creators among the early users, and keep a count of accounts by age band (adult, teen, child) as evidence [I]. V1 has only adults, which helps here [I].
6. **Signup order.** A neutral age screen comes first. Under 13 routes to the parent flow (§3) (V3). In V1 the screen turns away under-18s (§2a).

If conditions 1–5 fail, the service drifts toward *primarily* child-directed. Then COPPA applies to every user and Google sign-in is out entirely [V, Google policy].

## 3. COPPA under each positioning

| | General audience | Mixed audience (recommended) | Child-directed (primary) |
|---|---|---|---|
| Rule text | Covered only with "actual knowledge" of collecting a child's personal information (§312.3) [V] | "Shall not be deemed directed to children with regard to any visitor not identified as under 13" (§312.2 (3)) [V] | All visitors treated as children (FAQ D.4) [V] |
| Age screen | Not required (FAQ A.12) [V]; may block under-13s (FAQ H.3) [V] | Required **before** collecting personal information; neutral, "does not default to a set age" (§312.2) [V] | Not allowed for limiting protections [V] |
| Under-13 handling | Actual knowledge triggers notice and consent, or deletion (FAQ H.1) [V] | Either collect nothing from them or get verifiable parental consent; may not block (FAQ D.6) [V] | Consent for everyone |
| Fits our product? | Only if there are no child accounts: **V1 and V2** [I] | **Yes, for V3** [I] | Overreach; contradicts §1.1 [I] |

**Obligations by scope [V rule, I mapping]:** the lists below are for the V3 mixed-audience product. In V1 (general audience) the product-wide duties shrink to the age screen, honest marketing and the actual-knowledge procedure (§2a) [I].

- **(V3) Child accounts only (under 13, known):**
  - verifiable parental consent;
  - direct notice to the parent;
  - separate consent for non-integral disclosure (§312.5(a)(2));
  - parent review and deletion (§312.6);
  - data minimization (§312.7);
  - a written retention policy covering *children's* data (§312.10);
  - vendor assurances before child data reaches a vendor (§312.8(c)).
  - B3's consent flow, retention table and guardian model stay, scoped to child accounts.
- **(V3) Product-wide:**
  - the neutral age gate;
  - an online notice that describes children's data practices (§312.4(d));
  - a written security program, because child data will sit in shared infrastructure (§312.8(b));
  - honest marketing;
  - an actual-knowledge procedure. Example: a parent reports that an "adult" account is really their child (FAQ H.1). The account converts to a child account or is deleted.
- **Not required for adult accounts:** consent, transcript limits, vendor gating, export scrub. Ordinary privacy law still applies. State laws were not researched (§10).

**Neutral age screen specifics [V, FAQ D.7, H.3]:**

- Free entry of birth month and year.
- No "you must be 13" wording and no "ask your parent" hint before the screen.
- A cookie stops a user from going back and entering a different age.
- A math question alone is not enough (D.8).
- (V1) The same design applies with 18 as the cut-off (§2a) [I].

**Flow [I]:**

1. Age screen.
2. (V3) If under 13: collect only the parent's email, which §312.5(c)(1) allows. Send the parent the direct notice. The parent creates the child account and gives consent (B3 flow).
3. (V2) If 13–17: normal signup. Store the age band for vendor routing.
4. If 18 or older: normal signup. In V1, anyone under 18 is turned away at step 1.

**Invitations:** (V3) If an adult invites a player and marks them as a child, that is actual knowledge. The invitee goes through the parent flow. A child invitee must never land on adult signup [I]. (V1) Invites are for adults only. Every invitee passes the 18+ screen. An invite flagged as for a minor is not sent, and the address is not kept [I].

## 4. Google sign-in

Google API Services User Data Policy (last updated 15 Feb 2024) [V]:

- COPPA applies to child-directed services "and general audience apps… with users known to be under the age of 13".
- "**Child-directed apps**: If your application is directed primarily at children, it should not use Google Sign-In…"
- "**Mixed audience apps**: …shouldn't require users to sign in to a Google Account, but can offer… Google Sign-In… as an optional feature. In these cases, users must be able to access the application in its entirety without signing into a Google Account."
- It sends developers to the FTC's mixed-audience guidance.

What this allows:

- **Primarily child-directed:** no Google sign-in at all [V].
- **Mixed audience (our verdict):** Google sign-in may be offered to adults. It may not be required of *users*. Every user, adults included, must be able to reach the whole app without Google [V]. Child accounts using a guardian-enrolled passkey satisfy the child side. Adults also need a non-Google path, such as an email link or passkey [I].
- **Pure general audience:** the policy text sets no limit, so Google could be required for adults [V, by absence], while child accounts use another method. This depends on claiming general-audience status, which §2 says is weak. If Google disagreed, it could suspend the OAuth client and strand every adult account [I].
- **Order matters:** Google sign-in returns name and email, which are personal information. In a mixed-audience flow it must come *after* the age screen [V §312.2 + I].

**Net:** B3 K1 stands (Google optional, non-Google path for all); the reason is now the mixed-audience clause.

**V1 [I]:** V1 is general audience, so the policy would not bar required Google. It doesn't matter: email is mandatory on every account (Decided), so a non-Google path always exists. That also keeps V1 compliant when V3 makes the service mixed audience.

## 5. Vendor table

Key distinction: COPPA's threshold is **13**, but most vendor clauses use **18**. A general product will have teens with ordinary accounts. Vendor gating therefore has to key on **under 18**, not on "child account". This begins in V2, when teens arrive. In V1 every user is 18+, so only the "Adult accounts OK?" column applies, and it applies to an adult-only service (a stronger position than the mixed-audience reading below) [I].

| Vendor | Trigger wording (exact) | Adult accounts OK? (V1) | Child-account features OK? (V3) | Conditions |
|---|---|---|---|---|
| **ElevenLabs** (all products incl. Agents) | "Apps, products, or experiences **directed at** individuals under 18 are prohibited unless we have assessed and approved them in writing"; account holder 18+ [V, Use Policy 9 Oct 2026]. The Agents Terms add consent-records duties (keep 5 yrs) and an under-13 bar for Reception only [V, 9 Oct 2026]. | **Probably yes** [I]: a general product is not "directed at" under-18s | **No without written approval** [I]: kid mode is plausibly an "experience directed at" minors, even when only adult or agent text is narrated | Gate to 18+ accounts. Ask ElevenLabs whether a general product with child accounts needs approval. Agents vs plain TTS/STT: same Use Policy rule [V] |
| **OpenAI** | Organizations "serving minors (under 18)" add safeguards; "should not… process any personal data of children under 13… without first implementing zero data retention" [V]. Services Agreement: no minors "without consent from their parent or guardian" (B1 OA3) [V via B1] | Yes [V] | Yes, with safeguards and parental consent. Child personal data needs approved ZDR [V]. Scrubbed agent prompts are probably not personal data [I] | Send child scoping conversations elsewhere, or obtain ZDR |
| **Anthropic** | "Products serving minors, including organizations providing minors with the ability to directly interact…" must follow the guidelines; minor = under 18 [V, AUP eff. 12 Nov 2026]. Guidelines: AI disclosure "must"; age checks, moderation, monitoring "should"; state COPPA compliance publicly [V, 16 Mar 2026] | Yes [V] | Yes, with the guidelines [V]. No ZDR requirement found [V, by absence] | Best fit for child-facing conversation |
| **Google Gemini API** (incl. Lyria, Veo, Nano Banana) | "will not use the Services as part of a… service that is directed towards **or is likely to be accessed by** individuals under the age of 18" [V, updated 28 Apr 2026] | **Probably no** [I]: an all-ages product with child accounts is "likely to be accessed by" minors as a whole | No | The trigger is the whole service, not the data. The reframe does not help |
| **Google Vertex / Cloud generative AI** | §(d) Age Restrictions, same "likely to be accessed by" wording. "Generative AI Services also includes any generative AI features… of a Service" [V, modified 12 Oct 2026] | Probably no [I] | No | Classic Cloud STT/TTS is listed as an AI/ML service, not generative AI [V]. Generative voices inside them (Chirp HD, Gemini-TTS) may be caught by the catch-all [I] |
| **fal.ai** | "you are responsible for ensuring that your **End Users** are at least 18"; End Users = "end user customers who use the Customer Solution" [V, 8 Sep 2026] | Doubtful [I]: children use the same Customer Solution | No | Needs written confirmation that operator-side generation for an all-ages product is allowed. Otherwise avoid |
| **Meshy** | Account holder 14+; under 18 needs parental permission [V, 19 Sep 2026]. No end-user clause found | Yes [I] | Yes with agent-written prompts only [I] | Trains on non-Enterprise uploads (A8). Never send child uploads |
| **Stability** | Account 18+ (images), 13+ (audio) [V]. No end-user clause found | Yes [I] | Yes with agent-written prompts only [I] | — |
| **Recraft** | Developer 18+; no end-user age stated [V, 20 Oct 2026] | Yes | Yes with agent-written prompts only [I] | — |
| **Deepgram** | Account 18+. May use content to train, with a "perpetual" license [V, 6 Aug 2026] | Yes | Only with training opt-out and §312.8(c) assurances if child audio is sent [I] | Prefer no child audio |
| **Cartesia** | Account 18+, US residents [V, terms 14 Jun 2024]. AUP: no "Output that relates to, or appears… to relate to or represent, individuals under the age of 18" [V, AUP 23 Jul 2025] | Yes, but no child-character voices | Risky: the trigger is the *content*, so narrating a child character may breach it [I] | Clarify with Cartesia |
| **Azure Speech** | No child clause found (B2) [U]. Product Terms did not render today | Yes [U] | Probably [U] | Recheck the Product Terms |
| **AWS** (Polly, Transcribe) | Only Lex has a child clause (§50.4: "directed or targeted, in whole or in part, to children under age 13" → notify AWS). §50.3: may use AI content unless the org opts out [V, 22 Oct 2026] | Yes | Yes, with the AI opt-out [V/I] | — |
| **E2B** | Account holder 18+ [V, 4 Dec 2024]. No end-user clause found | Yes | Yes [I] | Processor: get assurances. Keep child personal data out of sandboxes |
| **Railway** | Account holder 16+. Its COPPA statement covers only Railway's own users [V, 20 Apr 2026]. Has a DPA [V link] | Yes | Yes [I] | Service provider for child data: get §312.8(c) assurances (DPA) |

**Pattern [I]:**

- **Account-holder-only clauses** (Meshy, Stability, Recraft, Deepgram, E2B, Railway) never blocked us. Kevin is the account holder.
- **"Directed at" clauses** (ElevenLabs) are what the reframe actually fixes, for adult features.
- **"Likely to be accessed" and end-user-age clauses** (Google, fal) follow the *service*. No per-account gating cures them, short of a separately branded adult-only service.

## 6. Child-account-scoped protections (V2 teens, V3 children)

"Minor account" below means child accounts (under 13, V3) plus teen accounts (13–17, V2) for vendor purposes. COPPA items apply to under-13 only. None of this section is in V1 except the adult-account line at the end.

1. **Voice providers.**
   - Minor accounts are routed only to vendors cleared for minors: Anthropic, OpenAI with ZDR, self-hosted STT (B2), Azure or AWS with opt-out.
   - Narration for minor sessions uses the same list.
   - ElevenLabs, Gemini and Cartesia child-character voices are excluded.
2. **Content limits.** Spec §10.8's always-off baseline is product-wide. Stricter genre, combat and theme presets apply to child accounts and are adjustable by admins (§10.1).
3. **Public-source export.**
   - Child-owned games get the B3 D3 scrub: placeholders for child text and uploads unless the guardian grants the scope.
   - Adult games export normally, minus ordinary secrets and PII lint.
   - The private working repo stays for everyone, since agent text is noisy (B3 D1) [I].
4. **Retention.** B3's C2 table applies to child accounts. Adult accounts get a simpler policy, for example 30-day transcripts by default [I].
5. **Invitations.** Off by default for child accounts (§4.3). An invite to a child goes through the parent flow.
6. **Generative tools.**
   - Minor accounts use only minor-cleared vendors, with agent-written prompts and no raw child text.
   - Restricted vendors are not used anywhere (§5).
7. **Uploads.** Child accounts get browser re-encoding, EXIF stripping and face rejection, behind a guardian scope (B3). Adults get EXIF stripping as basic hygiene.
8. **AI disclosure and moderation** for minor accounts (Anthropic and OpenAI guidelines).

**Adult account (V1):** email required on every account, plus passkey and/or Google (decision log; method still open), every §5-cleared vendor, normal UI, no guardian, EXIF-stripped uploads, normal export, ordinary retention.

## 7. Risks and mitigations

| Risk (evidence the FTC or a vendor might weigh) | Mitigation |
|---|---|
| **Founders' family as the only users.** "Empirical evidence regarding audience composition" [V factor] | (V1) V1 users are the household's adults and invited adults, which helps. (V3) Recruit adult creators early, and log the age-band mix. Once child accounts exist, treat the service as mixed audience |
| **(V1) Published plans for V3 child accounts** count among "plans" and "representations" [V factor, I applied] | Keep V1 public copy adult-facing. Ask the lawyer whether stated V3 plans change V1's category (§9 Q7) |
| **(V1) Children playing on a parent's device** (release plan §6 Q2 (b)) is deliberate child use [I] | Do not adopt (b) until the lawyer answers §9 Q8 |
| **The "Uncle Kevin's" name and the origin story** ("built with my 7-year-old nephew") are intended-audience representations [V factor] | Use "Open Game Maker 2000" publicly. Tell the origin story as "a family game maker for everyone", not "for kids" |
| **(V3) Kid-friendly mode** is a "portion thereof… targeted to children" [V definition] | Fine, if only child accounts can reach it and COPPA already applies there. Never make it the default landing UI |
| **Cartoon art and bright templates** | FAQ D.3 allows general-audience animation [V]. Keep the template mix all-ages, and the starter gallery not toddler-themed |
| **(V2) Teens 13–17 on adult-tier vendors** breach under-18 vendor clauses even when COPPA is satisfied [I] | Store the age band. Treat 13–17 as minors for vendor routing |
| **Google or fal judge that "likely to be accessed" applies** | Do not use them. If ever needed, get written approval |
| **An adult account that is really a child** | Actual-knowledge procedure: convert or delete promptly (FAQ H.1). In V1, delete; there is nothing to convert to |

## 8. Decisions for Kevin

**D1 — How do we position the product?**
- (a) Pure general audience: no child accounts; under-13s blocked or handled only through actual knowledge.
- (b) **Mixed audience by design**: neutral age screen first, parent-created child accounts, kid mode only for child accounts. **Recommended:** it matches the spec's all-ages product with child accounts, and it is the reading the FTC text supports.
- (c) Child-directed: every user gets COPPA treatment.
- *Consequence:* (b) adds an age screen before sign-in and confines COPPA work to child accounts. (a) drops child accounts. (c) removes Google sign-in and most vendors.
- *Status (2026-10-25):* V1 and V2 are effectively (a), with the screen at 18 in V1 (Decided: adults only). (b) is the V3 target, still a recommendation.

**D2 — How are teens (13–17) treated? (V2)**
- (a) Same as adults.
- (b) **Adult product, minor vendor routing. Recommended:** vendor clauses use under 18, and this costs only a routing flag.
- (c) Teens need a parent too.
- *Consequence:* (a) breaches the ElevenLabs and OpenAI under-18 terms for teen users.

**D3 — How do adults sign in?**
- (a) **Google optional, plus email link or passkey. Recommended:** it complies under mixed audience, and no account depends on Google.
- (b) Google required for adults. Valid only under pure general audience; risks the OAuth client.
- *Consequence:* (a) changes spec §4.4.
- *Status:* email is mandatory on every account (Decided). Passkey only, Google only, or both is still open. "Google only" would still carry an email address, but leaves no non-Google sign-in for V3 [I].

**D4 — What do we do about "likely to be accessed" vendors (Gemini/Vertex generative AI, fal)?**
- (a) Drop them.
- (b) **Ask each in writing. Do not use them until they answer. Recommended:** cheap, and the alternatives in B5 cover the need.
- (c) Use them for adult-only features now.
- *Consequence:* (c) probably breaches the text as written.

**D5 — What is the public name?**
- (a) **"Open Game Maker 2000". Recommended:** reads as all-ages.
- (b) Keep "Uncle Kevin's".
- *Consequence:* (b) weakens the intended-audience argument.
- *Status:* (a) adopted 2026-10-21.

## 9. Lawyer questions

Q1–Q4 and Q6 are for V3 (child accounts). Q5 matters from V2 (teens). Q7–Q9 are for V1.

1. (V3) Given a child-account feature and the founders' children as first users, is this service mixed audience or primarily child-directed? What evidence would move that line?
2. Does a parent-only child-account flow, preceded by a neutral age screen, satisfy the mixed-audience definition, including collecting the parent's email under §312.5(c)(1)?
3. Is the commercial-purpose test met for a free service (carried over from B3)?
4. Are LLM, voice and hosting vendors "support for the internal operations" or third parties (from B3)?
5. Which state laws apply: age-appropriate design codes that use "likely to be accessed", and minors' consent laws? These may reach teens and override per-account scoping.
6. Can contract text such as fal's "End Users" and Google's "likely to be accessed" be cured by technical separation (for example, an adult-only subdomain), or only by vendor approval?
7. (V1) Is an adult-only V1 with an 18+ neutral age screen a general-audience service, given the origin story, the first users' households, and published plans for V3 child accounts? Do those plans count as intended-audience evidence before V3 ships?
8. (V1) May children play (not make) games on a parent's signed-in device, with no child profile (release plan §6 Q2 (b))? Does that give actual knowledge? Are persistent identifiers, saves and in-game microphone use covered by the internal-operations exception, or do they need parental consent? Does it make V1 "directed at" under-18s for ElevenLabs?
9. (V1) Confirm that each V1 vendor's ordinary adult terms cover an adult-only service run on Kevin's accounts for invited adults.

## 10. Uncertainty

- **FAQ date.** The FTC FAQ is dated July 2020, with civil-penalty figures edited in January 2025. It predates the 2025 rule's codified mixed-audience definition. The rule text was read directly [V].
- **Vendor readings** of ElevenLabs, Google and fal clauses are inference; only written answers settle them.
- **Stale or missing:** Azure Product Terms did not render [U]; Cartesia terms dated 2024; E2B terms dated Dec 2024.
- **Not researched:** state and non-US law.

## 11. Sources (accessed 2026-10-22)

- 16 CFR Part 312, as amended (eCFR): https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-312 (§§312.2, 312.3)
- FTC, Complying with COPPA FAQs (A.12, D.1–D.8, H.1–H.5): https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions
- Google API Services User Data Policy: https://developers.google.com/terms/api-services-user-data-policy
- ElevenLabs: https://elevenlabs.io/use-policy ; https://elevenlabs.io/terms-of-use ; https://elevenlabs.io/agents-terms
- OpenAI under-18 guidance: https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance
- Anthropic: https://www.anthropic.com/legal/aup ; https://support.claude.com/en/articles/9307344
- Gemini API terms: https://ai.google.dev/gemini-api/terms ; Google Cloud: https://cloud.google.com/terms/service-terms , https://cloud.google.com/terms/services
- fal.ai: https://fal.ai/terms ; Meshy: https://www.meshy.ai/terms-of-use ; Stability: https://stability.ai/terms-of-service ; Recraft: https://www.recraft.ai/legal/developer-terms ; Deepgram: https://deepgram.com/legal/terms ; Cartesia: https://cartesia.ai/legal/terms , https://cartesia.ai/legal/acceptable-use ; AWS: https://aws.amazon.com/service-terms/ ; E2B: https://e2b.dev/terms ; Railway: https://railway.com/legal/terms
