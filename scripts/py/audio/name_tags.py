"""Layer-1 name tags: what a filename and its folder already say, before any model runs.

The searchability plan (`docs/research/asset-searchability-2026-11-05.md` §5) puts names first. A Sonniss or Pixabay
file usually says what it is — a UCS CatID, a library folder, a descriptor, a variation number — and that costs nothing,
while a CLAP pass is the slowest step of a run. `analyze.py` writes these tags into the sidecar before it embeds
anything, and `build_audio_cards.py` honours them ahead of the model, so the model only fills what names cannot say.

Nothing here reads audio and nothing here needs numpy: this module runs on any host with Python 3.
"""
import fnmatch
import re
from pathlib import Path

# A music pack is carded with key/tempo/meter/sections and the CLAP music label set; anything else is carded as a sound
# effect. The families named in #509 are listed one by one rather than guessed from a name that merely sounds musical.
MUSIC_PACKS = (
    "sidetrax-*",
    "kenney-music-*",
    "pixabay-music-*",  # 20 curated mood playlists, 554 tracks
    "abstraction-music-loop-*",  # short seamless loops: the family that needs loop points most
    "drive-barbarian-chiptune",
)

# UCS main categories (universalcategorysystem.com) that the bundles in the library use, with the C3 `subkind` each one
# maps to. A CatID whose category code is not here is left untagged: no category is better for search than a wrong one
# (C3 §13), and the folder and filename words still feed the fallback below.
UCS_CATEGORIES = {
    "AMBI": ("ambience", "ambience"),
    "ANIM": ("animals", "sfx/creature"),
    "COMP": ("computers", "sfx/ui"),
    "CREA": ("creatures", "sfx/creature"),
    "DEST": ("destruction", "sfx/explosion"),
    "DOOR": ("doors", "sfx/foley"),
    "EXPL": ("explosions", "sfx/explosion"),
    "FOLE": ("foley", "sfx/foley"),
    "FOOT": ("footsteps", "sfx/footstep"),
    "HUMO": ("human-voice", "voice"),
    "IMPA": ("impacts", "sfx/impact"),
    "MAGI": ("magic", "sfx/magic"),
    "MECH": ("mechanisms", "sfx/foley"),
    "OBJE": ("objects", "sfx/foley"),
    "PICK": ("pickups", "sfx/pickup"),
    "TOOL": ("tools", "sfx/foley"),
    "VEHI": ("vehicles", "sfx/vehicle"),
    "WATE": ("water", "sfx/foley"),
    "WEAP": ("weapons", "sfx/weapon"),
    "WEAT": ("weather", "ambience"),
}

# `<8-character CatID>_<the rest>`: four letters of category glued to four of subcategory, no separator between them.
UCS_STEM = re.compile(r"^([A-Z]{4})([A-Za-z]{3,4})_(.+)$")

# Folder or filename words that name a kind of sound, first match wins. The weakness of a filename is that it is often
# the only thing we have; the order runs from the specific (a footstep is never anything else) to the vague.
WORD_SUBKINDS = (
    ("footstep", "sfx/footstep"),
    ("footsteps", "sfx/footstep"),
    ("step", "sfx/footstep"),
    ("footwear", "sfx/footstep"),
    ("weapon", "sfx/weapon"),
    ("weapons", "sfx/weapon"),
    ("sword", "sfx/weapon"),
    ("gun", "sfx/weapon"),
    ("gunshot", "sfx/weapon"),
    ("rifle", "sfx/weapon"),
    ("explosion", "sfx/explosion"),
    ("explosions", "sfx/explosion"),
    ("explode", "sfx/explosion"),
    ("impact", "sfx/impact"),
    ("impacts", "sfx/impact"),
    ("hit", "sfx/impact"),
    ("slam", "sfx/impact"),
    ("magic", "sfx/magic"),
    ("spell", "sfx/magic"),
    ("pickup", "sfx/pickup"),
    ("coin", "sfx/pickup"),
    ("vehicle", "sfx/vehicle"),
    ("vehicles", "sfx/vehicle"),
    ("car", "sfx/vehicle"),
    ("engine", "sfx/vehicle"),
    ("creature", "sfx/creature"),
    ("creatures", "sfx/creature"),
    ("monster", "sfx/creature"),
    ("animal", "sfx/creature"),
    ("animals", "sfx/creature"),
    ("ambience", "ambience"),
    ("ambient", "ambience"),
    ("atmosphere", "ambience"),
    ("atmos", "ambience"),
    ("weather", "ambience"),
    ("ui", "sfx/ui"),
    ("interface", "sfx/ui"),
    ("click", "sfx/ui"),
    ("button", "sfx/ui"),
    ("foley", "sfx/foley"),
    ("foly", "sfx/foley"),
    ("door", "sfx/foley"),
    ("wood", "sfx/foley"),
    ("metal", "sfx/foley"),
    ("cloth", "sfx/foley"),
    ("water", "sfx/foley"),
)

