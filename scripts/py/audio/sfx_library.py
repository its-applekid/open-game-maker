"""Sound-effect libraries (Sonniss #GameAudioGDC bundles): what each file is, from its name, folder and measured envelope.

A bundle file is named `CatID_FX Name_Vendor_Library.wav` (the Universal Category System pattern, C3 §11) or plainly
(`Interface Accept Glassy Snap.wav`), inside a `Vendor - Library` folder. The bundle's Filelist.xlsx lists every file with
its library and supplier; it is read with the standard library (an .xlsx is a zip of XML), so no extra package is needed.
build_audio_cards.py calls `hints_for` and `apply_hints` for each file of a `sonniss-*` pack; sfx_listing.py writes the listings."""
import functools
import re
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

LIBRARY_PACKS = ("sonniss-",)
XLSX_NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
UCS_CAT = re.compile(r"^([A-Z]{3,5}[A-Z][a-z]+)$")  # the card schema's audio.ucs_cat_id pattern
CAT_SHAPE = re.compile(r"^[A-Z]{2,5}[A-Z][a-z]+$")  # any CatID (UIAlert too); an all-caps head counts only as a known category
MAX_KEYWORDS = 12  # the card schema's describe.keywords maxItems

# UCS category prefix -> (search word, subkind). Prefixes only; the CatID's subcategory refines below.
UCS = {
    "AERO": ("aircraft", "sfx/vehicle"), "AIR": ("air", "sfx/other"), "ALRM": ("alarm", "sfx/other"),
    "AMB": ("ambience", "ambience"), "ANML": ("animal", "sfx/creature"), "BEEP": ("beep", "sfx/ui"),
    "BELL": ("bell", "sfx/impact"), "BOAT": ("boat", "sfx/vehicle"), "BULT": ("bullet", "sfx/weapon"),
    "CART": ("cart", "sfx/vehicle"), "CERM": ("ceramic", "sfx/foley"), "CHAIN": ("chain", "sfx/foley"),
    "CLOCK": ("clock", "sfx/foley"), "CLOTH": ("cloth", "sfx/foley"), "COMM": ("communication", "sfx/other"),
    "COM": ("communication", "sfx/other"), "CREA": ("creature", "sfx/creature"), "CRWD": ("crowd", "ambience"),
    "DSGN": ("designed", "sfx/other"), "DOOR": ("door", "sfx/foley"), "DRWR": ("drawer", "sfx/foley"),
    "EXPL": ("explosion", "sfx/explosion"), "ELEC": ("electricity", "sfx/other"), "EQUI": ("equipment", "sfx/foley"),
    "FEET": ("footstep", "sfx/footstep"), "FGHT": ("fight", "sfx/impact"), "FIRE": ("fire", "sfx/other"),
    "FIRW": ("firework", "sfx/explosion"), "FOLY": ("foley", "sfx/foley"), "FOOD": ("food", "sfx/foley"),
    "GAME": ("game", "sfx/foley"), "GEAR": ("gear", "sfx/foley"), "GLAS": ("glass", "sfx/foley"),
    "GORE": ("gore", "sfx/impact"), "GUN": ("gun", "sfx/weapon"), "HAIL": ("hail", "ambience"),
    "HMN": ("human", "voice"), "ICE": ("ice", "sfx/foley"), "LASR": ("laser", "sfx/weapon"),
    "MACH": ("machine", "sfx/other"), "MAGC": ("magic", "sfx/magic"), "MAG": ("magic", "sfx/magic"),
    "MECH": ("mechanical", "sfx/foley"), "METL": ("metal", "sfx/foley"), "MOVE": ("movement", "sfx/other"),
    "MUSC": ("musical", "sfx/other"), "OBJ": ("object", "sfx/foley"), "PAPR": ("paper", "sfx/foley"),
    "RAIN": ("rain", "ambience"), "ROBT": ("robot", "sfx/other"), "ROCK": ("rock", "sfx/foley"),
    "ROPE": ("rope", "sfx/foley"), "SCIF": ("sci-fi", "sfx/other"), "SPRT": ("sport", "sfx/foley"),
    "STORM": ("storm", "ambience"), "SWSH": ("swoosh", "sfx/other"), "THUN": ("thunder", "ambience"),
    "TOON": ("cartoon", "sfx/other"), "TOOL": ("tool", "sfx/foley"), "TRAN": ("transport", "sfx/vehicle"),
    "TRN": ("train", "sfx/vehicle"), "UI": ("ui", "sfx/ui"), "VEH": ("vehicle", "sfx/vehicle"),
    "VOX": ("voice", "voice"), "WATR": ("water", "sfx/other"), "WEAP": ("weapon", "sfx/weapon"),
    "WHSH": ("whoosh", "sfx/other"), "WHST": ("whistle", "sfx/other"), "WIND": ("wind", "ambience"),
    "WOOD": ("wood", "sfx/foley"),
}
UCS_SUB = {"Impt": "sfx/impact", "Expl": "sfx/explosion", "Stngr": "sfx/other", "Feet": "sfx/footstep"}
# Words in a plain file name or a library name that say what the sound is, checked in this order.
WORD_SUBKINDS = [
    ({"ambience", "ambiences", "ambient", "atmosphere", "atmos", "roomtone", "soundscape"}, "ambience"),
    ({"interface", "ui", "menu", "button", "notification", "accept", "deny"}, "sfx/ui"),
    ({"footstep", "footsteps"}, "sfx/footstep"),
    ({"explosion", "explosions", "blast"}, "sfx/explosion"),
    ({"magic", "spell", "spells", "magical"}, "sfx/magic"),
    ({"sword", "swords", "gun", "guns", "gunshot", "weapon", "weapons", "arrow", "bow"}, "sfx/weapon"),
    ({"impact", "impacts", "hit", "hits", "punch", "crash"}, "sfx/impact"),
    ({"coin", "coins", "pickup", "collect"}, "sfx/pickup"),
    ({"voice", "voices", "vocal"}, "voice"),
    ({"creature", "creatures", "monster", "monsters", "dinosaur", "dinosaurs", "dog", "animal"}, "sfx/creature"),
    ({"car", "engine", "vehicle", "tram", "train", "motorbike"}, "sfx/vehicle"),
]
ELEMENTAL = {"RAIN", "WIND", "STORM", "THUN", "HAIL", "WATR", "FIRE", "CRWD", "AMB"}
FILLER = {"vol", "the", "and", "of", "audio", "sound", "sounds", "sfx", "library", "pack", "designed", "wav"}
AMBIENCE_S, SUSTAINED = 20.0, 0.7  # an ambience bed: at least 20 s and loud for most of its length
ONE_SHOT_S = 10.0  # longer non-sustained files are sequences (a minute of clock ticks), not one-shots


