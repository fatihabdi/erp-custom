#!/bin/sh
# Pulihkan backup:  ./deploy/restore.sh backups/daily/erp-YYYYMMDD-HHMMSS.sql.gz
# PERINGATAN: menimpa isi database saat ini.
set -eu
[ $# -eq 1 ] || { echo "pemakaian: $0 <file.sql.gz>"; exit 1; }
gunzip -c "$1" | docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
