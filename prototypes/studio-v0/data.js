// Example library, New Game steps and the pre-scripted voice lines. All games are examples for the prototype.
export const GAMES = [
  { id: 'goblin-cellar', title: 'Goblin Cellar', by: 'ogm-team', font: 'Lilita One', color: '#fabd2f', badge: 'Playable',
    tagline: 'Build a dungeon, fill it with goblins, then fight your way out.', genres: ['RPG', 'Battle'], vibe: ['Cozy', 'Epic'], art: 'Toy 3D',
    players: 'Single player', world: 'Dungeon', controls: 'Keyboard · Mouse · Touch', rating: 4.8, votes: '2.1k', plays: '31.4k', updated: 'Today', version: 'v0.4',
    packs: ['Kenney Mini Dungeon', 'Kenney RPG Audio', 'Kenney Music Loops'], labels: ['Goblin fight', 'Editor', 'Exploring', 'Victory'],
    desc: 'The dungeon from our first prototype. Place walls, goblins and treasure in the editor, press Try it! and play what you built. Every game in this prototype opens here.' },
  { id: 'restorebound', title: 'RestoreBound', by: 'mossbyte', font: 'Press Start 2P', color: '#fbf1c7', badge: 'Featured',
    tagline: 'A sleepy village, one repair at a time.', genres: ['Adventure', 'Craft'], vibe: ['Cozy', 'Calm'], art: '16-bit pixel',
    players: 'Single player · Co-op 2', world: 'Farm', controls: 'Keyboard · Gamepad · Touch', rating: 4.7, votes: '1.6k', plays: '22.8k', updated: '2 days ago', version: 'v1.2',
    packs: ['Kenney Tiny Town', 'Kenney Tiny Dungeon'], labels: ['Rebuilding', 'Village walk'],
    desc: 'Gather timber, fix roofs and bring neighbours home. Each repaired house unlocks a new shop and a new tune.' },
  { id: 'mossy-leap', title: 'Mossy Leap', by: 'ravenquill', font: 'Press Start 2P', color: '#b8bb26', badge: '',
    tagline: 'Hop, bop and collect every coin in the Greenwood.', genres: ['Platformer'], vibe: ['Cute', 'Retro'], art: '16-bit pixel',
    players: 'Single player', world: 'Forest', controls: 'Keyboard · Gamepad', rating: 4.5, votes: '980', plays: '14.1k', updated: '1 week ago', version: 'v0.9',
    packs: ['Kenney Pixel Platformer'], labels: ['Greenwood run', 'Waterfall gaps'],
    desc: 'Twelve short levels of tight jumps, hidden blocks and grumpy bats. Speedrun timer included.' },
  { id: 'skyward-squadron', title: 'Skyward Squadron', by: 'ace_tern', font: 'Bungee', color: '#83a598', badge: 'Update',
    tagline: 'Island-hopping dogfights over a pixel sea.', genres: ['Battle'], vibe: ['Retro', 'Epic'], art: '16-bit pixel',
    players: 'Single player · Co-op 2', world: 'Ocean', controls: 'Keyboard · Gamepad · Touch', rating: 4.6, votes: '1.2k', plays: '18.9k', updated: 'Yesterday', version: 'v1.5',
    packs: ['Kenney Pixel Shmup'], labels: ['Wave 3', 'Bomber boss'],
    desc: 'A vertical shooter with chunky planes, island bases and a bomber boss that fills the sky. A boss rush mode is being built right now.' },
  { id: 'powder-rush', title: 'Powder Rush', by: 'snowmode', font: 'Bungee', color: '#fbf1c7', badge: '',
    tagline: 'Carve the slalom. Outrun the yeti.', genres: ['Racing', 'Sports'], vibe: ['Funny', 'Retro'], art: '16-bit pixel',
    players: 'Single player · Versus 2', world: 'Snow', controls: 'Keyboard · Gamepad · Touch', rating: 4.4, votes: '640', plays: '9.7k', updated: '3 days ago', version: 'v0.6',
    packs: ['Kenney Tiny Ski'], labels: ['Slalom', 'Yeti chase'],
    desc: 'Hit every gate for a time bonus. Miss three and the yeti wakes up.' },
  { id: 'little-fronts', title: 'Little Fronts', by: 'hexhound', font: 'Bungee', color: '#b8bb26', badge: '',
    tagline: 'Turn-based skirmishes on a pocket-sized map.', genres: ['Strategy', 'Battle'], vibe: ['Cool', 'Retro'], art: '16-bit pixel',
    players: 'Single player · Versus 2 · Online', world: 'Forest', controls: 'Mouse · Touch', rating: 4.3, votes: '410', plays: '6.2k', updated: '5 days ago', version: 'v0.8',
    packs: ['Kenney Tiny Battle'], labels: ['Move phase', 'Artillery'],
    desc: 'Capture factories, roll out tanks and hold the bridge. Matches take about ten minutes.' },
  { id: 'crypt-crawlers', title: 'Crypt Crawlers', by: 'dicegoblin', font: 'Press Start 2P', color: '#fb4934', badge: 'Co-op',
    tagline: 'Four heroes, one crypt, too many slimes.', genres: ['RPG', 'Battle'], vibe: ['Funny', 'Epic'], art: '16-bit pixel',
    players: 'Co-op 2–4 · Online', world: 'Dungeon', controls: 'Keyboard · Gamepad', rating: 4.6, votes: '1.4k', plays: '20.3k', updated: '4 days ago', version: 'v1.1',
    packs: ['Kenney Tiny Dungeon'], labels: ['Room brawl', 'Treasure room'],
    desc: 'A couch co-op crawler. Share potions, revive each other and argue over who opens the chest.' },
  { id: 'nebula-run', title: 'Nebula Run', by: 'stardrift', font: 'Russo One', color: '#d3869b', badge: '',
    tagline: 'Thread the asteroid belt at full burn.', genres: ['Battle'], vibe: ['Future', 'Epic'], art: 'Cartoon',
    players: 'Single player', world: 'Space', controls: 'Keyboard · Gamepad · Touch', rating: 4.2, votes: '530', plays: '8.8k', updated: '2 weeks ago', version: 'v0.5',
    packs: ['Kenney Space Shooter Remastered'], labels: ['Asteroid belt', 'Mothership'],
    desc: 'Arcade space shooting with drifting meteors, shield pickups and a score chase.' },
  { id: 'turbo-tumble', title: 'Turbo Tumble', by: 'gridlock', font: 'Russo One', color: '#fabd2f', badge: 'Party',
    tagline: 'Four cars, three laps, zero brakes.', genres: ['Racing'], vibe: ['Funny', 'Cool'], art: 'Cartoon',
    players: 'Party 2–4 · Online', world: 'City', controls: 'Gamepad · Keyboard', rating: 4.5, votes: '870', plays: '12.6k', updated: '6 days ago', version: 'v0.7',
    packs: ['Kenney Racing Pack'], labels: ['Chase cam', 'Full track'],
    desc: 'Top-down party racing. Bump rivals into the tyre walls and steal the lead on the last corner.' },
  { id: 'brick-bloom', title: 'Brick Bloom', by: 'petalpush', font: 'Lilita One', color: '#8ec07c', badge: '',
    tagline: 'Break bricks, grow combos, clear the garden.', genres: ['Puzzle'], vibe: ['Calm', 'Cute'], art: 'Cartoon',
    players: 'Single player', world: 'Sky islands', controls: 'Mouse · Touch', rating: 4.1, votes: '300', plays: '5.4k', updated: '1 week ago', version: 'v0.3',
    packs: ['Kenney Puzzle Pack'], labels: ['Level 3', 'Combo chain'],
    desc: 'A soft take on brick breaking. Chain hits to bloom flowers across the board.' },
  { id: 'lantern-hollow', title: 'Lantern Hollow', by: 'moth.wing', font: 'Creepster', color: '#d3869b', badge: 'New',
    tagline: 'Your lantern is running out. Something is following the light.', genres: ['Adventure'], vibe: ['Creepy'], art: '16-bit pixel',
    players: 'Single player', world: 'Haunted', controls: 'Keyboard · Gamepad', rating: 4.4, votes: '220', plays: '3.1k', updated: 'Today', version: 'v0.2',
    packs: ['Kenney Tiny Dungeon'], labels: ['Graveyard', 'Crypt'],
    desc: 'A short spooky crawl where light is your only weapon. Keep the oil topped up and the ghosts at bay.' },
  { id: 'frostbite-peaks', title: 'Frostbite Peaks', by: 'ravenquill', font: 'Press Start 2P', color: '#83a598', badge: '',
    tagline: 'Night climbs on icy ledges.', genres: ['Platformer'], vibe: ['Calm', 'Retro'], art: '16-bit pixel',
    players: 'Single player', world: 'Snow', controls: 'Keyboard · Gamepad', rating: 4.3, votes: '450', plays: '7.5k', updated: '3 weeks ago', version: 'v0.8',
    packs: ['Kenney Pixel Platformer'], labels: ['Snowfall', 'Ice caves'],
    desc: 'The sequel to Mossy Leap, under a full moon. Slippery ledges, snowmen and a long climb to the summit.' },
];

