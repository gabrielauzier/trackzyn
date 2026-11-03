# Escolha de stack e operação (Compose, Helm, release, select-stack)

profile: light · handoff: on · budget 150k por batch

Sources:

- `.tasks/02-escolha-de-stack-e-operacao.md` - **a fonte**: 22 critérios em 5 slices, `Decided`, `Unresolved`. `C1..C22` abaixo são os números dos critérios.
- `docs/prds/prd-feature-1-node-fastify-backend.md` - histórias 6 e 8, FR-009 e FR-011
- `docs/plans/feature-1-node-fastify-backend.md` - decisão D2 e fase 7
- `.checks/01-backend-node-paridade-de-contrato.md` e `backend-node/`, `contracts/` - o que a task 01 entregou (porta 8000, `/api/health`, `src/migrate.ts`, `src/worker.ts`, schema idêntico ao do Alembic, baseline sobre banco do Python)
- Sem interface binding: a task não tem tela.

Decisões do usuário (fora de `.tasks`): o registry de `launchkit-backend-node` fica para depois (`IMAGE_PREFIX` configurável; pendência de go-live, `Unresolved` 1); `select-stack` recusa árvore suja; só Docker é verificado em CI, `podman-compose` é best-effort; o mecanismo do Compose (`Unresolved` 2) é decisão do build, registrada em `Landing`.

## Out of scope

- Rodar as duas stacks ao mesmo tempo sobre o mesmo banco; migrar dados entre stacks com ferramenta própria; renomear `backend/`; validar `podman-compose` em CI (igual à task).
- Escolher o registry/organização da imagem Node (`Unresolved` 1).

## Proof environment

Docker 28 / Compose v2.34, sem `helm` nem `actionlint` locais: `docker run --rm -v "$PWD":/w -w /w alpine/helm:4.3.0` e `rhysd/actionlint:1.7.12 .github/workflows/*.yml` (versões fixas; arquivos passados explicitamente porque o actionlint sem argumentos exige um repositório Git e falha com exit 3 numa cópia sem `.git`). Todo projeto Compose de teste usa `-p t02-<caso>` e portas de host livres sorteadas pelo teste; o teste derruba o projeto (`down -v`) no `after`. Proofs de Compose/Helm/install/select-stack são `node:test` em `scripts/stack/` (um arquivo por assunto; o título de cada caso começa com o id, `C1 ...`):

```
node --test --test-name-pattern='^C1 ' scripts/stack/stack.test.mjs
```

Proofs do CI de PR: `python3 .github/ci/test_changes.py`, `python3 .github/ci/test_workflow_jobs.py`, `docker run --rm -v "$PWD":/w -w /w rhysd/actionlint:1.7.12 .github/workflows/ci.yml .github/workflows/release.yml`.

## Local proof limits

- C20 e C21 são jobs do GitHub: localmente se prova o mesmo comando que o job chama (`node --test ... stack.test.mjs` com `-t` dos casos 1, 2, 4, 17, 18; `select-stack` + C14 em cópia) e, em `test_workflow_jobs.py`, que o job existe e chama esse comando. Que o GitHub o execute só se vê no CI.
- C10 (`release.yml`) só roda no GitHub: o proof é de texto do workflow + `actionlint`.
- `podman-compose` não é testado (decisão do usuário).
- O `permission denied` dos contêineres do C14 num runner com outro uid só se vê no CI; localmente prova-se (sem Docker) que a cópia fica legível por outro usuário (`C14 the copy handed to a container is readable by another user`, vermelho sem o `chmod`).
- C6 prova a migration falhando com banco inválido (exit ≠ 0 e a API não chega a escutar), num `docker compose run`; não prova `/api/health` sem resposta 200 num container de longa duração.

## Decisões do mantenedor durante o build (`.tasks` atualizado em b6bb342)

