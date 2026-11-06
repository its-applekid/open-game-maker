#!/usr/bin/env bash
# ogm-proof against a temp instance-repository clone: the folder, commits and releases a proof run leaves behind,
# plus the refusals that keep a half-run from being recorded as evidence.

set -euo pipefail

test_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo=$(git -C "$test_dir" rev-parse --show-toplevel)
source "$test_dir/lib.sh"

scratch=$(mktemp -d)
trap 'rm -rf -- "$scratch"' EXIT
proof=$repo/ops/bin/ogm-proof
clone=$scratch/instance
export HOME=$scratch/home
mkdir -p "$HOME" "$clone"

git -C "$clone" init -q -b main
git -C "$clone" config user.email proof@example.test
git -C "$clone" config user.name proof
printf 'readme\n' > "$clone/README.md"
git -C "$clone" add -A
git -C "$clone" commit -qm 'seed'

# The create merges games/<slug>/ as the bot; then a chat edit and a publish; then a rollback restore and its release.
mkdir -p "$clone/games/castle-run"
printf '<h1>castle</h1>\n' > "$clone/games/castle-run/index.html"
printf '{"name":"castle"}\n' > "$clone/games/castle-run/game.json"
git -C "$clone" add -A
git -C "$clone" commit -qm 'create games/castle-run'
printf '<h1>castle v2</h1>\n' > "$clone/games/castle-run/index.html"
git -C "$clone" add -A
git -C "$clone" commit -qm 'fold design for castle-run'
git -C "$clone" tag castle-run/v1.0.0
printf '<h1>castle</h1>\n' > "$clone/games/castle-run/index.html"
git -C "$clone" add -A
git -C "$clone" commit -qm 'restore games/castle-run from v1.0.0'
git -C "$clone" tag castle-run/v1.0.1

"$proof" --repo "$clone" --slug castle-run --expect-rollback > "$scratch/out.txt" || fail 'ogm-proof refused a complete run'
assert_grep 'Ref: `main` at ' "$scratch/out.txt"
assert_grep 'games/castle-run/game.json' "$scratch/out.txt"
assert_grep 'games/castle-run/index.html' "$scratch/out.txt"
assert_grep 'create games/castle-run' "$scratch/out.txt"
assert_grep 'fold design for castle-run' "$scratch/out.txt"
assert_grep 'restore games/castle-run from v1.0.0' "$scratch/out.txt"
assert_grep '- `castle-run/v1.0.0` at ' "$scratch/out.txt"
assert_grep '- `castle-run/v1.0.1` at ' "$scratch/out.txt"
assert_grep 'Releases: 2. Commits: 3.' "$scratch/out.txt"
# The record is pasted into a pull request as is: no clone path and no home path in it.
assert_not_grep "$scratch" "$scratch/out.txt"
assert_not_grep "$HOME" "$scratch/out.txt"

"$proof" --repo "$clone" --slug castle-run --expect-rollback --out "$scratch/evidence" > "$scratch/out2.txt"
assert_grep "wrote $scratch/evidence/proof-castle-run.md" "$scratch/out2.txt"
assert_grep '- `castle-run/v1.0.1` at ' "$scratch/evidence/proof-castle-run.md"
head -n -1 "$scratch/out2.txt" > "$scratch/record.txt"
diff -u "$scratch/record.txt" "$scratch/evidence/proof-castle-run.md" || fail 'the saved record differs from the printed one'

# A game whose folder never landed is not evidence: the create did not reach the instance repository.
set +e
"$proof" --repo "$clone" --slug space-castle > /dev/null 2> "$scratch/missing.txt"
code=$?
set -e
assert_eq 2 "$code" 'ogm-proof should refuse a folder that is not on the ref'
assert_grep 'games/space-castle is not on main' "$scratch/missing.txt"

# A folder with no release yet is a run that never published.
git -C "$clone" tag -d castle-run/v1.0.0 castle-run/v1.0.1 > /dev/null
set +e
"$proof" --repo "$clone" --slug castle-run > /dev/null 2> "$scratch/norelease.txt"
code=$?
set -e
assert_eq 3 "$code" 'ogm-proof should refuse a game with no release tag'
assert_grep 'no castle-run/v* release tag yet' "$scratch/norelease.txt"

# Publishing without the rollback leaves one release, so --expect-rollback names the missing half.
git -C "$clone" tag castle-run/v1.0.0
set +e
"$proof" --repo "$clone" --slug castle-run --expect-rollback > /dev/null 2> "$scratch/one.txt"
code=$?
set -e
assert_eq 4 "$code" 'ogm-proof should refuse --expect-rollback with one release'
assert_grep 'needs a publish and a rollback release; found 1' "$scratch/one.txt"

# The helper writes nothing into the repository it reads, so an --out inside the clone is refused.
set +e
"$proof" --repo "$clone" --slug castle-run --out "$clone/evidence" > /dev/null 2> "$scratch/inside.txt"
code=$?
set -e
assert_eq 64 "$code" 'ogm-proof should refuse an --out inside the clone'
assert_grep '--out is inside the repository clone' "$scratch/inside.txt"
[[ ! -e $clone/evidence ]] || fail 'ogm-proof wrote into the clone it read'

# Usage refusals: a slug with a path separator or an unknown ref cannot be resolved to one game's folder.
set +e
"$proof" --repo "$clone" --slug 'games/../castle-run' > /dev/null 2>&1
code=$?
set -e
assert_eq 64 "$code" 'ogm-proof should refuse a slug carrying a path'
set +e
"$proof" --repo "$clone" --slug castle-run --ref nope > /dev/null 2>&1
code=$?
set -e
assert_eq 64 "$code" 'ogm-proof should refuse an unknown ref'
set +e
"$proof" --repo "$scratch/missing-clone" --slug castle-run > /dev/null 2>&1
code=$?
set -e
assert_eq 64 "$code" 'ogm-proof should refuse a clone path that does not exist'
set +e
"$proof" --slug castle-run > /dev/null 2>&1
code=$?
set -e
assert_eq 64 "$code" 'ogm-proof should refuse a missing --repo'

printf 'ogm-proof: all checks passed\n'
