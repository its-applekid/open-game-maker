#!/usr/bin/env bash
# scripts/sandbox/seed-store.sh --core turns an instance repository's released core version set into the exact
# `<destination>@<version>` specs the offline store needs. A fake pnpm records the request, so this needs no network.

set -euo pipefail

test_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo=$(git -C "$test_dir" rev-parse --show-toplevel)
source "$test_dir/lib.sh"

scratch=$(mktemp -d)
trap 'rm -rf -- "$scratch"' EXIT

bin=$scratch/bin
store=$scratch/store
instance=$scratch/instance
mkdir -p "$bin" "$instance/vendor"

export OGM_PNPM_STORE=$store
export PATH="$bin:$PATH"
export OGM_FAKE_STORE_PATH=$scratch/store-index
export OGM_FAKE_PNPM_LOG=$scratch/pnpm.log

# A pnpm that only records what it was asked to do; the script's own spec derivation is what this test checks.
cat > "$bin/pnpm" <<'SH'
#!/usr/bin/env bash
if [[ "${1:-}" == store && "${2:-}" == path ]]; then
  echo "${OGM_FAKE_STORE_PATH}"
  exit 0
fi
printf '%s\n' "$*" >> "${OGM_FAKE_PNPM_LOG}"
exit 0
SH
chmod +x "$bin/pnpm"
: > "$OGM_FAKE_PNPM_LOG"

cat > "$instance/vendor/core-packages.json" <<'JSON'
{
  "v": 1,
  "core": {
    "sha": "3cef9ec65caaf2dfa51649cc8befb9a916c8487b",
    "registry": "https://registry.npmjs.org",
    "scope": "@open-game-maker",
    "packages": {
      "@gm/sdk": "npm:@open-game-maker/sdk@0.0.0-core.3cef9ec65caa",
      "@ogm/contracts": "0.0.0-core.3cef9ec65caa"
    }
  }
}
JSON

bash "$repo/scripts/sandbox/seed-store.sh" --core "$instance" > "$scratch/output.log" 2>&1 ||
  fail "seed-store.sh --core failed: $(cat "$scratch/output.log")"

# An `npm:` alias installs the destination name at its version; a bare version keeps the source name.
assert_grep \
  "store add --store-dir $store @open-game-maker/sdk@0.0.0-core.3cef9ec65caa @ogm/contracts@0.0.0-core.3cef9ec65caa" \
  "$OGM_FAKE_PNPM_LOG"
assert_grep "added @open-game-maker/sdk@0.0.0-core.3cef9ec65caa" "$scratch/output.log"
assert_grep "added @ogm/contracts@0.0.0-core.3cef9ec65caa" "$scratch/output.log"

# An instance repository without a set is refused with the command that writes one.
empty=$scratch/empty-instance
mkdir -p "$empty"
status=0
refusal=$(bash "$repo/scripts/sandbox/seed-store.sh" --core "$empty" 2>&1) || status=$?
assert_eq 2 "$status" "a repository without a release set is refused"
case "$refusal" in
  *"run core-release switch --apply"*) ;;
  *) fail "the refusal does not name the command that writes the set: $refusal" ;;
esac

echo "core-release set: ok"
