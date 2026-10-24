# Publicar releases (imagens Docker)

Como construir e publicar as imagens Docker do launchkit que o seu servidor vai rodar, com uma versão fixa que você controla.

## Como funciona
- O workflow `.github/workflows/release.yml` roda quando uma **release é publicada** (`release: published`), constrói
  `launchkit-backend` e `launchkit-frontend` (`linux/amd64` e `linux/arm64`) **a partir do commit da release** e publica no GHCR em
  `ghcr.io/<dono-do-repositório>/launchkit-*`, com a tag da versão e com `latest`. O prefixo usa o dono do repositório, então
  **nenhuma alteração no workflow é necessária**.
- Ele também empacota o chart Helm em `ghcr.io/<dono>/charts`. Se você não usa Kubernetes, ignore (o job é independente das imagens).

## Organização de branches
| Branch | Papel |
|---|---|
| `main` | Desenvolvimento. O CI (`ci.yml`) roda em PRs e pushes para ela. |
| `prod` | O que roda no seu servidor. **Daqui saem as releases.** Avance com `git switch prod && git merge --ff-only main`. |

Se preferir publicar direto de `main`, rode o script com `RELEASE_BRANCH=main`.

## Esquema de versões
Semver simples (`0.1.0`, `0.1.1`, `0.2.0`). Atualize `frontend/package.json` e `backend/pyproject.toml` antes da release, para o
backend e o fallback do frontend reportarem a mesma versão. O frontend publicado mostra a tag da release (`VITE_APP_VERSION`).

## Preparação única (no GitHub)
1. Confirme que o Actions está habilitado no repositório.
2. Não é preciso criar segredos: o workflow usa o `GITHUB_TOKEN` com permissão de escrita de pacotes.

## Publicar uma release
1. Deixe a branch de release pronta e **enviada ao GitHub** (a release constrói o que está no remoto).
2. Confira sem criar nada:
   ```bash
   ./deploy/public/release.sh 0.1.0 --dry-run
   ```
   Ele valida: está na branch de release, árvore limpa, branch igual à do remoto e tag livre.
3. Publique (pede confirmação). Ele cria a release `v0.1.0` apontando para o **SHA exato** da branch:
   ```bash
   ./deploy/public/release.sh 0.1.0
   ```
4. Acompanhe o workflow "Build and Push Docker Images" (o build `arm64` sob emulação é o trecho lento):
   ```bash
   gh run watch --repo <dono>/launchkit
   ```
5. Confira as imagens e as arquiteturas:
   ```bash
   docker buildx imagetools inspect ghcr.io/<dono>/launchkit-backend:0.1.0 | grep Platform
   docker buildx imagetools inspect ghcr.io/<dono>/launchkit-frontend:0.1.0 | grep Platform
   ```

## Visibilidade dos pacotes (decida antes de puxar no servidor)
Pacotes criados pelo workflow podem nascer **privados**. Duas opções:
- **Tornar públicos:** no GitHub, *Packages* → cada pacote → *Package settings* → *Change visibility* (uma vez por pacote).
  Verifique de uma máquina sem login: `docker logout ghcr.io; docker pull ghcr.io/<dono>/launchkit-backend:<versão>`.
- **Mantê-los privados:** no servidor, `docker login ghcr.io -u <usuário>` com um token de acesso pessoal que tenha **apenas** `read:packages`.

## Colocar a versão no servidor
1. Backup (obrigatório: as migrations não são revertidas):
   ```bash
   ./deploy/public/backup/backup.sh
   ```
2. No `.env` de produção, aponte para o seu registry e para a versão:
   ```env
   IMAGE_PREFIX=ghcr.io/<dono>/launchkit
   APP_VERSION=0.1.0
   ```
3. Confira o que será usado (nada é alterado) e aplique:
   ```bash
   ./deploy/public/launchkit-compose config | grep image:
   ./deploy/public/launchkit-compose pull
   ./deploy/public/launchkit-compose up -d
   curl -s https://app.example.com/api/health
   ```
4. **Reverter:** recoloque a tag anterior e repita o `pull` e o `up -d`. Se a versão nova aplicou migrations (veja os logs do backend), restaure
   também o backup do passo 1 (ver [backup/restore.md](backup/restore.md)).

## Armadilhas
- **Release criada pela interface do GitHub:** funciona igual, mas selecione como alvo a branch de release (ou o commit).
- **Migrations são de mão única.** Antes de publicar, confira `git diff <tag-anterior> HEAD -- backend/alembic/versions`. Sem migration
  nova, voltar atrás é só trocar a tag; com migration, é preciso restaurar o backup.
- **Apagar uma release não apaga as imagens** publicadas; apague os pacotes/versões à mão se for preciso.
- **`latest`** sempre aponta para a release mais recente. Por isso a produção usa uma tag fixa, nunca `latest`.
- **Falha só no job do Helm** não invalida as imagens (elas são publicadas antes). Confira os pacotes antes de refazer a release.
- **Refazer um build:** não reaproveite a mesma tag; publique `0.1.1` (tags mutáveis dificultam saber o que está rodando).
- **Build multiarquitetura:** o frontend compila no estágio `--platform=$BUILDPLATFORM` (o resultado é HTML/JS/CSS, igual em qualquer
  arquitetura), o que evita travar o Vite sob QEMU no `arm64`. Mantenha essa linha no `frontend/Dockerfile`.
