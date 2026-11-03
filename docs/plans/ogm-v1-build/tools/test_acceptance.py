#!/usr/bin/env python3
"""Structural checks for the committed OGM V1 acceptance record."""

import os
import re
import unittest
from pathlib import Path


DEFAULT_ACCEPTANCE = Path(__file__).parents[1] / "acceptance.md"
ACCEPTANCE = Path(os.environ.get("OGM_ACCEPTANCE_PATH", DEFAULT_ACCEPTANCE))
ROW_RE = re.compile(r"^\| (\d+) \|")
DISPOSITION_RE = re.compile(r"^\| (R\d+) \|", re.MULTILINE)
SHA = "ea07d2d991be177b30900c9005d46b7e64ba3c1f"
EXPECTED_REQUIREMENTS = {
    f"R{number}"
    for start, end in [
        (1, 6),
        (10, 14),
        (20, 27),
        (30, 48),
        (50, 57),
        (60, 78),
        (80, 88),
        (90, 96),
        (100, 106),
        (110, 114),
        (120, 124),
    ]
    for number in range(start, end + 1)
}


class AcceptanceTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.text = ACCEPTANCE.read_text(encoding="utf-8")

    def test_has_twenty_complete_numbered_checks(self):
        rows = [line for line in self.text.splitlines() if ROW_RE.match(line)]
        self.assertEqual([int(ROW_RE.match(line).group(1)) for line in rows], list(range(1, 21)))
        for line in rows:
            cells = [cell.strip() for cell in line.strip("|").split("|")]
            self.assertEqual(len(cells), 9, line)
            self.assertRegex(cells[4], r"^(pass|fail|blocked:[a-z0-9-]+)$")
            self.assertEqual(cells[7], f"`{SHA}`")
            self.assertEqual(cells[8], "2026-11-02")
            self.assertTrue(cells[3], line)
            self.assertTrue(cells[5], line)

    def test_has_one_disposition_for_every_frozen_requirement(self):
        begin = "<!-- requirement-dispositions: generated output begins -->"
        end = "<!-- requirement-dispositions: generated output ends -->"
        table = self.text.split(begin, 1)[1].split(end, 1)[0]
        requirement_ids = DISPOSITION_RE.findall(table)
        self.assertEqual(len(requirement_ids), len(EXPECTED_REQUIREMENTS))
        self.assertEqual(set(requirement_ids), EXPECTED_REQUIREMENTS)


if __name__ == "__main__":
    unittest.main()
