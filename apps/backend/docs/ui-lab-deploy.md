# UI-lab staging env

The `/v2` rebuild + `components/ui` kit run on the VPS as an isolated
staging stack so the new UI can be reviewed in a browser without touching
prod (`music.spice-app.xyz`).

- URL: `https://lab.spice-app.xyz/v2` (gallery: `/ui-lab`)
- VPS dir: `~/spice/ui-lab` (repo checkout, branch `TeRiRi/ui-lab`)
- Stack: `deploy/docker-compose.lab.yml` (project `spice-lab`) — own
  `lab-app` + `lab-db` (volume `lab_pgdata`), own secrets in
  `deploy/.env.lab`, own database. Third-party API keys (TMDB,
  SoundCloud, Last.fm, Resend) are copied from prod so behavior matches.
- Routing: the prod Caddy (`~/spice/deploy/Caddyfile`, VPS-side block)
  reverse-proxies `lab.spice-app.xyz` to `lab-app:3000` over the shared
  `spice-selfhost_default` network. The app serves every route on every
  host; `SPICE_PUBLIC_ORIGIN=https://lab.spice-app.xyz` keeps media
  same-origin checks passing on the lab host.
- DNS: A record `lab` → `158.101.172.28` (dashboard, alongside the other
  `spice-app.xyz` records). Caddy fetches the Let's Encrypt cert itself.

## Update

```sh
~/spice/ui-lab/deploy/update-lab.sh
```

Pulls `TeRiRi/ui-lab`, rebuilds, restarts, tails the app log.
Migrations re-apply automatically (idempotent).

## Notes

- Lab accounts are separate (fresh `JWT_SECRET`) — register a new user.
- Prod is untouched except the additive Caddy block + `caddy reload`.
  The VPS prod checkout marks its `Caddyfile` skip-worktree so a future
  prod `git pull` never fights the lab block.
