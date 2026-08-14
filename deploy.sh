#!/usr/bin/env bash
# deploy.sh - aupus-service-api
# Uso: ./deploy.sh    (rodar a partir da raiz do projeto)
# Pre-condicoes:
#   - working tree limpo (git status sem mudancas)
#   - branch alinhado com origin/main
#   - .env populado (com CORS_ORIGIN, JWT_SECRET, DATABASE_URL etc.)
#   - PM2 ja inicializado uma vez via ecosystem.config.cjs
set -euo pipefail

PROJECT_NAME="aupus-service-api"
PM2_APP="aupus-service-api"

step() { printf '\n>>> %s\n' "$*"; }
err()  { printf '\nERRO: %s\n' "$*" >&2; exit 1; }

cd "$(dirname "$0")"

# SELF_REEXEC: faz git pull antes e re-executa o script com a versao nova.
# Sem isso, se o proprio deploy.sh muda no commit puxado, bash le metade do
# arquivo antigo + metade do novo de forma inconsistente (bug observado em
# 2026-04-29 no firmware-compiler; o deploy.sh do nexon-api ja tinha o guard).
if [ "${SELF_REEXEC:-}" != "1" ]; then
  step "Verificando working tree limpo"
  if [ -n "$(git status --porcelain)" ]; then
    echo "Mudancas locais nao commitadas detectadas:"
    git status --short
    err "Resolva (commit/stash/discard) antes de fazer deploy. Veja docs/PRE-DEPLOY.md."
  fi

  step "git pull --ff-only origin main"
  git pull --ff-only origin main

  export SELF_REEXEC=1
  exec bash "$0" "$@"
fi

step "pnpm install --frozen-lockfile"
pnpm install --frozen-lockfile

# O client gerado do Prisma mora num caminho do store que depende do hash de
# peers (.pnpm/@prisma+client@6.19.3_<hash>). Qualquer mudanca de dependencia
# muda esse hash, e a instancia nova nasce SEM client gerado — o build entao
# falha com "Property X does not exist on type PrismaService", que nao parece
# ter nada a ver com instalacao.
#
# Gerar sempre e barato (menos de 3s) e tira a chance de alguem ter que
# descobrir isso no meio de um deploy. A CLI vem do devDependency fixado em
# 6.19.3, a mesma versao do client — sem isso, `pnpm prisma` cairia no global.
step "pnpm prisma generate"
pnpm prisma generate --schema=node_modules/@aupus/api-shared/prisma/schema.prisma

step "Snapshot de dist/ anterior em dist.previous/"
rm -rf dist.previous
[ -d dist ] && cp -a dist dist.previous || true

step "Build (nest build)"
pnpm run build

step "Garantindo logs/"
mkdir -p logs

step "Reload no PM2 ($PM2_APP)"
pm2 reload ecosystem.config.cjs --update-env

step "Estado final"
pm2 list | grep -E "name|$PM2_APP" || true

printf '\nDeploy concluido. Para rollback: rm -rf dist && mv dist.previous dist && pm2 reload ecosystem.config.cjs\n'