// A game being built when the prototype opens, so the progress tracker has something to show.
export const SEED_BUILD = { id: 'puddle-postal', title: 'Puddle Postal', by: 'you', font: 'Lilita One', color: '#83a598', badge: '',
  tagline: 'A frog mail carrier on a rainy island.', genres: ['Adventure'], vibe: ['Cozy'], art: '16-bit pixel', players: 'Single player', world: 'Ocean',
  controls: 'Keyboard · Touch', rating: null, votes: '', plays: '0', updated: 'Building', version: 'v0.1', packs: ['Kenney Tiny Town'], labels: ['First island'],
  desc: 'You described this one earlier. It plays in Goblin Cellar until the real builder exists.', scene: 'restorebound' };

const o = (id, label, icon) => ({ id, label, icon: icon || id });
export const STEPS = [
  { key: 'genre', title: 'Genre', ask: 'What kind of game is it?', hint: 'Pick up to 3', max: 3,
    opts: [o('rpg', 'RPG'), o('platformer', 'Platformer'), o('adventure', 'Adventure'), o('craft', 'Craft'), o('puzzle', 'Puzzle'), o('battle', 'Battle'),
      o('strategy', 'Strategy'), o('racing', 'Racing'), o('sports', 'Sports'), o('rhythm', 'Rhythm'), o('sim', 'Life sim'), o('card', 'Cards')],
    voice: 'Kind of a cooking game crossed with a delivery game, where you race the clock to drop off orders.' },
  { key: 'vibe', title: 'Vibe', ask: 'How should it feel?', hint: 'Pick up to 3', max: 3,
    opts: [o('retro', 'Retro'), o('future', 'Future'), o('cool', 'Cool'), o('cute', 'Cute'), o('old', 'Old'), o('creepy', 'Creepy'),
      o('cozy', 'Cozy'), o('epic', 'Epic'), o('surreal', 'Surreal'), o('funny', 'Funny'), o('calm', 'Calm')],
    voice: 'Cozy but a little spooky, like a bakery that only opens at midnight.' },
  { key: 'art', title: 'Art', ask: 'What should it look like?', hint: 'Pick up to 2 · every style here comes from art packs we already have', max: 2, preview: true,
    opts: [o('bit1', '1-bit'), o('bit8', '8-bit'), o('bit16', '16-bit pixel'), o('cartoon', 'Cartoon'), o('sketch', 'Sketch'), o('iso', 'Isometric'),
      o('toy3d', 'Toy 3D'), o('voxel', 'Voxel'), o('retro3d', 'Retro 3D'), o('lowpoly', 'Low-poly 3D')],
    voice: 'Chunky pixel art like the old handheld games, but with soft glowing lights.' },
  { key: 'world', title: 'World', ask: 'Where does it take place?', hint: 'Pick up to 3', max: 3,
    opts: [o('dungeon', 'Dungeon'), o('forest', 'Forest'), o('spaceW', 'Space'), o('city', 'City'), o('ocean', 'Ocean'), o('desert', 'Desert'),
      o('sky', 'Sky islands'), o('snow', 'Snow'), o('castle', 'Castle'), o('farm', 'Farm'), o('haunted', 'Haunted')],
    voice: 'Floating islands joined by rope bridges, with a huge moon behind them.' },
  { key: 'players', title: 'Players', ask: 'Who plays?', hint: 'Pick any', max: 8,
    opts: [o('solo', 'Solo'), o('coop', 'Co-op'), o('versus', 'Versus'), o('online', 'Online'), o('party', 'Party 3+'), o('bots', 'With bots'), o('pass', 'Pass & play')],
    voice: 'Mostly solo, but a friend could hop in and help carry deliveries.' },
  { key: 'talk', title: 'Talk it through', ask: 'Tell the builder about your game', hint: 'Talk or type. Press Finish whenever you have said enough.' },
];

