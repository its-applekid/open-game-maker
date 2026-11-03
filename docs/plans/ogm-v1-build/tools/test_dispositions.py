#!/usr/bin/env python3
"""Tests for the OGM V1 requirement-disposition read-back."""

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("dispositions.py")


class DispositionsTest(unittest.TestCase):
    def run_tool(self, requirements: str, pack_requirements: list[dict], issues: list[dict]):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            pack = root / "build-order.json"
            requirements_path = root / "requirements.md"
            issues_path = root / "issues.json"
            pack.write_text(json.dumps({"requirements": pack_requirements}), encoding="utf-8")
            requirements_path.write_text(requirements, encoding="utf-8")
            issues_path.write_text(json.dumps(issues), encoding="utf-8")
            return subprocess.run(
                [
                    sys.executable,
                    "-I",
                    str(SCRIPT),
                    "--pack",
                    str(pack),
                    "--requirements",
                    str(requirements_path),
                    "--offline",
                    str(issues_path),
                ],
                check=False,
                capture_output=True,
                text=True,
            )

    def test_reports_closed_open_and_missing_ticket_issues(self):
        result = self.run_tool(
            "- R1. One\n- R2. Two\n- R3. Three\n",
            [
                {"id": "R1", "disposition": "ticket", "ticket_ids": ["OGM-001"]},
                {"id": "R2", "disposition": "ticket", "ticket_ids": ["OGM-001", "OGM-002"]},
                {"id": "R3", "disposition": "ticket", "ticket_ids": ["OGM-099"]},
            ],
            [
                {
                    "number": 10,
                    "state": "closed",
                    "body": "# OGM-001 — First ticket\n\n<!-- gm-ticket:OGM-001 -->",
                    "labels": [{"name": "build-lane:core"}, {"name": "complexity:2"}],
                },
                {
                    "number": 11,
                    "state": "open",
                    "body": "# OGM-002 — Second ticket\n\n<!-- gm-ticket:OGM-002 -->",
                    "labels": [{"name": "build-lane:core"}, {"name": "complexity:2"}],
                },
                {
                    "number": 12,
                    "state": "closed",
                    "body": "<!-- gm-ticket:OGM-099 -->",
                    "labels": [],
                },
            ],
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("| R1 | ticket | OGM-001 | yes | all ticket issues closed |", result.stdout)
        self.assertIn("| R2 | ticket | OGM-001, OGM-002 | no | open: OGM-002 (#11) |", result.stdout)
        self.assertIn("| R3 | ticket | OGM-099 | no | missing: OGM-099 |", result.stdout)

    def test_ignores_untriaged_issue_that_claims_a_ticket_marker(self):
        result = self.run_tool(
            "- R1. One\n",
            [{"id": "R1", "disposition": "ticket", "ticket_ids": ["OGM-001"]}],
            [{"number": 10, "state": "closed", "body": "<!-- gm-ticket:OGM-001 -->", "labels": []}],
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("| R1 | ticket | OGM-001 | no | missing: OGM-001 |", result.stdout)

    def test_rejects_requirement_set_mismatch(self):
        result = self.run_tool(
            "- R1. One\n- R2. Two\n",
            [{"id": "R1", "disposition": "ticket", "ticket_ids": ["OGM-001"]}],
            [],
        )

        self.assertEqual(result.returncode, 1)
        self.assertIn("requirements missing from pack: R2", result.stderr)

    def test_rejects_pack_entries_absent_from_requirements(self):
        result = self.run_tool(
            "- R1. One\n",
            [
                {"id": "R1", "disposition": "ticket", "ticket_ids": ["OGM-001"]},
                {"id": "R2", "disposition": "ticket", "ticket_ids": ["OGM-002"]},
            ],
            [],
        )

        self.assertEqual(result.returncode, 1)
        self.assertIn("pack entries missing from requirements: R2", result.stderr)


if __name__ == "__main__":
    unittest.main()