- **C3** - `BACKEND_STACK=go`: `docker compose up` falha antes de criar containers (0 containers) com o erro nativo que aponta o `go.yml` inexistente; `install.sh`, `launchkit-compose` e o preflight do CI imprimem `BACKEND_STACK must be python or node (got: go)` e saem com 2
Proof: `node --test --test-name-pattern='^C3 ' scripts/stack/stack.test.mjs` (4 casos: `docker compose -p t02-c3 up` com `go`: exit ≠ 0, saída cita `go.yml`, `ps -a -q` vazio; `install.sh` com `BACKEND_STACK=go` no ambiente; `launchkit-compose` com env-file `BACKEND_STACK=go`; `scripts/stack/preflight.sh`: cada um com exit 2 e a frase em stderr; valores `python`, `node` e ausente passam com exit 0)
Precedência (sem Docker, `docker` falso): `BACKEND_STACK=go` no ambiente com env-file `node` => exit 2 e a frase; `node` no ambiente com env-file `go` => exit 0 (o ambiente vale, como no Compose), para `preflight.sh` e `launchkit-compose`. Mutante `STACK=""`/`value=""` (ignora o ambiente) derruba 4 casos.
Também: `docker compose up` sem `.env` e sem `BACKEND_STACK` (C2 ausente) continua subindo a stack Python.

**C4** - `BACKEND_STACK=node`: `GET http://localhost:<FRONTEND_PORT>/api/health` 200 `{"status":"healthy"}`, e o frontend alcança a API em `http://backend:8000`
Proof: `node --test --test-name-pattern='^C4 ' scripts/stack/stack.test.mjs` (health pelo frontend; `docker compose exec frontend` resolve `backend` e `GET http://backend:8000/api/health` 200)

**C5** - `BACKEND_STACK=node`, banco vazio: quando `/api/health` responde 200 pela primeira vez, as 6 tabelas (`users`, `user_passkeys`, `workspaces`, `workspace_members`, `app_settings`, `files`) existem; reiniciar `backend-node` roda a migration de novo sem erro e sem DDL
Proof: `node --test --test-name-pattern='^C5 ' scripts/stack/stack.test.mjs` (consulta `\dt` no `db` logo após o primeiro 200; `docker compose restart backend-node`, log contém `migrations applied` duas vezes, `pg_stat_statements`-free: o `pg_dump --schema-only` antes e depois é idêntico)

**C6** - Migration do `backend-node` falha: o container sai com código ≠ 0 e `/api/health` nunca responde 200
Proof: `node --test --test-name-pattern='^C6 ' scripts/stack/stack.test.mjs` (`DATABASE_URL` inválido para o backend-node via `docker compose run --rm --no-deps -e DATABASE_URL=... backend-node sh -c "node dist/migrate.js"`... no dev: `npm run migrate`; exit ≠ 0; e a sequência `migrate && server` do serviço não chega a abrir a porta)

### S2 - Produção, Helm e release · ~14 files · ~35 KB · ~9k (+ libs/imagem helm ~6k) = ~15k

**C7** - `docker-compose.prod.yml` com `BACKEND_STACK=node`: a API usa a imagem `<IMAGE_PREFIX>/launchkit-backend-node:<tag>` e nenhum serviço Python sobe
Proof: `node --test --test-name-pattern='^C7 ' scripts/stack/stack.test.mjs` (`docker compose -f docker-compose.prod.yml config --format json` com `IMAGE_PREFIX=ghcr.io/acme/launchkit APP_VERSION=1.2.3`: `backend-node.image == ghcr.io/acme/launchkit-backend-node:1.2.3`; nenhum serviço `backend`/`celery-*`; e o caso `python` mantém `launchkit-backend:1.2.3`)

**C8** - `backend.stack: node` + `helm template`: imagem `launchkit-backend-node`, job de migration, `worker` e `beat` com comandos Node (`node dist/migrate.js`, `node dist/worker.js`, `node dist/scheduler.js`), nenhum manifesto contém `celery` nem `alembic`; `helm lint` passa
Proof: `node --test --test-name-pattern='^C8 ' scripts/stack/helm.test.mjs` (alpine/helm: `helm template` e `helm lint`; asserts nos 3 comandos, na imagem e `!/celery|alembic/i`)