// Art style previews: real packs in assets-local. Counts come from the pack list (Kenney CC0, Synty licensed).
export const ART = {
  bit1: { blurb: 'Two colours, crisp 16 px tiles. Reads clearly on any screen.', count: 5, packs: [['kenney-1-bit-pack', '1-Bit Pack'], ['kenney-1-bit-platformer-pack', '1-Bit Platformer'], ['kenney-monochrome-rpg-tileset', 'Monochrome RPG']] },
  bit8: { blurb: 'Tiny 8 px sprites and a fantasy-console palette.', count: 4, packs: [['kenney-pico-8-platformer', 'Pico-8 Platformer'], ['kenney-micro-roguelike', 'Micro Roguelike']] },
  bit16: { blurb: 'Detailed 16 px tiles, the look of handheld classics.', count: 29, packs: [['kenney-tiny-town', 'Tiny Town'], ['kenney-pixel-platformer', 'Pixel Platformer'], ['kenney-tiny-dungeon', 'Tiny Dungeon']] },
  cartoon: { blurb: 'Clean vector shapes with bold outlines. Scales to any size.', count: 65, packs: [['kenney-toon-characters', 'Toon Characters'], ['kenney-space-shooter-remastered', 'Space Shooter'], ['kenney-shape-characters', 'Shape Characters']] },
  sketch: { blurb: 'Pen-on-paper doodles, wobbly lines and all.', count: 5, packs: [['kenney-scribble-platformer', 'Scribble Platformer'], ['kenney-sketch-town', 'Sketch Town'], ['kenney-scribble-dungeons', 'Scribble Dungeons']] },
  iso: { blurb: 'Angled tiles that give 2D maps real depth.', count: 26, packs: [['kenney-isometric-miniature-dungeon', 'Iso Miniature Dungeon'], ['kenney-isometric-medieval-town', 'Iso Medieval Town'], ['kenney-isometric-nature', 'Iso Nature']] },
  toy3d: { blurb: 'Rounded low-poly 3D kits, like Goblin Cellar.', count: 48, packs: [['kenney-mini-dungeon', 'Mini Dungeon'], ['kenney-castle-kit', 'Castle Kit'], ['kenney-nature-kit', 'Nature Kit']] },
  voxel: { blurb: 'Everything built from little cubes.', count: 2, packs: [['kenney-voxel-pack', 'Voxel Pack'], ['kenney-voxel-expansion-pack', 'Voxel Expansion']] },
  retro3d: { blurb: 'Chunky early-3D models with low-res textures.', count: 2, packs: [['kenney-retro-fantasy-kit', 'Retro Fantasy Kit'], ['kenney-retro-urban-kit', 'Retro Urban Kit']] },
  lowpoly: { blurb: 'Synty POLYGON: detailed low-poly worlds and characters.', count: 10, synty: true, packs: [['synty-polygon-viking-realm', 'POLYGON Viking Realm'], ['synty-polygon-nature-biomes-alpine-mountain', 'POLYGON Alpine Mountain'], ['synty-polygon-goblin-war-camp', 'POLYGON Goblin War Camp']] },
};

