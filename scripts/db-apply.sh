#!/usr/bin/env bash
# Applique le schema SQL SafeBack sur la base Supabase cible.
# Usage: SUPABASE_DB_URL='postgresql://...' npm run db:apply

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SQL_FILE="${ROOT_DIR}/supabase/all_in_one.sql"

if [[ ! -f "${SQL_FILE}" ]]; then
  echo "[db:apply] Fichier SQL introuvable: ${SQL_FILE}"
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "[db:apply] psql est requis mais non installe."
  echo "[db:apply] Installe le client PostgreSQL puis relance la commande."
  exit 1
fi

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "[db:apply] Variable SUPABASE_DB_URL manquante."
  echo "[db:apply] Exemple: SUPABASE_DB_URL='postgresql://postgres:<PASSWORD>@db.<PROJECT_REF>.supabase.co:5432/postgres?sslmode=require' npm run db:apply"
  exit 1
fi

echo "[db:apply] Application de ${SQL_FILE}..."
psql "${SUPABASE_DB_URL}" -v ON_ERROR_STOP=1 -f "${SQL_FILE}"
echo "[db:apply] Termine."