**C9** - `backend.stack: python` (padrão): `helm template` idêntico ao de antes desta task
Proof: `node --test --test-name-pattern='^C9 ' scripts/stack/helm.test.mjs` (renderiza `charts/launchkit` do commit-base `git show 91cc000:...` extraído para tmp e o atual, com e sem `--set backend.stack=python`, e `diff` vazio)

**C10** - `release.yml` publica `launchkit-backend-node` além de `launchkit-backend` e `launchkit-frontend`
Proof: `python3 .github/ci/test_workflow_jobs.py ReleaseWorkflowTest.test_publishes_three_images` (3 imagens `launchkit-backend`, `launchkit-backend-node`, `launchkit-frontend` nos blocos de metadata, e o job Node usa `context: ./backend-node`)
Proof: `docker run --rm -v "$PWD":/w -w /w rhysd/actionlint:1.7.12 .github/workflows/ci.yml .github/workflows/release.yml` (0 erros em `.github/workflows/`)
CI-only: a publicação em si só ocorre numa release do GitHub.

**C11** - `install.sh --stack node` grava `BACKEND_STACK=node` no `.env` e baixa `launchkit-backend-node`; sem `--stack` é o de hoje (`python`); `--stack go` sai com 2 e lista `python` e `node`
Proof: `node --test --test-name-pattern='^C11 ' scripts/stack/install.test.mjs` (roda `install.sh` com `docker` falso no PATH que registra os argumentos: `.env` gerado e `docker compose ... pull`/`config` com `BACKEND_STACK` no ambiente; `--stack go`: exit 2, stderr com `python` e `node`)

### S3 - Criar um projeto com uma stack só · ~25 files · ~60 KB · ~15k (+ libs ~5k) = ~20k

**C12** - `select-stack.mjs --stack node`: `backend/` e `contracts/` não existem e `grep -rIlE 'celery|alembic|uvicorn|pytest|ruff'` sobre `docker-compose*.yml compose/ .github/ charts/ README.md CONTRIBUTING.md mise.toml renovate.json .pre-commit-config.yaml` (sem lockfiles) retorna 0 arquivos; o baseline do Alembic em `backend-node/` permanece e não conta
Proof: `node --test --test-name-pattern='^C12 ' scripts/stack/select-stack.test.mjs` (cópia com `git clone --local`; além do grep, `backend-node/src/db/migrate.ts` ainda existe)

**C13** - `select-stack.mjs --stack python`: `backend-node/` e `contracts/` não existem e `grep -rIlE 'fastify|drizzle|bullmq'` sobre os mesmos caminhos (sem lockfiles) retorna 0 arquivos
Proof: `node --test --test-name-pattern='^C13 ' scripts/stack/select-stack.test.mjs`
Proof (desktop, critério atualizado pelo usuário: cliente remoto na árvore Python): `node --test --test-name-pattern='^C13 the desktop of a python tree is a remote client' scripts/stack/select-stack.test.mjs` (arquivos do modo local ausentes, `package.json` e lockfile sem `@electric-sql/pglite`, `@node-rs/argon2` e `esbuild`, `electron-builder.yml` sem backend, locales sem `desktop.mode`/`desktop.transfer`/`exportData`/`importData`, nenhuma palavra `fastify|drizzle|bullmq` nem `Use this computer`/`startLocal` em `desktop/` e `frontend/src`) e `... '^C13 the desktop of a node tree keeps the local mode'` (a árvore Node mantém tudo e fica sem marcadores)

**C14** - Após `select-stack` (qualquer stack): `docker compose config -q` e `helm lint charts/launchkit` saem com 0 e `actionlint` não aponta erro em `.github/workflows/`
Proof (desktop da árvore Python, sem Docker): `node --test --test-name-pattern='^C14 the desktop of a python tree' scripts/stack/select-stack.test.mjs` (cópia sem `.git`: `npm ci` do `frontend/` e do `desktop/`, `lint`, `typecheck` e testes do frontend, `lint`, `typecheck`, `build:frontend`, `build`, `package:dir` e `npm test` do desktop com `CI` ligado, sem pasta `backend` no pacote, e `test_changes.py`/`test_workflow_jobs.py`; `DESKTOP_E2E=1` acrescenta o Playwright do cliente remoto)
Proof: `node --test --test-name-pattern='^C14 ' scripts/stack/select-stack.test.mjs` (para `python` e `node`, em cópia; além disso, na árvore resultante `python3 .github/ci/test_changes.py` e `python3 .github/ci/test_workflow_jobs.py` passam)