def words(text):
    """Lower-case search words from a name: camel case split, digits and filler dropped."""
    text = re.sub(r"([a-z])([A-Z])", r"\1 \2", text or "").replace("'", "").replace("\u2019", "")
    return [w for w in re.findall(r"[a-z][a-z-]*", text.lower()) if len(w) > 1 and w not in FILLER]


def is_library_pack(pid: str) -> bool:
    return pid.startswith(LIBRARY_PACKS)


def read_filelist(xlsx: Path) -> dict:
    """Filelist.xlsx -> {file name: {"library", "supplier"}} (first sheet; header row FILENAME, LIBRARY NAME, SUPPLIER).
    The product URL column is left out: links stay out of cards and listings."""
    with zipfile.ZipFile(xlsx) as z:
        shared = []
        if "xl/sharedStrings.xml" in z.namelist():
            root = ET.fromstring(z.read("xl/sharedStrings.xml"))
            shared = ["".join(t.text or "" for t in si.iterfind(".//m:t", XLSX_NS)) for si in root.iterfind("m:si", XLSX_NS)]
        sheet = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))
    rows = []
    for row in sheet.iterfind(".//m:sheetData/m:row", XLSX_NS):
        cells = {}
        for c in row.iterfind("m:c", XLSX_NS):
            col = re.match(r"[A-Z]+", c.get("r", "")).group(0)
            if c.get("t") == "inlineStr":
                v = "".join(t.text or "" for t in c.iterfind(".//m:t", XLSX_NS))
            else:
                e = c.find("m:v", XLSX_NS)
                v = e.text if e is not None else ""
                if c.get("t") == "s" and v:
                    v = shared[int(v)]
            cells[col] = (v or "").strip()
        rows.append(cells)
    if not rows:
        return {}
    head = {v.upper(): k for k, v in rows[0].items()}
    fcol, lcol, scol = head.get("FILENAME"), head.get("LIBRARY NAME"), head.get("SUPPLIER")
    return {r[fcol]: {"library": r.get(lcol, ""), "supplier": r.get(scol, "")} for r in rows[1:] if r.get(fcol)}


def parse(rel: str, filelist: dict | None = None) -> dict:
    """A bundle file (path under extracted/) -> vendor, library, UCS CatID and the effect's own name."""
    p = Path(rel)
    folder = p.parts[0] if len(p.parts) > 1 else ""
    vendor, _, library = folder.partition(" - ")
    row = (filelist or {}).get(p.name, {})
    vendor, library = row.get("supplier") or vendor.strip(), row.get("library") or library.strip() or folder
    parts = p.stem.split("_")
    head = parts[0] if len(parts) >= 3 and (CAT_SHAPE.match(parts[0]) or parts[0] in UCS) else None
    fx = parts[1] if head else p.stem
    # UIAlert and STORM name a category the schema's CatID pattern cannot hold: kept for the kind, not as ucs_cat_id
    return {"vendor": vendor, "library": library, "ucs_category": head,
            "ucs_cat_id": head if head and UCS_CAT.match(head) else None, "fx_name": fx.strip() or p.stem}


def ucs_prefix(cat: str | None):
    """`AMBTraf` -> `AMB`; the longest known category prefix wins (`MAGC` before `MAG`)."""
    if not cat:
        return None
    for n in range(min(5, len(cat)), 1, -1):
        if cat[:n] in UCS:
            return cat[:n]
    return None


