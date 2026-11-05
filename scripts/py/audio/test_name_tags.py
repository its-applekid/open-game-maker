"""Tests for the name layer: the tags a filename and its folder give for free, before any model runs.

Every rule here is one an operator would otherwise discover from a bad card: a track carded as a footstep, a Sonniss
bundle asked for a musical key, a variation set that never groups, or a search tag the C3 card schema rejects.
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import name_tags


class PackFamilyTests(unittest.TestCase):
    def test_every_music_family_is_read_as_music(self):
        """A music pack gets key, tempo, meter, sections and the CLAP music labels; an effect pack gets none of them."""
        for pack in (
            "sidetrax-60-battle",
            "kenney-music-jingles",
            "pixabay-music-curated",
            "abstraction-music-loop-01",
            "drive-barbarian-chiptune",
        ):
            self.assertTrue(name_tags.is_music(pack), pack)

    def test_effect_bundles_are_not_music(self):
        """#509 ships the sound-effect half of the run beside the music half: a Sonniss bundle has no key to measure."""
        for pack in ("sonniss-gdc2026-part9-1of5", "kenney-interface-sounds", "fantasy-rpg-sfx", "kenney-voiceover-pack"):
            self.assertFalse(name_tags.is_music(pack), pack)

    def test_only_the_loop_family_is_a_loop_pack(self):
        """Loop points are searched for on every music file, but only a loop pack has to publish them or say why not."""
        self.assertTrue(name_tags.is_loop_pack("abstraction-music-loop-01"))
        self.assertFalse(name_tags.is_loop_pack("pixabay-music-curated"))
        self.assertFalse(name_tags.is_loop_pack("sidetrax-60-battle"))


class UcsTests(unittest.TestCase):
    def test_a_cat_id_split_into_category_and_subcategory(self):
        """`WEAPSWD_...` is the UCS way of saying weapons/swords; both halves are searchable without opening the file."""
        ucs = name_tags.parse_ucs("WEAPSWD_SWORDS_Sword_Hit_01")
        self.assertEqual(ucs["ucs_cat_id"], "WEAPSwd")
        self.assertEqual(ucs["category"], "weapons")
        self.assertEqual(ucs["subcategory"], "swords")
        self.assertEqual(ucs["subkind"], "sfx/weapon")

    def test_a_cat_id_keeps_the_card_schema_spelling(self):
        """The schema wants `^[A-Z]{3,5}[A-Z][a-z]+$`, so an all-caps filename and a mixed-case one agree."""
        self.assertEqual(name_tags.parse_ucs("DOORWood_Slam_01")["ucs_cat_id"], "DOORWood")
        self.assertEqual(name_tags.parse_ucs("DOORWOOD_Slam_01")["ucs_cat_id"], "DOORWood")

    def test_an_ordinary_filename_gets_no_cat_id(self):
        """Most filenames are ordinary words; inventing a category for them would put a wrong one on the card."""
        for stem in ("impact_metal_03", "DOOR_Open_01", "footstep_gravel", "Sword_Slice_01"):
            self.assertEqual(name_tags.parse_ucs(stem), {}, stem)

    def test_an_unknown_category_is_left_untagged(self):
        """A CatID whose four-letter category we do not know says nothing we can trust, so it says nothing."""
        self.assertEqual(name_tags.parse_ucs("XYZZABC_something_01"), {})


class VariationGroupTests(unittest.TestCase):
    def test_variation_numbers_collapse_into_one_group(self):
        """A set of sword slices is one sound in four takes; the group key is what makes that a single query (#488)."""
        group = name_tags.variation_group("weapons/Sword_Slice_01.wav")
        self.assertEqual(group, "weapons/sword-slice")
        for name in (
            "weapons/Sword_Slice_02.wav",
            "weapons/Sword_Slice_12.wav",
            "weapons/Sword_Slice_v2.wav",
            "weapons/Sword_Slice-03.wav",
        ):
            self.assertEqual(name_tags.variation_group(name), group, name)

    def test_a_descriptor_after_the_number_is_a_different_group(self):
        """`Sword_Slice_heavy_01` is a heavier sound, not another take of the same slice."""
        self.assertNotEqual(
            name_tags.variation_group("weapons/Sword_Slice_heavy_01.wav"),
            name_tags.variation_group("weapons/Sword_Slice_01.wav"),
        )

    def test_the_folder_is_part_of_the_group(self):
        """Bundles repeat the same words across libraries; without the folder every `01` would look like one family."""
        self.assertNotEqual(
            name_tags.variation_group("grass/Footstep_01.wav"),
            name_tags.variation_group("stone/Footstep_01.wav"),
        )