**C15** - Sem `--stack` ou valor inválido: exit 2 e uso com `python` e `node`; stack pedida já é a única: exit 0, `already selected: <stack>`, sem alterar arquivos
Proof: `node --test --test-name-pattern='^C15 ' scripts/stack/select-stack.test.mjs` (4 casos: sem flag, `go`, já-selecionada em `python`, já-selecionada em `node`; `git status --porcelain` vazio nos dois últimos)

**C16** - Árvore com mudanças não commitadas: exit 1, `working tree not clean`, nenhum arquivo apagado
Proof: `node --test --test-name-pattern='^C16 ' scripts/stack/select-stack.test.mjs` (arquivo modificado e arquivo não rastreado; ambos os casos, `backend/` e `backend-node/` seguem existindo)

### S4 - Trocar de stack mantendo os dados · ~3 files · ~22 KB · ~6k (+ imagens/dados ~8k) = ~14k

**C17** - Instalação Python com 1 usuário, 1 workspace e 1 arquivo; `BACKEND_STACK=node` e `up` sem recriar `pgdata` e `files`: o usuário entra com a mesma senha e `GET /api/workspaces` e `GET /api/files` devolvem os mesmos ids e contagens
Proof: `node --test --test-name-pattern='^C17 ' scripts/stack/stack.test.mjs` (usa a API HTTP: `POST /api/setup/create-admin`, `GET /api/workspaces`, `POST /api/files` com multipart; `down` sem `-v`; `up` com `node`)

**C18** - Após uso no Node, `BACKEND_STACK=python` de novo: login funciona e os itens criados no Node aparecem em `GET /api/workspaces` e `GET /api/files`
Proof: `node --test --test-name-pattern='^C18 ' scripts/stack/stack.test.mjs` (continuação do projeto de C17: cria 1 workspace e 1 arquivo no Node, volta ao Python)

**C19** - `deploy/public/README.md` tem a seção "Trocar de stack" listando, nesta ordem: backup (`deploy/public/backup/backup.sh`), troca de `BACKEND_STACK`, verificação de `GET /api/health`, voltar atrás
Proof: `node --test --test-name-pattern='^C19 ' scripts/stack/docs.test.mjs` (extrai a seção por título e confere a ordem dos 4 marcadores)

### S5 - Verificação no CI · ~4 files · ~33 KB · ~8k (+ libs ~3k) = ~11k

**C20** - Job `stack-switch` executa os critérios 1, 2, 4, 17 e 18 com Docker Compose e falha se algum falhar
Proof: `python3 .github/ci/test_workflow_jobs.py StackJobsTest.test_stack_switch_runs_cases_1_2_4_17_18` (o bloco do job chama `scripts/stack/stack.test.mjs` com o padrão `^C(1|2|4|17|18) `)
Proof: `node --test --test-name-pattern='^C(1|2|4|17|18) ' scripts/stack/stack.test.mjs` (o mesmo comando, local)
CI-only: execução no GitHub.

**C21** - Job `select-stack` aplica `select-stack` numa cópia para cada stack e executa o critério 14 em cada cópia
Proof: `python3 .github/ci/test_workflow_jobs.py StackJobsTest.test_select_stack_job_runs_case_14_for_both_stacks` (matriz `stack: [python, node]` e o comando de C14)
Proof: `node --test --test-name-pattern='^C14 ' scripts/stack/select-stack.test.mjs` (local)
CI-only: execução no GitHub.

**C22** - PR que altera só `docker-compose*.yml`, `charts/` ou `scripts/select-stack.mjs`: `changes.py` marca `stack-switch` e `select-stack` como `true`
Proof: `python3 .github/ci/test_changes.py CIChangesTest.test_stack_jobs_triggers` (três arquivos, cada um sozinho: `run_stack_switch=true` e `run_select_stack=true`; um PR só de `frontend/` ou só de docs: `false`)
Proof: `python3 .github/ci/test_workflow_jobs.py ChangesWiringTest.test_stack_jobs_read_their_outputs`

