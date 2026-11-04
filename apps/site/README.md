# Marketing site deploy

`apps/site` builds the project marketing site: the splash at `/` and the self-hosting guide at `/setup`. It is a separate Netlify site from every hosted Open Game Maker instance.

Create a Netlify site for the marketing build and write its site ID to `apps/site/.netlify-site-id`. Set `OGM_PUBLIC_APP_ORIGIN=<app-origin>` in `~/.config/ogm/env/web.env`; the deploy uses that value for the “Sign in” destination and redirects `/games`, `/new`, `/signin`, `/auth/*`, and `/api/*` to the try-it instance.

Preview the exact redirect file and deploy payload before the operator-approved deploy:

```sh
apps/site/tools/deploy.sh --dry-run
apps/site/tools/deploy.sh
```

In Netlify, assign `<project-domain>` as the primary domain of this marketing site. Keep `<app-origin>` as the primary domain of the separate `apps/web` site. Do not attach both domains to one Netlify site, and do not deploy from CI.