class SubkindTests(unittest.TestCase):
    def test_the_filename_decides_before_the_folder(self):
        """A `footstep_gravel_01.wav` inside a library folder called `foley` is a footstep, not generic foley."""
        self.assertEqual(name_tags.subkind_of({}, "foley", "footstep_gravel_01"), "sfx/footstep")
        self.assertEqual(name_tags.subkind_of({}, "weapons", "generic_01"), "sfx/weapon")

    def test_nothing_named_returns_none_so_the_model_answers(self):
        """A bare numbered take names nothing; a guessed subkind would be worse than CLAP's reading."""
        self.assertIsNone(name_tags.subkind_of({}, "", "01_take_03"))

    def test_a_ucs_category_wins_over_the_words(self):
        """The CatID is the vendor's own classification, so it outranks a descriptor word in the same name."""
        ucs = name_tags.parse_ucs("FOOTSTON_GRAVEL_Run_01")
        self.assertEqual(name_tags.subkind_of(ucs, "weapons", "Run_01"), "sfx/footstep")


class NamesForTests(unittest.TestCase):
    def test_a_music_file_never_claims_an_effect_subkind(self):
        """A track is music because of its pack; letting a folder word decide would file a loop as a footstep."""
        names = name_tags.names_for("abstraction-music-loop-01", "loops/Footstep_Loop_01.wav")
        self.assertTrue(names["music"])
        self.assertTrue(names["loop_pack"])
        self.assertIsNone(names["subkind"])
        self.assertEqual(names["group"], "loops/footstep-loop")

    def test_an_effect_file_carries_its_cat_id_group_and_terms(self):
        names = name_tags.names_for("sonniss-gdc2026-part9-1of5", "weapons/Sword_Slice_01.wav")
        self.assertFalse(names["music"])
        self.assertEqual(names["subkind"], "sfx/weapon")
        self.assertEqual(names["group"], "weapons/sword-slice")
        self.assertFalse(names.get("ucs"))
        self.assertIn("sword", names["terms"])


class SearchTermTests(unittest.TestCase):
    def test_terms_stay_inside_the_card_tag_shape(self):
        """`describe.keywords` is 12 tags of `^[a-z][a-z0-9-]*$`; a stray capital or bare number invalidates the card."""
        terms = name_tags.search_terms({}, ["Sword", "Hit", "03", "sfx", "BIG_Bang", "a", "x", "Wet_Leaves"])
        for tag in terms:
            self.assertRegex(tag, r"^[a-z][a-z0-9-]*$")
        self.assertLessEqual(len(terms), 12)
        self.assertNotIn("03", terms)
        self.assertNotIn("sfx", terms)
        self.assertIn("big-bang", terms)

    def test_a_word_another_field_already_says_is_not_repeated(self):
        """A keyword that repeats `describe.objects` spends one of twelve slots on nothing new."""
        terms = name_tags.search_terms({"category": "weapons", "subcategory": "swords"}, ["Sword", "Hit"], exclude=["sword"])
        self.assertNotIn("sword", terms)
        self.assertIn("weapon", terms)
        self.assertIn("hit", terms)

    def test_the_cat_id_category_is_searchable_spelled_out(self):
        """`WEAPSWD` alone matches no query an agent writes; the category and subcategory names do."""
        ucs = name_tags.parse_ucs("WEAPSWD_WEAPONS_SWORDS_Sword_Hit_01")
        terms = name_tags.search_terms(ucs, ucs.get("words") or [])
        self.assertIn("weapon", terms)
        self.assertIn("sword", terms)
        self.assertIn("hit", terms)


class CardNameFieldTests(unittest.TestCase):
    def test_a_cat_id_becomes_a_card_field_with_its_reason(self):
        """The card step writes provenance beside the value, so the reason travels with the field (C3 §6)."""
        names = name_tags.names_for("sonniss-gdc2026-part9-1of5", "weapons/WEAPSWD_SWORDS_Slice_01.wav")
        fields = name_tags.card_name_fields(names, group_size=1)
        self.assertEqual(fields["ucs_cat_id"][0], "WEAPSwd")
        self.assertIn("CatID", fields["ucs_cat_id"][1])

    def test_a_group_of_one_is_not_written(self):
        """A one-file variation group would let "give me four sword impacts" match four unrelated families."""
        names = name_tags.names_for("sonniss-gdc2026-part9-1of5", "weapons/Sword_Slice_01.wav")
        self.assertNotIn("variation_group", name_tags.card_name_fields(names, group_size=1))
        self.assertEqual(name_tags.card_name_fields(names, group_size=3)["variation_group"][0], "weapons/sword-slice")

    def test_a_file_with_no_name_evidence_contributes_nothing(self):
        """A bare numbered take must leave the card fields alone rather than write an empty value."""
        self.assertEqual(name_tags.card_name_fields({"subkind": None, "group": "", "terms": []}), {})

    def test_a_group_key_the_card_schema_would_reject_is_left_off(self):
        """C3 caps `audio.variation_group` at 120 characters; a longer path is not a set anyone searches for."""
        long_key = "/".join(["library"] * 20) + "/sword-slice"
        self.assertGreater(len(long_key), name_tags.MAX_GROUP_KEY)
        self.assertNotIn("variation_group", name_tags.card_name_fields({"group": long_key}, group_size=4))


if __name__ == "__main__":
    unittest.main()
