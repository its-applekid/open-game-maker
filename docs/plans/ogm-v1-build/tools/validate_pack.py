#!/usr/bin/env python3
"""Validate the OGM V1 planning pack before promotion (Stage 7).

Checks: every ticket in build-order.json has tickets/<ID>.md and tickets/<ID>-plan.md with the required headings; ids are
unique; every depends_on/serializes_with/suggested_after resolves; phases are antichains; every requirement in
requirements.md (R-IDs) has at least one ticket; decision refs exist in decisions.md; external gates exist; the plan context
block links the plan file. Exit 1 on errors; warnings are printed.

    python3 -I docs/plans/ogm-v1-build/tools/validate_pack.py
"""
import json, os, re, sys

PACK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REQUIRED_TICKET_HEADINGS = ["## Plan context", "## Outcome", "## Context and evidence", "## Scope", "## Non-goals",
                            "## Existing owner and reuse target", "## Contract and invariants", "## Refreshable implementation notes",
                            "## Acceptance and verification", "## Surfaces", "## Sibling boundaries and open gates"]
REQUIRED_PLAN_SECTIONS = ["Problem frame", "Patterns to follow", "Implementation units", "Verification", "Deferred to implementation", "Scope boundaries", "Risks"]

def main():
    errors, warnings = [], []
    pack = json.load(open(os.path.join(PACK, "build-order.json")))
    tickets = pack["tickets"]
    ids = [t["id"] for t in tickets]
    if len(ids) != len(set(ids)): errors.append("duplicate ticket ids")
    idset = set(ids)
    level = pack["graph_summary"]["levels"]
    for t in tickets:
        for key in ("depends_on", "serializes_with", "suggested_after"):
            for d in t[key]:
                if d not in idset: errors.append(f"{t['id']}: {key} references unknown {d}")
        for d in t["depends_on"]:
            if level[d] >= level[t["id"]]: errors.append(f"{t['id']}: phase {level[t['id']]} not after {d} phase {level[d]}")
        doc = os.path.join(PACK, t["document"])
        plan = doc.replace(".md", "-plan.md")
        if not os.path.exists(doc): errors.append(f"{t['id']}: missing {t['document']}"); continue
        text = open(doc).read()
        for h in REQUIRED_TICKET_HEADINGS:
            if h not in text: errors.append(f"{t['id']}: ticket doc lacks '{h}'")
        if f"tickets/{t['id']}-plan.md" not in text: warnings.append(f"{t['id']}: plan context does not link {t['id']}-plan.md")
        if "9508c1c46735e442a2e07a1bffad2bb9f190da8d" not in text: warnings.append(f"{t['id']}: researched commit not stated")
        n = text.count("\n")
        if n > 220: warnings.append(f"{t['id']}: ticket doc is {n} lines (long for an issue body)")
        if not os.path.exists(plan): errors.append(f"{t['id']}: missing {os.path.basename(plan)}"); continue
        ptext = open(plan).read()
        for h in REQUIRED_PLAN_SECTIONS:
            if h.lower() not in ptext.lower(): warnings.append(f"{t['id']}: plan lacks section '{h}'")
        if ptext.count("\n") < 80: warnings.append(f"{t['id']}: plan is only {ptext.count(chr(10))} lines")
    # requirements coverage
    req_text = open(os.path.join(PACK, "requirements.md")).read()
    rids = set(re.findall(r"^- (R\d+)\.", req_text, re.M))
    covered = {r for t in tickets for r in t["requirement_refs"]}
    for r in sorted(rids - covered, key=lambda s: int(s[1:])): warnings.append(f"requirement {r} has no ticket")
    for r in sorted(covered - rids, key=lambda s: int(s[1:])): errors.append(f"ticket references unknown requirement {r}")
    dec_text = open(os.path.join(PACK, "decisions.md")).read()
    for t in tickets:
        for d in t["decision_refs"]:
            if f"| {d} |" not in dec_text: errors.append(f"{t['id']}: decision {d} not in decisions.md")
    gates = {g["id"] for g in pack["external_gates"]}
    for t in tickets:
        for g in t["external_gates"]:
            if g not in gates: errors.append(f"{t['id']}: gate {g} undefined")
    phases = pack["graph_summary"]["phase_count"]
    if not 5 <= phases <= 10: warnings.append(f"phase count {phases} outside the 5–10 budget")
    for w in warnings: print("warning:", w)
    for e in errors: print("ERROR:", e)
    print(f"{len(tickets)} tickets, {phases} phases, {len(errors)} errors, {len(warnings)} warnings")
    sys.exit(1 if errors else 0)

if __name__ == "__main__":
    main()
