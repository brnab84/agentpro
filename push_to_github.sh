#!/usr/bin/env bash
# Uso:
#   1. Crea el repo vacio 'agentpro' en https://github.com/new (sin README)
#   2. export GITHUB_TOKEN=tu_token_nuevo   (NO lo escribas en el chat)
#   3. bash push_to_github.sh
set -euo pipefail

REPO_URL="https://github.com/brnab84/agentpro.git"
: "${GITHUB_TOKEN:?Falta GITHUB_TOKEN en el entorno}"

git init
git add .
git commit -m "Phase 1: multi-tenant base, auth JWT, leads/properties/appointments CRUD"
git branch -M main
git remote add origin "https://${GITHUB_TOKEN}@github.com/brnab84/agentpro.git"
git push -u origin main
echo "Push completo. Railway autodeploy si esta conectado al repo."
