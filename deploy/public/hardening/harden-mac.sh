#!/bin/bash
# Endurecimento do Mac que hospeda o launchkit.
#
# Altera configurações do SISTEMA e de SEGURANÇA do macOS, por isso exige sudo e é para VOCÊ rodar
# no próprio terminal. Cada mudança é mostrada antes e pede confirmação. Idempotente.
#
#   ./deploy/public/hardening/harden-mac.sh             # interativo (pede sudo)
#   ./deploy/public/hardening/harden-mac.sh --dry-run   # só mostra o que faria, não altera nada
#
# Mudanças:
#   1. Energia: nunca dormir na tomada e religar sozinho após queda de energia.
#   2. Firewall do macOS: ligar (aplicativos assinados continuam permitidos).
#   3. Firewall: bloquear conexões de ENTRADA do Docker Desktop (portas publicadas do stack de dev
#      em 0.0.0.0 deixam de ser alcançáveis pela rede local; o loopback e o túnel não são afetados).
#   4. (opcional) Não instalar atualizações do macOS automaticamente, para evitar reinícios surpresa.
#      Atualizações de SEGURANÇA e de dados de configuração continuam automáticas.
# Para desfazer: ver deploy/public/README.md, seção "Fase 4".
set -euo pipefail

DRY=0
case "${1:-}" in --dry-run) DRY=1 ;; "") ;; -h|--help) sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;; *) echo "opção desconhecida: $1" >&2; exit 2 ;; esac

FW=/usr/libexec/ApplicationFirewall/socketfilterfw
DOCKER_BACKEND="${DOCKER_BACKEND:-/Applications/Docker.app/Contents/MacOS/com.docker.backend}"
SU_PLIST=/Library/Preferences/com.apple.SoftwareUpdate

if [ "$DRY" -eq 0 ] && [ "$(id -u)" -ne 0 ]; then
  echo "Este script altera configurações do sistema e precisa de sudo."
  exec sudo -p "Senha de administrador de %u: " "$0" "$@"
fi

run() { if [ "$DRY" -eq 1 ]; then echo "    [dry-run] $*"; else echo "    + $*"; "$@"; fi; }
confirm() { # confirm "pergunta" padrão(s|n)
  if [ "$DRY" -eq 1 ]; then echo "    [dry-run] pergunta: $1"; return 0; fi
  local d="${2:-n}" a; read -r -p "  $1 [$( [ "$d" = s ] && echo S/n || echo s/N )]: " a
  case "${a:-$d}" in s|S|sim|SIM) return 0 ;; *) return 1 ;; esac
}

echo "=== Estado atual ==="
pmset -g custom | grep -E "^ *(sleep|disksleep|autorestart|womp)\b" | sed 's/^/  /'
$FW --getglobalstate | sed 's/^/  /'
echo "  auto-instalar macOS: $(defaults read "$SU_PLIST" AutomaticallyInstallMacOSUpdates 2>/dev/null || echo '(não definido)')"
echo

echo "[1/4] Energia: sleep 0, disksleep 0, autorestart 1 (o monitor ainda pode apagar)"
if confirm "Aplicar?" s; then run pmset -a sleep 0 disksleep 0 autorestart 1 womp 1; fi
echo

echo "[2/4] Ligar o firewall do macOS (apps assinados continuam permitidos)"
if confirm "Aplicar?" s; then
  run $FW --setglobalstate on
  run $FW --setallowsigned on
  run $FW --setallowsignedapp on
fi
echo

echo "[3/4] Bloquear conexões de entrada do Docker Desktop"
if [ -x "$DOCKER_BACKEND" ]; then
  echo "  binário: $DOCKER_BACKEND"
  echo "  Efeito: http://<IP-do-Mac>:3000 e :8000 (stack de dev) deixam de abrir pela rede local."
  echo "  A produção só escuta em 127.0.0.1 e o túnel fala por loopback: continuam funcionando."
  if confirm "Aplicar?" s; then
    run $FW --add "$DOCKER_BACKEND"
    run $FW --blockapp "$DOCKER_BACKEND"
  fi
else
  echo "  binário não encontrado em $DOCKER_BACKEND (defina DOCKER_BACKEND=...); pulando."
fi
echo

echo "[4/4] (opcional) Não instalar atualizações do macOS automaticamente"
echo "  Motivo: com FileVault, um reinício por atualização para na tela de senha e derruba o launchkit."
echo "  Custo: você passa a instalar as atualizações manualmente (recomendado: em janela de manutenção)."
echo "  Mantém automáticas: verificação, download e atualizações críticas de segurança/configuração."
if confirm "Aplicar?" n; then run defaults write "$SU_PLIST" AutomaticallyInstallMacOSUpdates -bool false; fi
echo

echo "=== Estado final ==="
pmset -g custom | grep -E "^ *(sleep|disksleep|autorestart|womp)\b" | sed 's/^/  /'
$FW --getglobalstate | sed 's/^/  /'
$FW --getappblocked "$DOCKER_BACKEND" 2>/dev/null | sed 's/^/  /' || true
echo "  auto-instalar macOS: $(defaults read "$SU_PLIST" AutomaticallyInstallMacOSUpdates 2>/dev/null || echo '(não definido)')"
[ "$DRY" -eq 1 ] && echo && echo "(dry-run: nada foi alterado)"
exit 0
