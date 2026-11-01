#!/usr/bin/env python3
"""Promote the OGM V1 planning pack to GitHub issues (Stage 8), idempotently and paced.

For every ticket in build-order.json, in phase order:
  - skip if an open or closed issue already carries the marker `<!-- gm-ticket:<ID> -->` (recorded in tickets/MAPPING.json);
  - otherwise `gh issue create` with the ticket document as the body (marker appended) and every label in the same request:
    feature:ogm-v1, build-lane:<lane>, phase:<n>, complexity:<n>, agent:queued (+ agent:todo for phase 1 and --todo-phases);
  - record the issue number in tickets/MAPPING.json and build-order.json (tickets[].github).
Then write GitHub's native blocked_by links for every depends_on edge (idempotent: existing links are skipped).
Feature collection and queue membership are separate aiur writes (see the intake procedure); this script prints the
`aiur-main feature add` / `queue add` commands with the numbers, so the Executor runs them and reads them back.

    python3 -I docs/plans/ogm-v1-build/tools/promote.py [--dry-run] [--todo-phases 1] [--pace 2]
"""
import argparse, json, os, subprocess, sys, time

PACK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = "its-everdred/open-game-maker-2000"
MAPPING = os.path.join(PACK, "tickets", "MAPPING.json")

def gh(*args, input=None):
    r = subprocess.run(["gh", *args], capture_output=True, text=True, input=input)
    if r.returncode != 0:
        raise SystemExit(f"gh {' '.join(args[:3])}… failed: {r.stderr.strip()}")
    return r.stdout

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--todo-phases", default="1", help="comma-separated phases that also get agent:todo")
    ap.add_argument("--pace", type=float, default=2.0, help="seconds between GitHub writes")
    ap.add_argument("--only", default="", help="comma-separated ticket ids to promote (default all)")
    o = ap.parse_args()
    todo_phases = {int(x) for x in o.todo_phases.split(",") if x}
    only = {x for x in o.only.split(",") if x}
    pack = json.load(open(os.path.join(PACK, "build-order.json")))
    level = pack["graph_summary"]["levels"]
    mapping = json.load(open(MAPPING)) if os.path.exists(MAPPING) else {}
    # reconcile mapping with GitHub (markers), so a crash mid-run never double-files
    existing = json.loads(gh("issue", "list", "-R", REPO, "--state", "all", "--limit", "500", "--search", "gm-ticket:", "--json", "number,body"))
    for it in existing:
        for line in it["body"].splitlines():
            if line.startswith("<!-- gm-ticket:"):
                tid = line.split("gm-ticket:")[1].split(" ")[0].strip("-> ")
                mapping.setdefault(tid, it["number"])
    tickets = sorted(pack["tickets"], key=lambda t: (level[t["id"]], t["id"]))
    created = 0
    for t in tickets:
        tid = t["id"]
        if only and tid not in only: continue
        if tid in mapping:
            continue
        doc = os.path.join(PACK, t["document"])
        body = open(doc).read().rstrip() + f"\n\n<!-- gm-ticket:{tid} plan_version:{pack['plan_version']} researched:{pack['researched_at_commit'][:7]} -->\n"
        labels = ["feature:ogm-v1", f"build-lane:{t['workstream']}", f"phase:{level[tid]}", f"complexity:{t['complexity_points']}", "agent:queued"]
        if level[tid] in todo_phases: labels.append("agent:todo")
        title = f"{tid} — {t['title']}"
        if o.dry_run:
            print(f"would create {title} labels={labels}"); continue
        out = gh("issue", "create", "-R", REPO, "--title", title, "--body-file", "-", "--label", ",".join(labels), input=body)
        num = int(out.strip().rsplit("/", 1)[-1])
        mapping[tid] = num; created += 1
        json.dump(mapping, open(MAPPING, "w"), indent=1)
        print(f"created #{num} {title}")
        time.sleep(o.pace)
    # record in the pack
    for t in pack["tickets"]:
        if t["id"] in mapping:
            t["github"] = {"repo": REPO, "number": mapping[t["id"]]}
    if not o.dry_run:
        json.dump(pack, open(os.path.join(PACK, "build-order.json"), "w"), indent=1)
        open(os.path.join(PACK, "build-order.json"), "a").write("\n")
    # blocked_by links
    linked = 0
    for t in tickets:
        tid = t["id"]
        if tid not in mapping or (only and tid not in only): continue
        if not t["depends_on"]: continue
        if o.dry_run:
            print(f"would link #{mapping[tid]} blocked_by {[mapping.get(d) for d in t['depends_on']]}"); continue
        have = {x["number"] for x in json.loads(gh("api", f"repos/{REPO}/issues/{mapping[tid]}/dependencies/blocked_by") or "[]")}
        for d in t["depends_on"]:
            if d not in mapping or mapping[d] in have: continue
            dep_id = json.loads(gh("api", f"repos/{REPO}/issues/{mapping[d]}"))["id"]
            gh("api", "-X", "POST", f"repos/{REPO}/issues/{mapping[tid]}/dependencies/blocked_by", "-F", f"issue_id={dep_id}")
            linked += 1; time.sleep(o.pace / 2)
    numbers = [str(mapping[t["id"]]) for t in tickets if t["id"] in mapping]
    print(f"created {created}, linked {linked}, mapped {len(mapping)}/{len(pack['tickets'])}")
    print("next (run from the OGM checkout):")
    print(f"  aiur-main feature create ogm-v1 --label 'OGM V1' --hue 262 --json")
    print(f"  aiur-main feature add ogm-v1 {' '.join(numbers)} --json")
    print(f"  aiur-main queue add {' '.join(numbers)} --queue ogm-v1 --json")

if __name__ == "__main__":
    main()
