#!/usr/bin/env python3
"""Install a pack downloaded by fetch_itch_owned.py / fetch_itch_free.py into assets-local/packs.

    python3 -I scripts/assets/install_itch_pack.py <download dir> <pack id> "<title>" "<licence summary>" --extract REGEX
        [--license-id LicenseRef-itch-custom] [--category 2d] [--root assets-local]

Copies every downloaded file to <id>/<version>/originals (untouched), unzips the files matching --extract into
extracted/, writes License.txt (the summary plus the store page) and pack.json, keyed by today's date as version.
--license-id names a row of packages/asset-cards/data/licenses.json; usage_rights follow that row. SmallScaleInt ids
default to LicenseRef-smallscaleint-itch; other ids default to the unconfirmed LicenseRef-itch-custom strict ceiling.
Never runs anything from the download. Rebuild the catalog afterwards (build_catalog.py).
"""
import argparse, json, re, shutil, sys, time, zipfile
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_collection_cards import basis_from_row, effective, license_row, load_table, processing_for  # noqa: E402


def rights_for(license_id: str, ref: str, day: str) -> dict:
    """usage_rights in the card schema's rights shape, from the licence table row."""
    row = license_row(license_id, load_table())
    basis = basis_from_row(row, ref, day)
    return {**effective(basis), 'processing': processing_for(row, 'draft'), 'basis': basis}


def main(argv=None):
    ap = argparse.ArgumentParser()
    for x in ('src', 'id', 'title', 'summary'): ap.add_argument(x)
    ap.add_argument('--extract', required=True); ap.add_argument('--category', default='2d')
    ap.add_argument('--license-id')
    ap.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[2] / 'assets-local')
    a = ap.parse_args(argv)
    license_id = a.license_id or ('LicenseRef-smallscaleint-itch' if a.id.startswith('smallscaleint-') else 'LicenseRef-itch-custom')
    lic = license_row(license_id, load_table())['id']
    src = Path(a.src).expanduser(); meta = json.loads((src / 'sources.json').read_text())
    ver = time.strftime('%Y-%m-%d'); root = a.root / 'packs' / a.id
    orig, ext = root / ver / 'originals', root / ver / 'extracted'; orig.mkdir(parents=True, exist_ok=True); ext.mkdir(parents=True, exist_ok=True)
    for f in src.iterdir():
        if f.is_file() and not (orig / f.name).exists(): shutil.copy2(f, orig / f.name)
    for z in sorted(orig.glob('*.zip')):
        if not re.search(a.extract, z.name, re.I): continue
        with zipfile.ZipFile(z) as zf:
            for m in zf.infolist():
                p = (ext / m.filename).resolve()
                if not str(p).startswith(str(ext.resolve())): continue   # no paths escaping the folder
                zf.extract(m, ext)
    (ext / 'License.txt').write_text(f"{a.title}\n{meta.get('page')}\n\n{a.summary}\n\nVerified on the store page {ver}.\n")
    ft = dict(Counter(f.suffix.lower().lstrip('.') for f in ext.rglob('*') if f.is_file()).most_common())
    pj = root / 'pack.json'; m = json.loads(pj.read_text()) if pj.exists() else {}
    m.update({'id': a.id, 'vendor': a.id.split('-')[0], 'title': a.title, 'category': a.category, 'license': lic,
              'license_source': f'{ver}/extracted/License.txt', 'requires': [], 'current': ver})
    m.setdefault('versions', {})[ver] = {'format': 'loose', 'extracted_files': sum(ft.values()), 'file_types': ft, 'added': ver,
                                         'source': {'type': 'itch.io', 'official': meta.get('page'), 'purchase': True}}
    m['usage_rights'] = rights_for(lic, f'{ver}/extracted/License.txt', ver)
    pj.write_text(json.dumps(m, indent=2) + '\n'); print(a.id, sum(ft.values()), 'files', list(ft.items())[:4])


if __name__ == '__main__':
    main()