export const NEW_GAME_TALK = [
  { who: 'you', text: 'Okay, so my game is about a little mushroom baker named Pip who delivers bread to floating islands, but only at night.' },
  { who: 'agent', text: 'Love it. A night-shift baker on floating islands. Is delivery more about racing the clock or finding your way?' },
  { who: 'you', text: 'Racing the clock mostly. And sometimes a bridge breaks, so you have to find another route.' },
  { who: 'agent', text: 'Timed runs with routes that change. I will start Pip in a bakery with three islands to deliver to. Should anything chase Pip?' },
  { who: 'you', text: 'Maybe moths that try to steal the bread. Nothing too scary.' },
  { who: 'agent', text: 'Bread-snatching moths, more mischief than danger. I have enough for a first playable version. Press Finish when you are ready, or keep adding details.' },
];
export const NEW_GAME_TITLE = 'Midnight Crumbs';

export const featureTalk = title => [
  { who: 'you', text: `In ${title}, can the goblin chief throw spears from across the room?` },
  { who: 'agent', text: 'Sure. Should the chief throw only when it can see you, or on a timer?' },
  { who: 'you', text: 'Only when it sees me. And give me a second of warning first.' },
  { who: 'agent', text: 'A wind-up shout, then the spear. I will add it and keep the damage fair for an easy fight. Press Finish to start the build.' },
];
export const FEATURE_NAME = 'Spear-throwing goblin chief';
export const AGENT_ACK = ['Noted. I will add that to the plan.', 'Got it, that fits. Anything else?', 'Good detail. I will work it in.'];

export const BUILD_STEPS = {
  game: ['Reading your notes', 'Choosing art packs', 'Sketching the first level', 'Placing the world', 'Teaching enemies to move', 'Tuning the controls', 'Play-testing a first run', 'Packaging the build'],
  feature: ['Reading your request', 'Writing the new behaviour', 'Adding sounds and warnings', 'Tuning damage', 'Play-testing'],
};
