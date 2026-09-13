#!/usr/bin/env bash
# Pull the latest TeRiRi/ui-lab and rebuild the staging stack.
# Run on the VPS from anywhere: ~/spice/ui-lab/deploy/update-lab.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

git fetch origin
git checkout TeRiRi/ui-lab
git pull --ff-only origin TeRiRi/ui-lab

docker compose -f deploy/docker-compose.lab.yml --env-file deploy/.env.lab up --build -d
docker compose -f deploy/docker-compose.lab.yml --env-file deploy/.env.lab logs --tail=30 lab-app
