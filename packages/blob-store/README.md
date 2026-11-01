# `@ogm/blob-store`

Filesystem-backed, content-addressed blob storage for Open Game Maker 2000.
Bytes are stored under `blobs/sha256/<hex>` with immutable metadata sidecars.
The package also signs and verifies day-rounded GET URLs, serves verified blobs
through a framework-neutral handler, and garbage-collects only old blobs absent
from an explicit roots list.

## Garbage collection

Build the package, then run:

```sh
ogm-blob-gc --root DIR --roots FILE [--grace-days 30] [--apply]
```

The roots file contains one `sha256:<64 lowercase hex>` value per line. Blank
lines and lines beginning with `#` are ignored. The command is a dry run unless
`--apply` is present.
