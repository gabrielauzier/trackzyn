#!/bin/bash
# Publica uma release para construir as imagens Docker (GHCR) pelo workflow release.yml.
#
#   ./deploy/public/release.sh <versão> [--dry-run]
#   ex.:  ./deploy/public/release.sh 0.1.0 --dry-run
#
# O que ele faz: confere que você está na branch de produção, com a árvore limpa e sincronizada com o
# remoto; que a tag ainda não existe; mostra o
# plano e pede confirmação; então cria a release de `v<versão>` apontando para o commit atual. A criação da
# release dispara o workflow, que publica ghcr.io/<seu-usuario>/trackzyn-backend e trackzyn-frontend com a tag
# <versão> e com `latest`.
#
# Variáveis: RELEASE_BRANCH (padrão: prod), RELEASE_REMOTE (padrão: origin),
#            UPSTREAM_REPO (opcional: repositório para o qual o script se recusa a publicar, ex.: o template original).
set -euo pipefail

VERSION="${1:-}"; DRY=0
[ "${2:-}" = "--dry-run" ] && DRY=1
BRANCH="${RELEASE_BRANCH:-prod}"
REMOTE="${RELEASE_REMOTE:-origin}"
UPSTREAM_REPO="${UPSTREAM_REPO:-}"

die() { echo "ERRO: $*" >&2; exit 1; }
ok()  { echo "  ok  $*"; }

[ -n "$VERSION" ] || die "informe a versão (ex.: 0.1.0). Uso: $0 <versão> [--dry-run]"
VERSION="${VERSION#v}"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]] || die "versão inválida: '$VERSION' (esperado X.Y.Z ou X.Y.Z-sufixo, ex.: 0.1.0)"
TAG="v$VERSION"
command -v git >/dev/null || die "git não encontrado"
command -v gh  >/dev/null || die "gh (GitHub CLI) não encontrado"
gh auth status >/dev/null 2>&1 || die "gh não está autenticado (gh auth login)"

echo "Conferências:"
CUR="$(git branch --show-current)"
[ "$CUR" = "$BRANCH" ] || die "você está em '$CUR'; releases saem da branch '$BRANCH'"
ok "branch $BRANCH"

[ -z "$(git status --porcelain)" ] || die "há alterações não commitadas; commite ou descarte antes"
ok "árvore de trabalho limpa"

git fetch -q "$REMOTE" "$BRANCH" 2>/dev/null || die "não foi possível buscar $REMOTE/$BRANCH (ela já foi enviada com git push?)"
[ "$(git rev-parse HEAD)" = "$(git rev-parse "$REMOTE/$BRANCH")" ] \
  || die "$BRANCH local difere de $REMOTE/$BRANCH; faça push (ou pull) antes de publicar, para a release construir o que está no GitHub"
ok "$BRANCH == $REMOTE/$BRANCH ($(git rev-parse --short HEAD))"

REPO="$(gh repo view "$(git remote get-url "$REMOTE")" --json nameWithOwner --jq .nameWithOwner)" || die "não consegui identificar o repositório de $REMOTE"
[ -z "$UPSTREAM_REPO" ] || [ "$REPO" != "$UPSTREAM_REPO" ] || die "$REMOTE aponta para $UPSTREAM_REPO, que está bloqueado por UPSTREAM_REPO"
OWNER="${REPO%%/*}"
ok "repositório de destino: $REPO"

if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null || git ls-remote --exit-code --tags "$REMOTE" "refs/tags/$TAG" >/dev/null 2>&1; then
  die "a tag $TAG já existe"
fi
if gh release view "$TAG" --repo "$REPO" >/dev/null 2>&1; then die "a release $TAG já existe em $REPO"; fi
ok "tag $TAG livre"

SHA="$(git rev-parse HEAD)"
echo
echo "Plano:"
echo "  release  $TAG  em  $REPO  (commit $SHA)"
echo "  imagens  ghcr.io/$OWNER/trackzyn-backend:$VERSION   ghcr.io/$OWNER/trackzyn-frontend:$VERSION   (e :latest)"
echo "  depois   IMAGE_PREFIX=ghcr.io/$OWNER/trackzyn  APP_VERSION=$VERSION  no .env do servidor"

if [ "$DRY" -eq 1 ]; then echo; echo "(dry-run: nada foi criado)"; exit 0; fi

echo
read -r -p "Publicar a release $TAG? [s/N]: " ans
case "$ans" in s|S|sim|SIM) ;; *) echo "cancelado."; exit 1 ;; esac

gh release create "$TAG" --repo "$REPO" --target "$SHA" --title "$TAG" \
  --notes "Build de produção a partir de $BRANCH @ ${SHA:0:7}. Imagens: ghcr.io/$OWNER/trackzyn-{backend,frontend}:$VERSION"

echo
echo "Release criada. O workflow 'Build and Push Docker Images' começou; acompanhe:"
echo "  gh run watch --repo $REPO \$(gh run list --repo $REPO --workflow release.yml --limit 1 --json databaseId --jq '.[0].databaseId')"
echo "Quando terminar, confira as imagens e a visibilidade dos pacotes (veja RELEASING.md)."
