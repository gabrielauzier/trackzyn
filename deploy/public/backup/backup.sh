#!/bin/bash
# Backup da produção do launchkit (projeto Compose "launchkit-prod").
#
# Gera, criptografados com age (só a chave PÚBLICA fica neste Mac):
#   launchkit-db-<ts>.dump.age            pg_dump -Fc do banco "launchkit"
#   launchkit-files-<ts>.tar.gz.age arquivos enviados (volume launchkit-prod_files)
# e um arquivo .sha256 por backup. Depois verifica a integridade, aplica a retenção
# e chama, se existir, o gancho de envio externo (~/.config/launchkit-backup/offsite.sh).
#
# Restauração: ver deploy/public/backup/restore.md
set -euo pipefail

DEST="${BACKUP_DIR:-$HOME/launchkit-backup-files}"
KEEP_DAYS="${KEEP_DAYS:-30}"
RECIPIENT_FILE="${RECIPIENT_FILE:-$HOME/.config/launchkit-backup/age-recipient.txt}"
OFFSITE_HOOK="${OFFSITE_HOOK:-$HOME/.config/launchkit-backup/offsite.sh}"
DB_CONTAINER="${DB_CONTAINER:-launchkit-prod-db-1}"
ATT_VOLUME="${ATT_VOLUME:-launchkit-prod_files}"
# Imagem só para empacotar o volume (já presente no projeto; tem tar do busybox).
TAR_IMAGE="${TAR_IMAGE:-docker.io/library/redis:8-alpine}"

# launchd roda com PATH mínimo.
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/Applications/Docker.app/Contents/Resources/bin:$PATH"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*"; }
die() { log "ERRO: $*"; exit 1; }

command -v docker >/dev/null || die "docker não encontrado"
command -v age    >/dev/null || die "age não encontrado (brew install age)"
[ -r "$RECIPIENT_FILE" ]     || die "chave pública não encontrada em $RECIPIENT_FILE"
RECIPIENT="$(tr -d '[:space:]' < "$RECIPIENT_FILE")"
case "$RECIPIENT" in age1*) ;; *) die "conteúdo inválido em $RECIPIENT_FILE" ;; esac

# O destino precisa estar num volume montado; senão o mkdir criaria uma pasta fantasma em /Volumes.
case "$DEST" in
  /Volumes/*) VOL="/Volumes/$(echo "$DEST" | cut -d/ -f3)"; [ -d "$VOL" ] || die "volume $VOL não está montado" ;;
esac
mkdir -p "$DEST"
umask 077

docker inspect -f '{{.State.Health.Status}}' "$DB_CONTAINER" 2>/dev/null | grep -q healthy \
  || die "container $DB_CONTAINER não está saudável"

TS="$(date +%Y%m%d-%H%M%S)"
DB_OUT="$DEST/launchkit-db-$TS.dump.age"
ATT_OUT="$DEST/launchkit-files-$TS.tar.gz.age"

# --- 1. Banco -----------------------------------------------------------------
log "dump do banco..."
docker exec "$DB_CONTAINER" pg_dump -U postgres -Fc launchkit | age -r "$RECIPIENT" -o "$DB_OUT.tmp"
[ -s "$DB_OUT.tmp" ] || die "dump vazio"
mv "$DB_OUT.tmp" "$DB_OUT"

# --- 2. Arquivos --------------------------------------------------------------
log "arquivos..."
docker run --rm --entrypoint tar -v "$ATT_VOLUME":/data:ro "$TAR_IMAGE" czf - -C /data . \
  | age -r "$RECIPIENT" -o "$ATT_OUT.tmp"
[ -s "$ATT_OUT.tmp" ] || die "pacote de arquivos vazio"
mv "$ATT_OUT.tmp" "$ATT_OUT"

# --- 3. Checksums e verificação -----------------------------------------------
( cd "$DEST" && shasum -a 256 "$(basename "$DB_OUT")" "$(basename "$ATT_OUT")" > "launchkit-$TS.sha256" )
( cd "$DEST" && shasum -a 256 -c "launchkit-$TS.sha256" >/dev/null ) || die "checksum não confere"
log "ok: $(du -h "$DB_OUT" | cut -f1) banco, $(du -h "$ATT_OUT" | cut -f1) arquivos -> $DEST"

# --- 4. Retenção (só arquivos deste esquema de nomes, só dentro de $DEST) -----------
if [ -n "$DEST" ] && [ -d "$DEST" ]; then
  find "$DEST" -maxdepth 1 -type f \
    \( -name 'launchkit-db-*.dump.age' -o -name 'launchkit-files-*.tar.gz.age' -o -name 'launchkit-*.sha256' \) \
    -mtime +"$KEEP_DAYS" -print -delete | sed 's/^/removido (retenção): /' || true
fi

# --- 5. Envio externo (opcional; configurado por você, com as suas próprias credenciais) --
if [ -x "$OFFSITE_HOOK" ]; then
  log "envio externo..."
  BACKUP_DIR="$DEST" BACKUP_TS="$TS" "$OFFSITE_HOOK" || die "falha no envio externo"
else
  log "aviso: sem envio externo configurado ($OFFSITE_HOOK não existe)"
fi
log "concluído"
