#!/bin/bash
# Configura as credenciais do Cloudflare R2 usadas pelo envio externo dos backups (offsite.sh).
#
# Pergunta cada valor (o Secret Access Key é digitado oculto), valida o formato, grava o arquivo
# com modo 600 e, a menos que use --no-test, confirma que as credenciais funcionam enviando e
# apagando um arquivo de teste no bucket. Nada é registrado em log nem enviado a terceiros (exceto o teste contra o R2):
# rode este script no SEU terminal.
#
# Uso: ./deploy/public/backup/setup-r2.sh [--file CAMINHO] [--no-test]
#   --file     onde salvar (padrão: ~/.config/launchkit-backup/r2.env, que o offsite.sh lê sozinho).
#              Em outro caminho, defina R2_ENV_FILE=<caminho> para o offsite.sh encontrá-lo.
#   --no-test  só grava o arquivo, sem testar contra o R2.
set -euo pipefail

FILE="$HOME/.config/launchkit-backup/r2.env"
DO_TEST=1
while [ $# -gt 0 ]; do
  case "$1" in
    --file)    [ $# -ge 2 ] || { echo "falta o caminho após --file" >&2; exit 2; }; FILE="$2"; shift 2 ;;
    --no-test) DO_TEST=0; shift ;;
    -h|--help) sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "opção desconhecida: $1 (use --help)" >&2; exit 2 ;;
  esac
done
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

say() { printf '%s\n' "$*"; }
# As variáveis locais abaixo têm prefixos próprios de propósito: em bash o escopo é dinâmico, e uma
# local com o mesmo nome da variável de destino (printf -v) receberia o valor no lugar do chamador.
ask() { # ask VAR "pergunta" [padrão] [oculto]
  local _ask_dest="$1" _ask_q="$2" _ask_def="${3:-}" _ask_hidden="${4:-}" _ask_val
  if [ -n "$_ask_hidden" ]; then
    read -r -s -p "$_ask_q: " _ask_val; echo
  elif [ -n "$_ask_def" ]; then
    read -r -p "$_ask_q [$_ask_def]: " _ask_val; _ask_val="${_ask_val:-$_ask_def}"
  else
    read -r -p "$_ask_q: " _ask_val
  fi
  printf -v "$_ask_dest" '%s' "$_ask_val"
}
valid() { # valid "valor" 'regex' "mensagem"
  if [[ "$1" =~ $2 ]]; then return 0; fi
  say "  valor inválido: $3" >&2; return 1
}
ask_valid() { # ask_valid VAR "pergunta" 'regex' "mensagem" [padrão] [oculto]
  local _av_dest="$1" _av_val
  while true; do
    ask _av_val "$2" "${5:-}" "${6:-}"
    if valid "$_av_val" "$3" "$4"; then printf -v "$_av_dest" '%s' "$_av_val"; return 0; fi
  done
}

say "Configuração do Cloudflare R2 para os backups do launchkit"
say "Arquivo de destino: $FILE"
say

if [ -e "$FILE" ]; then
  read -r -p "O arquivo já existe. Sobrescrever? [s/N]: " ans
  case "$ans" in s|S|sim|SIM) ;; *) say "Nada alterado."; exit 0 ;; esac
fi

say "Onde achar cada valor (painel da Cloudflare):"
say "  Account ID .......... R2 Object Storage -> coluna da direita"
say "  Access Key / Secret . R2 -> Manage API Tokens -> Create API token (Object Read & Write, só o seu bucket)"
say

ask_valid ACCOUNT_ID "Account ID (32 caracteres hexadecimais)" '^[0-9a-fA-F]{32}$' "esperado 32 caracteres hexadecimais"
ask_valid ACCESS_KEY "Access Key ID (32 caracteres hexadecimais)" '^[0-9a-fA-F]{32}$' "esperado 32 caracteres hexadecimais"
ask_valid SECRET_KEY "Secret Access Key (64 hexadecimais; não aparece ao digitar)" '^[0-9a-fA-F]{64}$' "esperado 64 caracteres hexadecimais" "" hidden
ask_valid BUCKET "Nome do bucket" '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$' "3 a 63 caracteres: minúsculas, números e hífen"
ask_valid PREFIX "Pasta dentro do bucket" '^[A-Za-z0-9._-]{1,64}$' "use letras, números, ponto, hífen ou sublinhado" "launchkit"
ask_valid KEEP "Dias de retenção no R2" '^[0-9]{1,4}$' "informe um número de dias" "90"
if [ "$KEEP" -lt 7 ]; then say "  aviso: retenção muito curta (<7 dias); usando 7."; KEEP=7; fi

# Os valores já foram validados contra listas estritas de caracteres, então são seguros entre aspas simples.
umask 077
mkdir -p "$(dirname "$FILE")"
TMP="$(mktemp "$(dirname "$FILE")/.r2.env.XXXXXX")"
trap 'rm -f "$TMP"' EXIT
{
  echo "# Gerado por deploy/public/backup/setup-r2.sh em $(date '+%Y-%m-%d %H:%M:%S'). Não commitar."
  echo "R2_ACCOUNT_ID='$ACCOUNT_ID'"
  echo "R2_ACCESS_KEY_ID='$ACCESS_KEY'"
  echo "R2_SECRET_ACCESS_KEY='$SECRET_KEY'"
  echo "R2_BUCKET='$BUCKET'"
  echo "R2_PREFIX='$PREFIX'"
  echo "KEEP_REMOTE_DAYS='$KEEP'"
} > "$TMP"
chmod 600 "$TMP"
mv "$TMP" "$FILE"
trap - EXIT
say
say "Salvo em $FILE (modo $(stat -f '%Lp' "$FILE"))."

if [ "$DO_TEST" -eq 0 ]; then say "Teste contra o R2 ignorado (--no-test)."; exit 0; fi

command -v rclone >/dev/null || { say "rclone não encontrado (brew install rclone); teste ignorado."; exit 0; }
say "Testando contra o R2 (envia e apaga um arquivo de teste)..."
export RCLONE_CONFIG=/dev/null
export RCLONE_CONFIG_R2_TYPE=s3 RCLONE_CONFIG_R2_PROVIDER=Cloudflare RCLONE_CONFIG_R2_ACL=private
export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$ACCESS_KEY" RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$SECRET_KEY"
export RCLONE_CONFIG_R2_ENDPOINT="https://${ACCOUNT_ID}.r2.cloudflarestorage.com"
export RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true
PROBE="$(mktemp)"; trap 'rm -f "$PROBE"' EXIT
echo "teste de credenciais $(date +%s)" > "$PROBE"
REMOTE="r2:${BUCKET}/${PREFIX}/.setup-test"
if rclone copyto "$PROBE" "$REMOTE" --retries 1 --low-level-retries 2 --quiet 2>"$PROBE.err" \
   && rclone cat "$REMOTE" --quiet 2>>"$PROBE.err" | cmp -s - "$PROBE" \
   && rclone deletefile "$REMOTE" --quiet 2>>"$PROBE.err"; then
  rm -f "$PROBE.err"
  say "OK: credenciais válidas; escrita, leitura e exclusão funcionam no bucket '$BUCKET'."
else
  say "FALHOU. Motivo (sem segredos):"
  sed -E 's/(key|secret|token)[^ ]*/\1=***/Ig' "$PROBE.err" | head -8 | sed 's/^/  /'
  rm -f "$PROBE.err"
  say "As credenciais foram salvas, mas não validadas. Confira o bucket, o escopo do token e rode de novo."
  exit 1
fi
