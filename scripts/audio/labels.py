"""CLAP label sets for the card step. Each label is scored as a text prompt against stored audio embeddings.

Vocab labels map straight onto C3 enums; extra labels (richer words CLAP separates well) map to their nearest enum value
and are kept as proposed tags, so nothing invented reaches an enum field."""

MOODS = ["dark", "tense", "eerie", "mysterious", "sad", "calm", "cozy", "cheerful", "playful", "energetic", "epic", "triumphant"]
EXTRA_MOODS = {"melancholic": "sad", "dreamy": "calm", "bittersweet": "sad", "nostalgic": "sad", "hopeful": "cheerful",
               "peaceful": "calm", "romantic": "calm", "whimsical": "playful", "quirky": "playful", "driving": "energetic",
               "aggressive": "energetic", "heroic": "epic", "majestic": "epic", "adventurous": "energetic", "urgent": "tense",
               "lonely": "sad", "ominous": "dark", "warm": "cozy"}

GENRES = ["orchestral", "cinematic", "classical", "piano", "rock", "metal", "pop", "electronic", "ambient", "acoustic", "folk",
          "country", "blues", "jazz", "funk", "hip-hop", "world", "latin", "chiptune", "experimental"]

INSTRUMENTS = {"piano": "piano", "keys": "electric keyboard", "organ": "organ", "strings": "a string section", "solo-violin": "a solo violin",
               "cello": "cello", "brass": "a brass section", "trumpet": "trumpet", "horns": "french horns", "woodwinds": "woodwinds",
               "flute": "flute", "sax": "saxophone", "choir": "a choir", "lead-vocals": "a lead singer", "acoustic-guitar": "acoustic guitar",
               "electric-guitar": "electric guitar", "bass": "bass guitar", "synth-bass": "synth bass", "drums": "a drum kit",
               "drum-machine": "a drum machine", "percussion": "hand percussion", "taiko": "taiko drums",
               "orchestral-percussion": "timpani and cymbals", "synth-lead": "a synth lead", "synth-pad": "synth pads",
               "arpeggiator": "arpeggiated synths", "harp": "harp", "bells": "bells", "mallets": "marimba and xylophone",
               "accordion": "accordion", "fiddle": "folk fiddle", "banjo": "banjo", "ukulele": "ukulele", "sound-design": "sound design textures"}

GAME_FIT = {"combat": "music for a battle", "boss": "music for a boss fight", "chase": "music for a chase scene",
            "stealth": "music for sneaking past guards", "exploration": "music for exploring an open world",
            "puzzle": "music for solving a puzzle", "menu": "music for a game title menu", "town": "music for a peaceful village",
            "dungeon": "music for a dark dungeon", "victory": "music for winning", "defeat": "music for a game over screen",
            "sad-scene": "music for a sad story scene", "ambient-bed": "quiet background ambience"}

ENVIRONMENTS = {"dungeon": "a dungeon", "crypt": "a crypt", "cave": "a cave", "castle": "a castle", "temple": "a temple",
                "ruins": "ancient ruins", "graveyard": "a graveyard", "camp": "a campfire camp", "town": "a small town",
                "village": "a village", "city": "a big city", "tavern": "a cozy tavern", "shop": "a shop", "farm": "a farm",
                "forest": "a forest", "jungle": "a jungle", "grassland": "open grassland", "mountain": "mountains", "snow": "snow",
                "desert": "a desert", "swamp": "a swamp", "beach": "a beach", "ocean": "the ocean", "underwater": "underwater",
                "sky": "flying through the sky", "space": "outer space", "space-station": "a space station",
                "industrial": "a factory", "road": "a road trip", "arena": "an arena"}

SETTINGS = {"fantasy": "fantasy", "medieval": "medieval", "sci-fi": "science fiction", "modern": "modern day",
            "post-apocalyptic": "post-apocalyptic", "western": "wild west", "pirate": "pirate", "horror": "horror",
            "steampunk": "steampunk", "holiday": "christmas", "sports": "sports"}

VOCALS = ("music with singing vocals", "instrumental music without vocals")

