#!/bin/bash
# Envio externo dos backups do launchkit para o Cloudflare R2 (API compatível com S3), via rclone.
# Chamado por backup.sh com BACKUP_DIR e BACKUP_TS definidos. Os arquivos já chegam criptografados (age).
#
# Credenciais: arquivo ~/.config/launchkit-backup/r2.env (modo 600), criado por você a partir de
# deploy/public/backup/r2.env.example. Nunca commitar.
#
# OFFSITE_TARGET (opcional) substitui o destino por qualquer caminho aceito pelo rclone,
# inclusive uma pasta local; serve para testar o fluxo sem credenciais.
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
log() { echo "$(date '+%Y-%m-%d %H:%M:%S') [offsite] $*"; }
die() { log "ERRO: $*"; exit 1; }

command -v rclone >/dev/null || die "rclone não encontrado (brew install rclone)"
: "${BACKUP_DIR:?BACKUP_DIR não definido}"
: "${BACKUP_TS:?BACKUP_TS não definido}"

ENV_FILE="${R2_ENV_FILE:-$HOME/.config/launchkit-backup/r2.env}"
if [ -z "${OFFSITE_TARGET:-}" ]; then
  [ -r "$ENV_FILE" ] || die "credenciais não encontradas em $ENV_FILE (ver deploy/public/backup/r2.env.example)"
  perm="$(stat -f '%Lp' "$ENV_FILE")"
  [ "$perm" = "600" ] || die "permissão de $ENV_FILE é $perm; use chmod 600"
  set -a; . "$ENV_FILE"; set +a
  : "${R2_ACCOUNT_ID:?R2_ACCOUNT_ID ausente em $ENV_FILE}"
  : "${R2_ACCESS_KEY_ID:?R2_ACCESS_KEY_ID ausente em $ENV_FILE}"
  : "${R2_SECRET_ACCESS_KEY:?R2_SECRET_ACCESS_KEY ausente em $ENV_FILE}"
  : "${R2_BUCKET:?R2_BUCKET ausente em $ENV_FILE}"
  # Remote "r2" definido só por variáveis de ambiente: nada de segredo em disco além do r2.env.
  export RCLONE_CONFIG_R2_TYPE=s3
  export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
  export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
  export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
  export RCLONE_CONFIG_R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
  export RCLONE_CONFIG_R2_ACL=private
  # Token restrito a um bucket não pode criar/checar o bucket: não tentar.
  export RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true
  OFFSITE_TARGET="r2:${R2_BUCKET}/${R2_PREFIX:-launchkit}"
fi
KEEP_REMOTE_DAYS="${KEEP_REMOTE_DAYS:-90}"
export RCLONE_CONFIG=/dev/null   # ignora qualquer rclone.conf; só vale o que está acima

DB="launchkit-db-${BACKUP_TS}.dump.age"
ATT="launchkit-files-${BACKUP_TS}.tar.gz.age"
SUM="launchkit-${BACKUP_TS}.sha256"
for f in "$DB" "$ATT" "$SUM"; do [ -s "$BACKUP_DIR/$f" ] || die "arquivo local ausente: $BACKUP_DIR/$f"; done

LIST="$(mktemp)"; trap 'rm -f "$LIST"' EXIT
printf '%s\n' "$DB" "$ATT" "$SUM" > "$LIST"

log "enviando 3 arquivos para $OFFSITE_TARGET ..."
rclone copy "$BACKUP_DIR" "$OFFSITE_TARGET" --files-from "$LIST" --retries 3 --low-level-retries 5 --quiet

log "verificando no destino ..."
rclone check "$BACKUP_DIR" "$OFFSITE_TARGET" --files-from "$LIST" --one-way --quiet \
  || die "verificação falhou: o destino não confere com o backup local"

# Retenção remota: só os nomes deste esquema, só nesse prefixo.
log "retenção remota (${KEEP_REMOTE_DAYS} dias) ..."
rclone delete "$OFFSITE_TARGET" --min-age "${KEEP_REMOTE_DAYS}d" \
  --include 'launchkit-db-*.dump.age' --include 'launchkit-files-*.tar.gz.age' --include 'launchkit-*.sha256' \
  --quiet || log "aviso: retenção remota falhou (não é fatal)"

log "ok: backup $BACKUP_TS enviado e verificado"