# A trailing variation number: `_01`, `-2`, ` 03`, `(4)`, and the same prefixed with v/var/variation/take/alt.
VARIATION_SUFFIX = re.compile(r"[\s_-]*(?:v|var|variation|take|alt)?[\s_-]*\(?\d{1,3}\)?$", re.IGNORECASE)

# C3 caps `audio.variation_group` at 120 characters. A deeper path than that is not a set anyone searches for, so it is
# left off the card rather than truncated into a key that groups two unrelated families.
MAX_GROUP_KEY = 120

# Words too generic to search on their own; the folder or the category already says them.
UCS_STOPWORDS = frozenset(
    {
        "sfx",
        "sound",
        "sounds",
        "fx",
        "audio",
        "the",
        "and",
        "of",
        "a",
        "an",
        "var",
        "v",
        "alt",
        "take",
        "version",
        "final",
        "new",
        "raw",
        "mix",
    }
)


def is_music(pack):
    """True when a pack holds music rather than sound effects. Only the listed families are music: a pack whose name
    merely contains "music" is still an effect pack unless it is listed here."""
    return any(fnmatch.fnmatch(pack, pattern) for pattern in MUSIC_PACKS)


def is_loop_pack(pack):
    """True when the pack's whole point is seamless loops, so loop points are worth searching for on every file."""
    return bool({"loop", "loops"} & set(pack.split("-")))


def _kebab(value):
    """Same shape as a C3 id fragment: lowercase, camelCase split, everything else collapsed to a dash."""
    value = re.sub(r"([a-z0-9])([A-Z])", r"\1-\2", value)
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def split_words(stem):
    """The words of a filename or folder: Snake_Case, kebab-case and camelCase all give the same list, lowercased."""
    words = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", stem).replace("_", " ").replace("-", " ")
    return [w for w in re.split(r"\s+", words) if w]


def parse_ucs(stem):
    """Read a Universal Category System filename: an 8-character CatID, then category and descriptor words.

    `WEAPSWD_SWORDS_Sword_Hit_01` gives the CatID `WEAPSWD`, whose category `WEAP` is weapons and whose subcategory
    `SWD` is swords. Neighbouring bundles spell the category out as the next token (`WEAPSWD_WEAPONS_SWORDS_...`), so
    that token is used as the category name when it agrees with the CatID. Anything unrecognised gives `{}`: a folder of
    ordinary `impact_metal_03.wav` names has no CatID, and inventing one would put a wrong category on the card.
    """
    m = UCS_STEM.match(stem)
    if not m:
        return {}
    code, rest = m.group(1), m.group(3)
    if code not in UCS_CATEGORIES:
        return {}
    category, subkind = UCS_CATEGORIES[code]
    tokens = split_words(rest)
    out = {
        # The subcode is title-cased so every pack spells a CatID the same way (WEAPSWD and WEAPSwd are one filter
        # value) and so the card's `^[A-Z]{3,5}[A-Z][a-z]+$` pattern holds for an all-caps filename.
        "ucs_cat_id": code + m.group(2).capitalize(),
        "category": category,
        "subcategory": _kebab(tokens[0]) if tokens else "",
        "subkind": subkind,
    }
    if tokens and tokens[0].lower() in (category, category.rstrip("s")):
        tokens = tokens[1:]  # the category spelled out again: not a subcategory, and not a search word either
        out["subcategory"] = _kebab(tokens[0]) if tokens else ""
    out["words"] = [_kebab(w) for w in tokens[1:] if w.lower() not in UCS_STOPWORDS]
    return out


