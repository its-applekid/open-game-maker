#!/usr/bin/env bash
# Runs the sandbox proof tests (B4 §6 3, 6, 9, 11, 13, 14 adapted to Codex/bwrap on one uid) and prints a
# Markdown results table. Exits 1 if any test FAILs.
#   --only tNN   run one test (repeatable)
#   --fleet      render t03's two daemon homes through createFleet
#   --write      also replace the proof-results block in docs/ops/sandbox.md
#   --self-test  run against deliberately wrong invocations and exit 0 only if the tests catch them
set -euo pipefail

proof_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$proof_dir/lib.sh"
doc="$OGM_REPO_ROOT/docs/ops/sandbox.md"
all_tests=(t03 t06 t09 t10 t11 t13 t14)

only=()
write=0
self_test=0
fleet=0
while (($# > 0)); do
  case "$1" in
    --only)
      [[ $# -ge 2 && " ${all_tests[*]} " == *" $2 "* ]] || {
        echo "--only takes one of: ${all_tests[*]}" >&2
        exit 2
      }
      only+=("$2")
      shift 2
      ;;
    --write) write=1 && shift ;;
    --self-test) self_test=1 && shift ;;
    --fleet) fleet=1 && shift ;;
    -h | --help)
      echo "usage: $0 [--only tNN]... [--fleet] [--write] [--self-test]"
      exit 0
      ;;
    *)
      echo "unknown argument: $1" >&2
      exit 2
      ;;
  esac
done
tests=("${only[@]}")
if ((${#only[@]} == 0)); then
  tests=("${all_tests[@]}")
fi
if ((fleet)) && { ((${#tests[@]} != 1)) || [[ "${tests[0]}" != "t03" ]] || ((self_test)); }; then
  echo "--fleet requires --only t03 and cannot be combined with --self-test" >&2
  exit 2
fi

test_name() {
  case "$1" in
    t03) echo "cross-workspace" ;;
    t06) echo "secret reads" ;;
    t09) echo "egress" ;;
    t10) echo "offline install" ;;
    t11) echo "write boundary" ;;
    t13) echo "git push" ;;
    t14) echo "resource caps" ;;
  esac
}

# --- setup: two workspaces and a CODEX_HOME with the profile rendered by OGM-037's renderer --------------
# Not under /tmp: the profile denies /tmp, and a workspace there could not be the writable root.
if [[ -n "${OGM_PROOF_ROOT:-}" ]]; then
  root_parent="$OGM_PROOF_ROOT"
