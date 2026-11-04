# Game Maker instance

This repository holds every game made by one Game Maker instance.

- `games/<game-slug>/` contains one game per directory.
- `packages/<name>/` contains packages shared by this instance's games.

Use `gm new <game-2d|game-3d> <game-slug>` from this directory to add a game. Assets remain in the instance asset library; games commit `assets.lock.json` references instead of binary asset files.
