"""Tests the pack licence-metadata audit against a temporary asset library."""

import json
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import audit_license_metadata as audit  # noqa: E402


class AuditLicenseMetadata(unittest.TestCase):
    def test_lists_every_missing_or_invalid_field_in_pack_order(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            incomplete = root / "packs" / "alpha" / "pack.json"
            incomplete.parent.mkdir(parents=True)
            incomplete.write_text(json.dumps({"license": "CC0-1.0", "source": {"label": "Vendor"}}))
            invalid = root / "packs" / "beta" / "pack.json"
            invalid.parent.mkdir(parents=True)
            invalid.write_text("not json")

            self.assertEqual(
                audit.audit(root),
                [
                    "alpha: missing attribution, license_source",
                    "beta: pack.json is not valid JSON",
                ],
            )

    def test_accepts_text_or_labelled_source_and_explicit_no_attribution(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for pack, source in (("one", "vendor drop"), ("two", {"label": "Vendor", "url": "https://example.test"})):
                path = root / "packs" / pack / "pack.json"
                path.parent.mkdir(parents=True)
                path.write_text(
                    json.dumps(
                        {
                            "license": "CC0-1.0",
                            "license_source": "License.txt",
                            "attribution": "none required",
                            "source": source,
                        }
                    )
                )

            self.assertEqual(audit.audit(root), [])


if __name__ == "__main__":
    unittest.main()
