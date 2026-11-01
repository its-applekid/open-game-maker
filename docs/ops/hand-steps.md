# Hand steps

Steps only Kevin can do: they need sudo, a browser sign-in or an approval. All are free. Each item is in the `remind`
format, so the Executor copies it into `~/remind.md` as is. An item already in `~/remind.md` is skipped.

- [ ] `sudo tailscale set --operator=orangekid` — GATE-TS-OPERATOR: lets this account mount the 8443 and 10000 serves with `ops/bin/ogm-ingress.sh` and read `tailscale serve status` without sudo
  - ctx: OGM-008 docs/ops/hand-steps.md · docs/ops/ingress.md
- [ ] `ops/bin/ogm-ingress.sh` — approve Funnel (public HTTPS on `applekid.tailee0e71.ts.net:8443` and `:10000`), or run it with `--tailnet-only` instead
  - ctx: OGM-008 docs/ops/hand-steps.md · docs/ops/ingress.md
- [ ] `ssh orangekid 'mkdir -p ~/ogm-backups && df -h ~'` — GATE-BACKUP-TARGET: confirm `orangekid` is the backup node, that this account can reach it over Tailscale SSH, and that it has room; then set `OGM_BACKUP_TARGET=ssh:orangekid:~/ogm-backups` in `~/.config/ogm/env/backup.env`
  - ctx: OGM-008 docs/ops/hand-steps.md · docs/ops/runbook.md "Backup"
- [ ] `chmod 600 ~/github/aiur/.env` — the aiur env file is group-readable (0664)
  - ctx: OGM-008 docs/ops/hand-steps.md · T03 E03-9
- [ ] `xdg-open https://github.com/signup` — GATE-MACHINE-USERS: create the free `ogm-intake` and `ogm-builder` machine users, put their PATs in the builder env file, then remove your own PAT from `~/.aiur/.env`
  - ctx: OGM-008 docs/ops/hand-steps.md · T03 E03-8
- [ ] `xdg-open https://github.com/settings/apps/new` — GATE-GITHUB-APP: create the OGM GitHub App and install it on your account; its App id, installation id and PEM path go in the commit service env file
  - ctx: OGM-008 docs/ops/hand-steps.md
- [ ] `xdg-open https://console.cloud.google.com/apis/credentials` — GATE-GOOGLE-OAUTH: create an OAuth client (testing mode) for Google sign-in; passkey and magic link work without it
  - ctx: OGM-008 docs/ops/hand-steps.md
- [ ] `sudoedit /etc/systemd/journald.conf` — optional: set `SystemMaxUse=4G` and restart `systemd-journald`; the journal holds 2 GB today
  - ctx: OGM-008 docs/ops/hand-steps.md · T11 E11-14
- [ ] `sudo apt install blender` — optional: only when 3D asset work starts (R87)
  - ctx: OGM-008 docs/ops/hand-steps.md
- [ ] `id orangekid` — check only: do not add `orangekid` to the `docker` or `kvm` groups unless OGM-037 asks for it
  - ctx: OGM-008 docs/ops/hand-steps.md · T03 §7
