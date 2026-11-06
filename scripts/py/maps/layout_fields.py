"""C3 §12 layout fields for map cards, computed by code from what the export and the tagger already know.

The graph counts (rooms, connections, loops, secrets, dead ends, size class) are not here: they exist only where a
validated layout spec does, and `gm maps index` joins them onto the row. Everything in this module is measurable
without a model: the grid from the CC3+ export, the biome from the map type and the judged environments, the drawn
features from the CAD symbol names and the map's own labels, and the floor count from the title and the level links.
Absent stays absent: a field the export cannot tell is left out rather than written as zero.
"""
# The map-layout-spec feature vocabulary plus the drawn structures a builder asks for by name (schema: vocab.mapFeature).
FEATURES = ("pillar", "water", "pit", "chasm", "lava", "altar", "statue", "throne", "tomb", "sarcophagus", "trap",
            "treasure", "chest", "fireplace", "well", "fountain", "bed", "table", "bookshelf", "barrel", "crate",
            "rubble", "stalagmite", "cage", "portal", "lever", "light-source", "road", "bridge", "stairs", "door",
            "spawn-hint", "exit-hint")
FEATURE_SET = frozenset(FEATURES)
# Map types that are not themselves an environment word, so a card without judged environments still names a place.
BIOME_OF_TYPE = {"keep": "castle", "building": "interior", "ship": "ocean", "wilderness": "forest"}
LEVELS = {"cellar": 3, "ground": 1, "upper": 2, "roof": 2}


def grid(meta_grid):
    """`{type, cols, rows, cell_px}` from the export's grid block, or None when the export did not record one."""
    if not isinstance(meta_grid, dict):
        return None
    out = {}
    if meta_grid.get("type") in ("square", "hex", "none"):
        out["type"] = meta_grid["type"]
    if meta_grid.get("export_cols"):
        out["cols"] = int(meta_grid["export_cols"])
    if meta_grid.get("export_rows"):
        out["rows"] = int(meta_grid["export_rows"])
    if meta_grid.get("px_per_cell"):
        out["cell_px"] = float(meta_grid["px_per_cell"])
    return out or None


def biome(map_type, environments):
    """The one place the map shows: its first judged environment, else a map type that names an environment."""
    if environments:
        return environments[0]
    if map_type in BIOME_OF_TYPE:
        return BIOME_OF_TYPE[map_type]
    return None if map_type in (None, "battlemap", "region") else map_type


def features(objects, keywords, environments):
    """The drawn features, from the symbol-derived objects, the label words and a road environment; sorted and unique."""
    words = [str(w).lower() for w in [*objects, *keywords]]
    found = {w for w in words if w in FEATURE_SET}
    if "road" in (environments or []) or "road" in words:
        found.add("road")
    return sorted(found)


def levels(levels_shown, level):
    """Floors of this place the image shows: the export's own count, else what the card's level word implies."""
    if isinstance(levels_shown, int) and levels_shown >= 1:
        return levels_shown
    return LEVELS.get(level or "")


def layout(map_type, environments, objects, keywords, meta_grid, level=None, levels_shown=None):
    """The card's `map.layout` block, from code measurements only."""
    block = {}
    found = biome(map_type, environments)
    if found:
        block["biome"] = found
    drawn = features(objects, keywords, environments)
    if drawn:
        block["features"] = drawn
    floors = levels(levels_shown, level)
    if floors:
        block["levels"] = floors
    grid_block = grid(meta_grid)
    if grid_block:
        block["grid"] = grid_block
    return block
