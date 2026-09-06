# SPICE self-host (VPS) deployment

Runs the full SPICE stack — Next.js web UI + media backend, Postgres
(Neon replacement), and Caddy (automatic HTTPS) — with Docker Compose.
Replaces Vercel + Neon for this box. Desktop/mobile clients keep working
against the cloud until they are repointed (separate step).

## One-time setup (on the VPS)

1. **DNS:** point an A record for your domain at the VPS IP.
2. **Oracle firewall:** in the OCI console, open ingress **80/443** for the
   instance's subnet security list (Oracle blocks everything by default).
3. **Box firewall:** allow 80/443 (this repo's provisioning does it).
4. **Checkout:** `git clone <repo> && cd SPICE/deploy`.
5. **Secrets:** `cp .env.example .env`, then fill it in. Generate secrets with
   `openssl rand -base64 48`. Use alphanumeric Postgres passwords (the
   `DATABASE_URL` is assembled from parts, so avoid URL-reserved chars).
6. **Launch:** `docker compose up --build -d`.
7. **Watch it boot:** `docker compose logs -f app` — migrations apply
   automatically on first boot (`SPICE_RUN_MIGRATIONS=1`), then Caddy
   fetches a Let's Encrypt certificate (needs 1–2 minutes + reachable DNS).

## Verify

- `https://<domain>/api/runtime` → runtime status JSON
- `https://<domain>/api/version` → version JSON
- Open `https://<domain>` in a browser: full SPICE web UI (player included)
- Resolve a real track in the UI and press play: proves PO-token minting
  and stream proxying work from a datacenter IP

## Update

```sh
git pull
docker compose up --build -d
```

Migrations re-apply automatically (idempotent). Roll back with the previous
image tag if a release misbehaves:
`docker compose up -d --no-build` after `git checkout <good-ref>` + rebuild.

## Backup

```sh
docker compose exec db pg_dump -U spice spice > "spice-$(date +%F).sql"
```

The `pgdata` volume holds everything else. Back up before upgrades.

## Notes

- Media routes (`/api/yt/*`, `/api/sc/*`, `/api/local/*`) on a public host
  require same-origin browser requests or `Authorization: Bearer
  $SPICE_SELFHOST_MEDIA_TOKEN` (`media_auth_required` otherwise). Signed
  stream URLs stay HMAC-expiry-bound as before.
- Upstash Redis is optional: Spice Connect falls back to durable Postgres
  when `UPSTASH_REDIS_REST_URL`/`TOKEN` are unset (add them to compose if
  you want the Redis fast path).
- Email (Resend) is optional: account verification flows stay disabled
  without `RESEND_API_KEY`; set `SPICE_ADMIN_EMAILS` to bootstrap admins.