# Sound effects: phrase | object noun (open vocab) | subkind
SFX_EVENTS = [l.split("|") for l in """
a door opening|door|sfx/foley
a door closing|door|sfx/foley
a door slamming|door|sfx/foley
a creaking hinge|hinge|sfx/foley
a wooden chest opening|chest|sfx/foley
a lock clicking|lock|sfx/foley
keys jingling|key|sfx/foley
a drawer sliding|drawer|sfx/foley
a book closing|book|sfx/foley
pages turning|book|sfx/foley
paper rustling|paper|sfx/foley
cloth rustling|cloth|sfx/foley
a zipper|zipper|sfx/foley
leather creaking|leather|sfx/foley
coins jingling|coin|sfx/pickup
a coin pickup chime|coin|sfx/pickup
a gem pickup sparkle|gem|sfx/pickup
a power-up sound|power-up|sfx/pickup
an item pickup|item|sfx/pickup
a level up fanfare|level-up|sfx/pickup
a heart refill|heart|sfx/pickup
footsteps on wood|footstep|sfx/footstep
footsteps on stone|footstep|sfx/footstep
footsteps on grass|footstep|sfx/footstep
footsteps on snow|footstep|sfx/footstep
footsteps on gravel|footstep|sfx/footstep
footsteps on metal|footstep|sfx/footstep
footsteps on carpet|footstep|sfx/footstep
footsteps in water|footstep|sfx/footstep
running footsteps|footstep|sfx/footstep
a jump|jump|sfx/other
landing on the ground|landing|sfx/impact
a body falling|body|sfx/impact
a punch|punch|sfx/impact
a kick|kick|sfx/impact
a slap|slap|sfx/impact
a wooden impact|plank|sfx/impact
a metal impact|metal|sfx/impact
a glass impact|glass|sfx/impact
glass breaking|glass|sfx/impact
a plate breaking|plate|sfx/impact
a rock hitting the ground|rock|sfx/impact
a heavy thud|thud|sfx/impact
a soft bump|bump|sfx/impact
a bell ringing|bell|sfx/impact
a tin can hit|can|sfx/impact
a ball bouncing|ball|sfx/impact
a crate breaking|crate|sfx/impact
a sword being drawn|sword|sfx/weapon
a sword clash|sword|sfx/weapon
a sword slash|sword|sfx/weapon
a knife slice|knife|sfx/weapon
an axe chop|axe|sfx/weapon
an arrow being shot|arrow|sfx/weapon
an arrow hitting a target|arrow|sfx/weapon
a bow string|bow|sfx/weapon
a shield block|shield|sfx/weapon
armor clanking|armor|sfx/foley
a gunshot|gun|sfx/weapon
a pistol shot|pistol|sfx/weapon
a shotgun blast|shotgun|sfx/weapon
a machine gun burst|machine-gun|sfx/weapon
a gun reload|gun|sfx/weapon
a laser gun|laser|sfx/weapon
a laser beam|laser|sfx/weapon
a cannon firing|cannon|sfx/weapon
a whoosh|whoosh|sfx/weapon
a big explosion|explosion|sfx/explosion
a small explosion|explosion|sfx/explosion
a distant explosion|explosion|sfx/explosion
fireworks|firework|sfx/explosion
a bomb fuse|bomb|sfx/explosion
a magic spell|spell|sfx/magic
a fireball|fireball|sfx/magic
a healing spell|spell|sfx/magic
an ice spell|spell|sfx/magic
a teleport|teleport|sfx/magic
a sparkle shimmer|sparkle|sfx/magic
a force field|force-field|sfx/magic
a portal opening|portal|sfx/magic
a car engine|car|sfx/vehicle
an engine revving|engine|sfx/vehicle
a car horn|horn|sfx/vehicle
tires screeching|tire|sfx/vehicle
a spaceship engine|spaceship|sfx/vehicle
a rocket thruster|thruster|sfx/vehicle
a helicopter|helicopter|sfx/vehicle
a train|train|sfx/vehicle
a motorcycle|motorcycle|sfx/vehicle
a boat motor|boat|sfx/vehicle
a monster growl|monster|sfx/creature
a monster roar|monster|sfx/creature
a zombie groan|zombie|sfx/creature
a dog barking|dog|sfx/creature
a cat meowing|cat|sfx/creature
a bird chirping|bird|sfx/creature
a horse neighing|horse|sfx/creature
an insect buzzing|insect|sfx/creature
a creature squeak|creature|sfx/creature
a slime squelch|slime|sfx/creature
a wolf howl|wolf|sfx/creature
a human grunt|grunt|voice
a scream|scream|voice
a man speaking|voice|voice
a woman speaking|voice|voice
a robotic voice|voice|voice
an announcer shouting|voice|voice
laughter|laugh|voice
a button click|button|sfx/ui
a mouse click|mouse|sfx/ui
a toggle switch|switch|sfx/ui
a menu select beep|beep|sfx/ui
a menu back sound|menu|sfx/ui
an error buzz|error|sfx/ui
a confirmation chime|chime|sfx/ui
a notification ping|notification|sfx/ui
a typing keyboard|keyboard|sfx/ui
a scroll tick|tick|sfx/ui
a glitch sound|glitch|sfx/ui
a camera shutter|camera|sfx/ui
a retro 8-bit blip|blip|sfx/ui
a retro 8-bit jump|jump|sfx/other
a retro 8-bit explosion|explosion|sfx/explosion
a retro game over jingle|game-over|sfx/ui
a computer beep|computer|sfx/ui
a robot servo|robot|sfx/foley
a mechanical whir|machine|sfx/foley
gears turning|gear|sfx/foley
a lever being pulled|lever|sfx/foley
a chain rattling|chain|sfx/foley
a pot or pan clang|pot|sfx/foley
a cup on a table|cup|sfx/foley
pouring liquid|liquid|sfx/foley
drinking|drink|sfx/foley
eating crunch|food|sfx/foley
dice rolling|dice|sfx/foley
cards shuffling|card|sfx/foley
poker chips|chip|sfx/foley
a slot machine|slot-machine|sfx/foley
a cash register|cash-register|sfx/foley
water dripping|water|sfx/foley
water splashing|water|sfx/foley
a sink draining|sink|sfx/foley
a toilet flush|toilet|sfx/foley
fire crackling|fire|ambience
wind blowing|wind|ambience
rain falling|rain|ambience
thunder|thunder|ambience
ocean waves|wave|ambience
a river flowing|river|ambience
crowd chatter|crowd|ambience
city traffic|traffic|ambience
a forest at night|forest|ambience
a humming machine room|machine|ambience
static noise|static|sfx/other
a stone dragging|stone|sfx/foley
digging dirt|shovel|sfx/foley
wood creaking|wood|sfx/foley
a whistle|whistle|sfx/other
a drum hit|drum|sfx/other
a musical sting|sting|music/stinger
""".strip().splitlines()]

MATERIALS = ["wood", "stone", "metal", "cloth", "leather", "glass", "bone", "crystal", "plant", "earth", "water", "ice", "fire",
             "flesh", "plastic", "paper", "fur"]
