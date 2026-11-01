#!/usr/bin/env bash

set -euo pipefail

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

assert_eq() {
  local expected=$1
  local actual=$2
  local message=${3:-"expected values to match"}

  if [[ "$actual" != "$expected" ]]; then
    printf 'FAIL: %s\nexpected:\n%s\nactual:\n%s\n' "$message" "$expected" "$actual" >&2
    exit 1
  fi
}

assert_grep() {
  local pattern=$1
  local file=$2

  grep -Fq -- "$pattern" "$file" || fail "$file does not contain: $pattern"
}

assert_not_grep() {
  local pattern=$1
  local file=$2

  if grep -Fq -- "$pattern" "$file"; then
    fail "$file unexpectedly contains: $pattern"
  fi
}
