"""The mood/genre vocabulary the audio-style picker (#357) consumes must be one vocabulary, not two.

`labels.py` is what the card step writes; `packages/contracts/schemas/asset-card.schema.json` is what a card may say.
A label with no schema value would silently drop a tag the picker offers, and a subkind the card step writes that the
schema does not know would fail validation after a long run over the library. This is the guard for both.

Runs with plain Python 3 on the standard library: no numpy, no audio, no model. `make test-py` runs it with the other
worker checks, which is what keeps it in CI.

Run: python3 -I scripts/py/audio/test_labels.py -v
"""

from __future__ import annotations

import json
import re
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import labels as L  # noqa: E402

REPO = HERE.parents[2]
SCHEMA = json.loads((REPO / "packages/contracts/schemas/asset-card.schema.json").read_text())
VOCAB = SCHEMA["$defs"]["vocab"]


def enum(name: str) -> list[str]:
    return VOCAB[name]["enum"]


class VocabularyTest(unittest.TestCase):
    def test_moods_are_the_schema_mood_enum_plus_mapped_extras(self) -> None:
        """Every mood a track can be tagged with is a C3 mood; the richer words are extras that map onto one."""
        self.assertEqual(list(L.MOODS), [mood for mood in enum("mood") if mood != "neutral"])
        self.assertEqual(set(L.EXTRA_MOODS.values()) - set(enum("mood")), set())

    def test_genres_and_instruments_are_schema_values(self) -> None:
        """The style axis and the instrument list the picker offers are exactly what a card may carry."""
        self.assertEqual(list(L.GENRES), enum("genre"))
        self.assertEqual(set(L.INSTRUMENTS), set(enum("instrument")))

    def test_game_situations_are_schema_values(self) -> None:
        """`describe.game_fit` keys come from the schema enum: a situation the picker shows must be one a card can hold."""
        self.assertEqual(set(L.GAME_FIT), set(enum("gameFit")))
        self.assertEqual((L.FAST_FIT | L.QUIET_FIT | L.SAD_FIT | L.BRIGHT_FIT) - set(enum("gameFit")), set())

    def test_environments_and_settings_are_schema_values(self) -> None:
        """A track's environments and settings are enums too, so a CLAP label must never invent one."""
        self.assertEqual(set(L.ENVIRONMENTS) - set(enum("environment")), set())
        self.assertEqual(set(L.SETTINGS) - set(enum("setting")), set())

    def test_sound_effect_labels_map_to_a_schema_audio_subkind(self) -> None:
        """Every subkind the card step can write is one the schema validates, so a run cannot fail at the last step."""
        audio = set(VOCAB["subkind"]["audio"]["enum"])
        written = {event[2] for event in L.SFX_EVENTS}
        written |= {"voice", "ambience", "music/loop", "music/track", "music/stinger"}
        self.assertEqual(sorted(written - audio), [])

    def test_sound_notes_and_summaries_respect_the_card_caps(self) -> None:
        """The two lengths the card step writes to are the schema's caps, not a copy that can drift from them."""
        audio = SCHEMA["$defs"]["audio"]["properties"]["search_notes"]
        summary = SCHEMA["$defs"]["collectionInfo"]["properties"]["search_summary"]
        source = (HERE / "build_audio_cards.py").read_text()
        self.assertIn(f"NOTE_MAX = {audio['maxLength']}", source)
        self.assertIn(f"SUMMARY_MAX = {summary['maxLength']}", source)

    def test_every_vocabulary_value_is_a_tag_the_card_pattern_accepts(self) -> None:
        """C3 tags are lowercase kebab: a label with a capital or a space would drop the whole card at validation."""
        tag = re.compile(SCHEMA["$defs"]["tag"]["pattern"])
        for name, values in (("mood", L.MOODS), ("genre", L.GENRES), ("instrument", L.INSTRUMENTS), ("gameFit", L.GAME_FIT)):
            for value in values:
                self.assertIsNotNone(tag.fullmatch(value), f"{name} label {value!r} is not a C3 tag")


if __name__ == "__main__":
    unittest.main()
