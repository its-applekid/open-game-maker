#!/bin/bash
# Each file in negative/ must make validate.mjs fail; the examples alone must pass.
T=$(dirname "$(readlink -f "$0")"); S=$T/..; rc=0
node $T/validate.mjs $S >/dev/null || { echo "FAIL examples do not pass"; rc=1; }
for f in $T/negative/*.json; do
  if node $T/validate.mjs $S "$f" >/dev/null 2>&1; then echo "FAIL accepted $(basename $f)"; rc=1; else echo "ok   rejected $(basename $f)"; fi
done
exit $rc