def envelope_shape(env: dict | None, duration: float) -> str:
    """`sustained` (loud for most of its length), `one-shot` (a hit that decays), or `unknown` with no envelope."""
    if not env:
        return "unknown"
    return "sustained" if env.get("active_share", 0) >= SUSTAINED and duration >= 2 else "one-shot"


def classify(info: dict, audio: dict, env: dict | None) -> dict:
    """Subkind, shape word (ambience, loop, one-shot) and search keywords for one file. None subkind = let CLAP decide."""
    dur = audio.get("duration_s") or 0
    prefix = ucs_prefix(info["ucs_category"])
    lib_words = words(info["vendor"]) + words(info["library"])
    fx_words = words(info["fx_name"])
    subkind, by = None, None
    if prefix:
        subkind, by = UCS[prefix][1], "ucs"
        for suffix, sk in UCS_SUB.items():
            if info["ucs_category"].endswith(suffix):
                subkind = sk
    else:
        for ws in (fx_words, words(info["library"])):
            hit = next((sk for vocab, sk in WORD_SUBKINDS if vocab & set(ws)), None)
            if hit:
                subkind, by = hit, "name"
                break
    shape = envelope_shape(env, dur)
    if subkind == "ambience" and dur < AMBIENCE_S and shape != "sustained":
        subkind = "sfx/other"  # a crowd cheer or a single thunder clap, not a bed
    elif (subkind is None or prefix in ELEMENTAL) and subkind not in ("ambience", "voice", "sfx/ui") and dur >= AMBIENCE_S and shape == "sustained":
        subkind, by = "ambience", by or "envelope"
    named_loop = "loop" in fx_words or "loop" in lib_words
    if subkind == "ambience":
        kind_word = "ambience"
    elif named_loop or (shape == "sustained" or dur >= ONE_SHOT_S) and audio.get("loopable"):
        kind_word = "loop"
    else:
        kind_word = "one-shot" if shape == "one-shot" and dur < ONE_SHOT_S else None
    kw = [kind_word] if kind_word else []
    if subkind == "ambience" and audio.get("loopable"):
        kw.append("seamless")
    if prefix:
        kw.append(UCS[prefix][0])
    kw += [w for w in lib_words if w not in kw]
    return {"subkind": subkind, "subkind_by": by, "shape": kind_word, "keywords": kw[:MAX_KEYWORDS]}


@functools.cache
def filelist_for(vdir: Path) -> dict:
    """The bundle's Filelist.xlsx in a pack version's extracted folder, or {} when it has none."""
    found = sorted((vdir / "extracted").glob("*Filelist*.xlsx"))
    return read_filelist(found[0]) if found else {}


def hints_for(vdir: Path, rel: str, audio: dict, sidecar: dict) -> dict:
    """Everything the card builder takes from a library file's name, folder, Filelist row and envelope."""
    info = parse(rel, filelist_for(vdir))
    return {**info, **classify(info, audio, sidecar.get("envelope"))}


ROLES = {"ambience": ["ambience-bed"], "voice": ["voice-line"], "sfx/ui": ["feedback"]}
NOUNS = {"ambience": "ambience bed", "voice": "vocal sound", "sfx/ui": "interface sound"}


def apply_hints(card: dict, h: dict, prov: dict, tool: str, now: str) -> None:
    """Rewrite a library file's card from its name: title, subkind and roles, UCS CatID, kind and library keywords, and
    a description naming the library. CLAP's objects and materials stay."""
    d, a = card["describe"], card["audio"]
    if h["subkind"]:
        card["subkind"] = h["subkind"]
        d["roles"] = ROLES.get(h["subkind"], ["feedback", "effect"])
        prov["subkind"] = {"by": "filename", "tool": tool, "at": now,
                           "input": {"ucs": "UCS CatID in the file name", "name": "file or library name words",
                                     "envelope": "measured envelope (long and sustained)"}[h["subkind_by"]]}
    card["title"] = h["fx_name"][:120]
    if h["ucs_cat_id"]:
        a["ucs_cat_id"] = h["ucs_cat_id"]
        prov["audio.ucs_cat_id"] = {"by": "filename", "tool": tool, "at": now, "input": "CatID_FXName_Creator_Source file name"}
    d["keywords"] = list(dict.fromkeys(h["keywords"] + d.get("keywords", [])))[:MAX_KEYWORDS]
    prov["describe.keywords"] = {"by": "code", "tool": tool, "at": now,
                                 "input": "vendor and library names (folder, Filelist.xlsx), UCS category, measured envelope and seam test"}
    noun = NOUNS.get(card["subkind"], card["subkind"].split("/")[-1] + " sound")
    shape = f"{h['shape']} " if h["shape"] and h["shape"] != "ambience" else ""
    text = f"{h['fx_name']}: {a['duration_s']:.1f} s {shape}{noun}"
    if d.get("materials"):
        text += f", {d['materials'][0]}"
    d["description"] = f"{text}; from {h['vendor']}, {h['library']}."[:300]
    prov["describe.description"] = {"by": "code", "tool": tool, "at": now, "input": "template from file name, library and measured audio"}