## Swept

- validation: C3, C11, C15, C16
- failure modes: C6, C16
- idempotency and retry: C5, C15
- authorization: n/a - sem endpoint novo; quem roda os comandos já tem acesso ao host e ao repositório
- concurrency and ordering: existing - `depends_on` com `condition: service_healthy` de `db` e `redis`; C1/C4 conferem a ordem de subida pelo health
- data lifecycle: C17, C18
- external-dependency failure: existing - healthchecks de `db` e `redis`; migration falha em C6
- state transitions: C17, C18
- observability: C4

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| serviços Compose Node (6) | `redis` `db` `frontend` `backend-node` `worker-node` `scheduler-node`: igualdade de conjunto em C1 | - |
| serviços Compose Python (6) | `redis` `db` `backend` `frontend` `celery-worker` `celery-beat`: igualdade de conjunto em C2 | - |
| valores de `BACKEND_STACK` (4) | `python` C2 · ausente C2 · `node` C1 · `go` C3 | C3 bloqueado |
| tabelas do schema (6) | `users` `user_passkeys` `workspaces` `workspace_members` `app_settings` `files` todas em C5 | - |
| comandos Node no Helm (3) | migration C8 · worker C8 · beat C8 | - |
| imagens publicadas (3) | `launchkit-backend` C10 · `launchkit-backend-node` C10 · `launchkit-frontend` C10 | - |
| entradas do `install.sh` (3) | `--stack node` C11 · sem flag C11 · `--stack go` C11 | - |
| saídas do `select-stack` (5) | 0 já-selecionada C15 · 0 aplicada C12/C13 · 1 árvore suja C16 · 2 sem flag C15 · 2 valor inválido C15 | - |
| stacks do `select-stack` (2) | `node` C12 C14 · `python` C13 C14 | C12/C13 bloqueados no `grep` literal |
| gatilhos de CI (3 caminhos) | `docker-compose*.yml` C22 · `charts/` C22 · `scripts/select-stack.mjs` C22 | - |
| seções "Trocar de stack" (4 passos) | backup · troca · health · voltar, todos em C19 | - |
| arquivos de configuração na partida (stack Node: 3 montagens) | `server.ts`/`worker.ts`/`scheduler.ts` chamam o mesmo `loadConfig()`/`buildContext()` (task 01); a env da stack vem de `common.yml` em dev e prod | - |

- Claims que nomeiam status, rota ou forma de resposta: C4, C17, C18 - cada um tem proof que cruza o limite (HTTP real pelo frontend ou pela porta da API)
- Nenhum outro check afirma mais que o caso exercitado pelo seu proof

## Handoff

Corte: S1-S5 somam ~78k de piso (18 + 15 + 20 + 14 + 11) e, com a iteração (logs de build, retries), ~150k estimado; cabe em um batch pela aritmética, mas S3 não pode ser fechada enquanto C3, C12 e C13 estiverem **bloqueados** (ver acima). Corte real: **Batch 1 = S1, S2, S4, S5 (menos o que depende de S3)** e S3 espera a decisão do usuário. Dentro de S1, C3 também espera.

### Batch 1 fechado