def variation_group(rel_path):
    """The set a file belongs to: its folder and name with the trailing variation number removed.

    `weapons/Sword_Slice_01.wav` and `weapons/Sword_Slice_02.wav` are one group, `weapons/Sword_Slice_heavy_01.wav`
    with them, and `foley/Grass_Footstep_01.wav` is a different group. The folder is part of the key because a bundle
    repeats the same words across libraries; without it, every `01` in the pack would look like one family.
    """
    path = Path(rel_path)
    stem = VARIATION_SUFFIX.sub("", path.stem) or path.stem
    parts = (*path.parent.parts, stem)
    return "/".join(part for part in (_kebab(piece) for piece in parts) if part)


def subkind_of(ucs, folder="", stem=""):
    """The C3 audio subkind from the cheapest evidence: a UCS category first, then the filename, then the folder.

    The filename is read before the folder because it is the more specific of the two: a `footstep_gravel_01.wav` inside
    a library folder called `foley` is a footstep, and the folder only decides for a file whose name says nothing (a
    Sonniss bundle's `01.wav` under `weapons/`). Returns None when nothing names a kind, so the caller can fall back to
    the model rather than guess.
    """
    if ucs.get("subkind"):
        return ucs["subkind"]
    for source in (stem, folder):
        for word in split_words(source):
            word = word.lower()
            for needle, subkind in WORD_SUBKINDS:
                if word == needle:
                    return subkind
    return None


def names_for(pack, rel_path):
    """Everything the name layer knows about one file, ready to store in the sidecar before any model runs.

    `subkind` is only read for sound effects: a music file's kind comes from the pack and its duration, and letting a
    folder called `loops` win would file a track as a footstep the day a bundle is named oddly.
    """
    path = Path(rel_path)
    ucs = parse_ucs(path.stem)
    words = [w for w in split_words(path.stem) if w.lower() not in UCS_STOPWORDS]
    music = is_music(pack)
    out = {
        "music": music,
        "loop_pack": is_loop_pack(pack),
        "group": variation_group(rel_path),
        "subkind": None if music else subkind_of(ucs, " ".join(path.parent.parts), path.stem),
        "terms": search_terms(ucs, words),
    }
    if ucs:
        out["ucs"] = {k: v for k, v in ucs.items() if k != "words"}
    return out


def card_name_fields(names, group_size=1):
    """The `audio` fields the name layer contributes to a sound-effect card, each with the reason it was written.

    Returned as `{field: (value, why)}` so the card step writes the provenance beside the value instead of restating
    where it came from. A variation group with no sibling is not written: a group of one would let "give me four sword
    impacts" match four unrelated families, so the field appears only where a set really exists.
    """
    out = {}
    if names.get("ucs"):
        cat_id = names["ucs"]["ucs_cat_id"]
        out["ucs_cat_id"] = (cat_id, f"UCS CatID {cat_id} in the filename")
    group = names.get("group")
    if group and group_size > 1 and len(group) <= MAX_GROUP_KEY:
        out["variation_group"] = (group, f"filename minus its variation suffix; {group_size} files share it")
    return out


def _singular(tag):
    """The form a tag is stored under: a simple plural drops its `s`, so `Swords` and `sword` are one tag."""
    return tag[:-1] if tag.endswith("s") and not tag.endswith("ss") and len(tag) > 4 else tag


def search_terms(ucs, words, exclude=()):
    """Free search words for `describe.keywords`: the UCS category and subcategory spelled out, then the descriptive
    words in the filename, minus whatever another field already says and minus words too generic to search on.

    C3 caps `describe.keywords` at 12 tags of `^[a-z][a-z0-9-]*$`, so the caller can pass the list straight in. Words
    are lowercased and singularised the same way the rest of the carding step does it, so `Swords` and `sword` are one
    tag rather than two.
    """
    taken = {_singular(str(tag).lower()) for tag in exclude}
    out = []
    candidates = []
    if ucs.get("category"):
        candidates.append(ucs["category"])
    if ucs.get("subcategory"):
        candidates.append(ucs["subcategory"])
    candidates.extend(ucs.get("words") or [])
    candidates.extend(words)
    for word in candidates:
        tag = _kebab(word)
        if len(tag) < 3 or len(tag) > 40 or not re.fullmatch(r"[a-z][a-z0-9-]*", tag):
            continue
        if tag in UCS_STOPWORDS or re.fullmatch(r"\d+", tag):
            continue
        single = _singular(tag)
        if single in taken or single in out:
            continue
        out.append(single)
    return out[:12]