elif [[ -n "${TMPDIR:-}" && "$TMPDIR" != /tmp && "$TMPDIR" != /tmp/* ]]; then
  root_parent="$TMPDIR"
else
  root_parent="$HOME/.cache"
fi
mkdir -p "$root_parent"
root="$(mktemp -d "$root_parent/ogm-proof.XXXXXX")"
trap 'chmod -R u+w -- "$root" 2>/dev/null; rm -rf -- "$root"' EXIT
if ((fleet)); then
  fleet_home="$root/fleet-home"
  export OGM_PROOF_WS_A="$fleet_home/.local/share/ogm/daemons/proof-workspace-a/workspaces"
  export OGM_PROOF_WS_B="$fleet_home/.local/share/ogm/daemons/proof-workspace-b/workspaces"
  export OGM_PROOF_CODEX_HOME="$fleet_home/.config/ogm/codex/proof-workspace-a"
else
  export OGM_PROOF_WS_A="$root/ws-a"
  export OGM_PROOF_WS_B="$root/ws-b"
  export OGM_PROOF_CODEX_HOME="$root/codex-home"
  mkdir -p "$OGM_PROOF_WS_A" "$OGM_PROOF_WS_B" "$OGM_PROOF_CODEX_HOME/runtime"
  chmod 700 "$OGM_PROOF_CODEX_HOME" "$OGM_PROOF_CODEX_HOME/runtime"
fi

codex_ok=1
command -v codex >/dev/null 2>&1 || codex_ok=0

if ((codex_ok)); then
  renderer="$OGM_REPO_ROOT/services/builder/dist/index.js"
  pnpm --dir "$OGM_REPO_ROOT" --filter @ogm/builder build >/dev/null
  if ((fleet)); then
    node --input-type=module -e '
      import { mkdir, writeFile } from "node:fs/promises";
      import { join } from "node:path";
      const [renderer, home, repoRoot] = process.argv.slice(1);
      const { createFleet } = await import(renderer);
      const rows = new Map();
      const store = {
        async byRepo(repo) { return [...rows.values()].find((row) => row.repo === repo); },
        async list() { return [...rows.values()]; },
        async insert(row) { rows.set(row.slug, { ...row }); },
        async update(slug, patch) {
          const row = { ...rows.get(slug), ...patch };
          rows.set(slug, row);
          return row;
        },
      };
      const auth = join(home, ".config/ogm/codex-gamebuilder/auth.json");
      await mkdir(join(home, ".config/ogm/codex-gamebuilder"), { recursive: true });
      await writeFile(auth, "{\"tokens\":{}}\n", { mode: 0o600 });
      let token = 0;
      const fleet = createFleet({
        store,
        activeJobs: async () => [],
        env: {
          home,
          builderBotToken: "proof-token",
          builderBotLogin: "ogm-builder",
          intakeLogin: "ogm-intake",
          assetsLocalDir: join(repoRoot, "assets-local"),
          aiurRoot: join(home, "aiur"),
        },
        runner: async (_cmd, args) => ({
          code: 0,
          stdout: args[0] === "token" && args[1] === "create" ? `aiur_proof_token_${++token}\n` : "",
          stderr: "",
        }),
        systemctl: {
          start: async () => undefined,
          stop: async () => undefined,
          restart: async () => undefined,
          isActive: async () => true,
        },
        files: async () => ({ hooks: "after_create: echo proof\n", prompt: "Work the proof.\n" }),
        fetch: async () => new Response(null, { status: 200 }),
        sleep: async () => undefined,
        portFree: async () => true,
      });
      for (const repo of ["proof/workspace-a", "proof/workspace-b"]) {
        const result = await fleet.ensureDaemon(repo, "feature");
        if (result.status !== "running") throw new Error(`${repo}: ${JSON.stringify(result)}`);
      }
    ' "$renderer" "$fleet_home" "$OGM_REPO_ROOT"
    mkdir -p "$OGM_PROOF_CODEX_HOME/runtime"
    chmod 700 "$OGM_PROOF_CODEX_HOME" "$OGM_PROOF_CODEX_HOME/runtime"
  else
    # Extra deny roots a game-builder daemon passes: the other workspace, the aiur repo env, assets-local.
    node --input-type=module -e '
      const [renderer, ws, other, repo] = process.argv.slice(1);
      const { renderCodexProfile } = await import(renderer);
      process.stdout.write(renderCodexProfile({
        repo: "ogm-proof/game", workspaceRoot: ws, port: 4000, intakeLogin: "ogm-intake",
        botAccount: "ogm-builder", kind: "feature",
        denyReadRoots: [other, "~/github/aiur/.env", `${repo}/assets-local`],
      }));' "$renderer" "$OGM_PROOF_WS_A" "$OGM_PROOF_WS_B" "$OGM_REPO_ROOT" >"$OGM_PROOF_CODEX_HOME/config.toml"
  fi
fi

# --- run --------------------------------------------------------------------------------------------------
rows=()
details=()
failures=0

run_one() {
  local id="$1" mode="$2" script output rc=0
  script="$(ls "$proof_dir/$id"-*.sh)"
  if ((!codex_ok)); then
    output="$(printf '%s\tSKIP\tcodex not on PATH\n' "$id")"
  else
    output="$(OGM_PROOF_MODE="$mode" bash "$script" 2>&1)" || rc=$?
  fi
  local line result observed
  result="$(printf '%s\n' "$output" | awk -F'\t' -v id="$id" '$1 == id && $2 != "DETAIL" {print $2; exit}')"
  observed="$(printf '%s\n' "$output" | awk -F'\t' -v id="$id" '$1 == id && $2 != "DETAIL" {print $3; exit}')"
  if [[ -z "$result" ]]; then
    result="FAIL"
    observed="script error (exit $rc): $(first_line "$output")"
  fi
  while IFS= read -r line; do
    [[ -n "$line" ]] && details+=("$id: $line")
  done < <(printf '%s\n' "$output" | awk -F'\t' -v id="$id" '$1 == id && $2 == "DETAIL" {print $3}')
  LAST_RESULT="$result"
  LAST_OBSERVED="$observed"
}

if ((self_test)); then
  # Each pair: test, wrong invocation. Every one must FAIL for the self-test to pass.
  cases=("t09 network-on" "t03 bare" "t06 bare")
  for c in "${cases[@]}"; do
    read -r id mode <<<"$c"
    run_one "$id" "$mode"
    expected="FAIL"
    [[ "$LAST_RESULT" == "$expected" ]] || failures=$((failures + 1))
    rows+=("| $id | $(test_name "$id") ($mode) | $LAST_RESULT (expected $expected) | $LAST_OBSERVED |")
  done
else
  for id in "${tests[@]}"; do
    run_one "$id" normal
    [[ "$LAST_RESULT" == "FAIL" ]] && failures=$((failures + 1))
    rows+=("| $id | $(test_name "$id") | $LAST_RESULT | $LAST_OBSERVED |")
  done
fi

# --- report -----------------------------------------------------------------------------------------------
sha="$(git -C "$OGM_REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)"
if [[ -n "$(git -C "$OGM_REPO_ROOT" status --porcelain -- scripts/sandbox services/builder/sandbox 2>/dev/null)" ]]; then
  sha+="-dirty"
fi
codex_v="$( ((codex_ok)) && codex --version 2>/dev/null | tail -1 || echo "codex missing")"
bwrap_v="$(bwrap --version 2>/dev/null | head -1 || echo "bwrap missing")"
label="Run"
((self_test)) && label="Self-test"

report="$(
  printf '%s: %s %s · %s · %s · scripts @ %s\n\n' "$label" "$(date -u +%Y-%m-%dT%H:%MZ)" "$(hostname)" \
    "$codex_v" "$bwrap_v" "$sha"
  printf '| id | test | result | observed |\n|---|---|---|---|\n'
  printf '%s\n' "${rows[@]}"
  if ((${#details[@]})); then
    printf '\n'
    printf -- '- %s\n' "${details[@]}"
  fi
)"
printf '%s\n' "$report"

if ((write && !self_test)); then
  if ! grep -q '^<!-- proof-results -->$' "$doc" || ! grep -q '^<!-- /proof-results -->$' "$doc"; then
    echo "no proof-results markers in $doc" >&2
    exit 2
  fi
  tmp="$(mktemp "$root/doc.XXXXXX")"
  REPORT="$report" awk '
    $0 == "<!-- proof-results -->" {print; print ""; print ENVIRON["REPORT"]; print ""; skip = 1; next}
    $0 == "<!-- /proof-results -->" {skip = 0}
    !skip {print}' "$doc" >"$tmp"
  cat "$tmp" >"$doc"
fi

if ((self_test)); then
  if ((failures == 0)); then
    echo "self-test: every wrong invocation was caught"
    exit 0
  fi
  echo "self-test: $failures wrong invocation(s) not caught" >&2
  exit 1
fi
((failures == 0))