- **Onde o limite caiu:** C1, C2, C4, C5, C6 (S1), C7, C8, C9, C10, C11 (S2), C17, C18, C19 (S4), C20 e C22 (S5) fechados nos commits `ebc11c5` (Compose, Dockerfile, scheduler), `5e810ee` (Helm, release, install.sh), o commit de `test(stack)` (C17-C19) e o de CI (`stack-switch`, `changes.py`). **Abertos:** C3 (Compose não compara o valor; BLOCKED), C12 e C13 (o `grep` literal sobre `.` casa arquivos legítimos; BLOCKED), C14, C15, C16 e C21 (dependem de `scripts/select-stack.mjs`, que não foi escrito: o desenho dos marcadores e do que a ferramenta apaga depende da decisão sobre C12/C13). S3 inteira + C21 formam o batch 2.
- **O que o usuário resolveu no meio:** nada além das decisões iniciais (registry adiado, árvore suja recusada, só Docker em CI, mecanismo do Compose à escolha do build).
- **O que foi abandonado:** `profiles` com interpolação (não compara valores; sem `.env` nada sobe) e overlay por `COMPOSE_FILE`; guarda com `env_file` por stack (falta de arquivo erra antes da mensagem) e `required: false` no `include` (a mensagem do `:?` não é alcançável); `project_directory` obriga `extends.file` relativo à raiz e caminhos de `common.yml` relativos a `compose/<env>/`. Correção de fato no checklist: a tabela é `user_passkeys`, não `passkeys`. O `actionlint` já apontava SC2086 em `release.yml` (`helm push`), corrigido com aspas para o C14 poder passar.

### Batch 2 fechado

- **Onde o limite caiu:** os 22 checks têm proof verde. C3 (reescrito) fechou em `scripts/stack/preflight.sh`, `install.sh`, `deploy/public/launchkit-compose` e no passo de preflight do `stack-switch`; C12-C16 fecharam em `scripts/select-stack.mjs` (+ marcadores em README, CONTRIBUTING, PR template, mise.toml, compose, charts, `ci.yml`, `release.yml`, `test_workflow_jobs.py`); C21 fechou com o job `select-stack` (matriz `python|node`, `ONLY_STACK`). Commits: ver `git log` a partir de `ff1d7d1`.
- **O que o usuário resolveu no meio:** as decisões de `.tasks` b6bb342 (C3 com erro nativo + frase nos três lugares, escopo do `grep` de C12/C13, `contracts/` apagado nas duas seleções).
- **O que foi abandonado:** marcadores dentro dos templates do Helm (mudariam a saída renderizada e quebrariam o C9): o chart é resolvido por código; `--stack node` sem apagar `.pre-commit-config.yaml` (só tem hooks da stack removida); `changes.py`/`test_changes.py` ficam iguais nas duas árvore (superado: o desktop da árvore Python não depende de `backend_node`, ver o Handoff abaixo)s (só roteiam caminhos).
- **Limite local:** `select-stack` não toca `install.sh`, `deploy/public/` nem `.env.example` (fora do escopo do `grep`); uma árvore já selecionada ainda grava/aceita `BACKEND_STACK` sem efeito.
- **Integração com o desktop (task 4, decisão do usuário):** `select-stack --stack python` agora deixa `desktop/` como cliente remoto. Mecanismo e alternativa rejeitada no `Landing` de `.checks/04`. Mudanças: `select-stack.mjs` (lista `DESKTOP_LOCAL_MODE` apagada na stack Python, marcadores `//~`, `editDesktopPackage`, `editDesktopLock` com poda do grafo, `editLocales`, `frontend/` fora dos caminhos ignorados), blocos `node`/`python` em `index.ts`, `menu.ts`, `switch-server.ts`, preload, `shared/ipc.ts`, `desktop-gate.tsx`, `platform.ts`, `api.ts`, `electron-builder.yml`, testes e specs do desktop, `changes.py`/`test_changes.py` (`run_desktop` não segue `backend_node` na árvore Python) e dois comentários de workflow. Árvore Node: o `select-stack --stack node` de antes e de depois produz árvores idênticas, exceto o endurecimento de comentários em `ipc.test.ts`. Árvore completa: desktop 178 testes unitários (3 pulados sem pacote), 51 de Playwright, frontend 483, lint e typecheck limpos. Árvore Python: C13 (arquivos, pacote, lock, builder, locales, palavras) e C14 (instalação, lint, typecheck, testes, build, `package:dir`, e2e do cliente remoto 51 verdes) verdes.
- **Só o CI prova (integração):** os C14 de Compose, Helm e actionlint seguem exigindo Docker (não rodam aqui); o `npm ci` do C14 do desktop usa a rede e o cache do npm; o Playwright do C14 depende do binário do Electron e de display (`DESKTOP_E2E=1`, rodado aqui no macOS, no CI roda só quando a variável é ligada).

