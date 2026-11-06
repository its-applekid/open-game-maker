# Game Maker instance

This repository holds every game made by one Game Maker instance.

- `games/<game-slug>/` contains one game per directory.
- `packages/<name>/` contains packages shared by this instance's games.

Use `gm new <game-2d|game-3d> <game-slug>` from this directory to add a game. Assets remain in the instance asset library; games commit `assets.lock.json` references instead of binary asset files.

The core packages (`@gm/sdk`, `@ogm/contracts`, `@ogm/iframe-bridge`) are not published to a registry yet. Until they are, keep the release tarballs they ship as under `vendor/`, or copy the packages into `packages/`, and point the games at those local paths.

After `gm new`, run `pnpm install` here so `pnpm-lock.yaml` picks up the new game, and commit the result: CI installs with `--frozen-lockfile`.

The instance's own logo, sign-in and games screens read `VITE_INSTANCE_LOGO_URL` from the app host's `web.env`: set it to a root-relative path or HTTPS URL ending in `.png`, `.webp`, or `.svg` to brand this instance, or leave it blank for the Open Game Maker 2000 logo. Favicon and app icons stay separate.
