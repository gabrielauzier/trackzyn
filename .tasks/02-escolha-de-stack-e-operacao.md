# Escolha de stack e operação (Compose, Helm, release, select-stack)

> Build this with **tlc-implement** (`.claude/skills/tlc-implement`).
> Every criterion below becomes a check with a proof, referenced by its number. Nothing under
> `Unresolved` gets settled while building.
>
> Pré-requisito: a task 1 (`01-backend-node-paridade-de-contrato.md`) entregue, porque esta task sobe, empacota e publica o backend Node.

## Intent

Mesmo com um backend Node, quem hospeda o launchkit não consegue escolhê-lo: `docker-compose.yml`, `docker-compose.prod.yml`, o chart Helm, `install.sh` e `release.yml` assumem Python (serviços `backend`, `celery-worker`, `celery-beat`, imagem `launchkit-backend`). E quem cria um projeto a partir do template herda as duas stacks, com arquivos de uma que nunca vai usar. A fonte não traz números.

Ao fim, `BACKEND_STACK=python|node` escolhe a stack em Compose (dev e prod), `backend.stack` escolhe no Helm, `install.sh --stack` e `release.yml` cobrem a stack Node, `scripts/select-stack.mjs` deixa um projeto novo com uma stack só, e uma instalação existente troca de stack mantendo os dados.

22 critérios em 5 slices · 5 portas de mão única · 1 aberta, 1 bloqueia o go-live

## Criteria

### Escolher a stack no Compose

1. Dado `BACKEND_STACK=node` no `.env`, quando `docker compose up --build` roda, então sobem `redis`, `db`, `frontend`, `backend-node`, `worker-node` e `scheduler-node`, e 0 containers de `backend`, `celery-worker` ou `celery-beat` (Python).
2. Dado `BACKEND_STACK=python` ou a variável ausente, quando `docker compose up --build` roda, então sobem os mesmos 6 serviços de hoje (`redis`, `db`, `backend`, `frontend`, `celery-worker`, `celery-beat`) e nenhum serviço Node.
3. Dado `BACKEND_STACK=go` (valor fora de `python|node`), quando o comando de subida roda, então ele falha antes de criar containers (0 containers criados) com o erro nativo do Compose, que aponta para o arquivo `go.yml` inexistente, e `install.sh`, `launchkit-compose` e o preflight do CI imprimem `BACKEND_STACK must be python or node (got: go)` e saem com código 2.
4. Dado `BACKEND_STACK=node`, quando `GET http://localhost:3000/api/health` roda, então 200 `{"status": "healthy"}`, com o frontend alcançando a API em `http://backend:8000`.
5. Dado `BACKEND_STACK=node` e banco vazio, quando `/api/health` responde 200 pela primeira vez, então as 6 tabelas do schema já existem; ao reiniciar o container, a migration roda de novo sem erro e sem DDL.
6. Se a migration do `backend-node` falha, então o container sai com código diferente de 0 e `/api/health` nunca responde 200.

### Produção, Helm e release

7. Dado `docker-compose.prod.yml` com `BACKEND_STACK=node`, quando `docker compose -f docker-compose.prod.yml up -d` roda, então o backend usa a imagem `<IMAGE_PREFIX>/launchkit-backend-node:<tag>` e nenhum serviço Python sobe.
8. Dado `backend.stack: node` no Helm, quando `helm template` roda, então a imagem do backend é `launchkit-backend-node`, o job de migration, o deployment `worker` e o deployment `beat` usam comandos Node, e nenhum manifesto contém `celery` ou `alembic`; `helm lint` passa.
9. Dado `backend.stack: python` (padrão), quando `helm template` roda, então a saída é idêntica à de antes desta task.
10. Quando a release é publicada, então `release.yml` publica `launchkit-backend-node` além de `launchkit-backend` e `launchkit-frontend`.
11. Quando `install.sh --stack node` roda, então grava `BACKEND_STACK=node` no `.env` e baixa a imagem `launchkit-backend-node`; sem `--stack`, o comportamento é o de hoje (`python`); com `--stack go`, sai com código 2 e lista `python` e `node`.

### Criar um projeto com uma stack só

12. Quando `node scripts/select-stack.mjs --stack node` roda, então `backend/` e `contracts/` não existem mais e `grep -rIlE 'celery|alembic|uvicorn|pytest|ruff'` sobre `docker-compose*.yml`, `compose/`, `.github/`, `charts/`, `README.md`, `CONTRIBUTING.md`, `mise.toml`, `renovate.json` e `.pre-commit-config.yaml` (sem lockfiles) retorna 0 arquivos; o código de baseline do Alembic em `backend-node/` permanece e não é contado.
13. Quando `node scripts/select-stack.mjs --stack python` roda, então `backend-node/` e `contracts/` não existem mais e `grep -rIlE 'fastify|drizzle|bullmq'` sobre os mesmos caminhos do critério 12 (sem lockfiles) retorna 0 arquivos; o app `desktop/` permanece como cliente remoto, sem o modo local: nada do pacote empacota `backend-node`, a interface não oferece `Use this computer` nem Exportar/Importar dados, e `lint`, `tsc`, os testes unitários e o build de `desktop/` passam na árvore resultante (decisão do usuário).
14. Dado o resultado de `select-stack` (qualquer stack), quando `docker compose config -q` e `helm lint charts/launchkit` rodam, então saem com código 0, e `actionlint` não aponta erro em `.github/workflows/`.
15. Se `select-stack` roda sem `--stack` ou com valor inválido, então sai com código 2 e imprime o uso com `python` e `node`; se a stack pedida já é a única presente, então sai com código 0 e a mensagem `already selected: <stack>`, sem alterar arquivos.
16. Se a árvore de trabalho tem mudanças não commitadas, então `select-stack` sai com código 1, imprime `working tree not clean` e não apaga nenhum arquivo.

### Trocar de stack mantendo os dados

17. Dado uma instalação Python com 1 usuário, 1 workspace e 1 arquivo, quando `BACKEND_STACK` muda para `node` e `docker compose up` roda sem recriar os volumes `pgdata` e `files`, então o usuário entra com a mesma senha e `GET /api/workspaces` e `GET /api/files` retornam os mesmos itens (mesmas contagens e ids).
18. Dado a instalação do critério 17 após uso no Node, quando `BACKEND_STACK` volta para `python`, então o login funciona e os itens criados no Node aparecem em `GET /api/workspaces` e `GET /api/files`.
19. Quando o guia `deploy/public/README.md` é lido, então a seção "Trocar de stack" lista, nesta ordem: backup (`deploy/public/backup/backup.sh`), troca de `BACKEND_STACK`, verificação de `GET /api/health`, e o passo de voltar atrás.

### Verificação no CI

20. Quando o job `stack-switch` roda no CI, então ele executa os critérios 1, 2, 4, 17 e 18 com Docker Compose, e falha se qualquer um falhar.
21. Quando o job `select-stack` roda no CI, então ele aplica `select-stack` em uma cópia do repositório para cada stack e executa o critério 14 em cada cópia.
22. Quando um PR altera só `docker-compose*.yml`, `charts/` ou `scripts/select-stack.mjs`, então `.github/ci/changes.py` marca os jobs `stack-switch` e `select-stack` como `true`; `test_changes.py` cobre o caso.

## Out of scope

- Rodar as duas stacks ao mesmo tempo sobre o mesmo banco - risco de corrupção e de conflito de migrations.
- Migrar dados entre stacks com ferramenta própria - o schema é o mesmo (task 1), então a troca é só de configuração.
- Renomear `backend/` para `backends/python/` - mexe em caminhos de CI, Compose e Helm sem ganho funcional.
- Validar `podman-compose` em CI - o Compose já tem `x-podman`, mas a verificação automática é só com Docker.

## Observable

| Surface | Decision | Landing |
| --- | --- | --- |
| comando `node scripts/select-stack.mjs` | saída e verbosidade | 15 |
| comando `node scripts/select-stack.mjs` | flags e padrões | 12, 13, 15 |
| comando `node scripts/select-stack.mjs` | códigos de saída | 15 |
| comando `node scripts/select-stack.mjs` | saída quando falha no meio | 16 |
| comando `install.sh --stack` | flags, padrões e códigos de saída | 11 |
| comando `docker compose up` com `BACKEND_STACK` | saída e códigos quando o valor é inválido | 3 |
| documento `deploy/public/README.md` | estrutura, profundidade e próximo passo do leitor | 19 |
| API | qualquer decisão | n/a - esta task não cria nem altera rotas |

## Swept

- validation: 3, 11, 15, 16
- failure modes: 6, 16
- idempotency and retry: 5, 15
- authorization: n/a - sem endpoint novo; quem roda os comandos já tem acesso ao host e ao repositório
- concurrency and ordering: existing - `depends_on` com `condition: service_healthy` em `docker-compose.yml` ordena a subida de `db` e `redis` antes do backend
- data lifecycle: 17, 18
- external-dependency failure: existing - `depends_on` com healthcheck de `db` e `redis`; migration falha no critério 6
- state transitions: 17, 18
- observability: 4

## Impact

| Front | What changes |
|---|---|
| domain | new term: `BACKEND_STACK` - `python` ou `node`, padrão `python`; lives in `.env.example`, `docker-compose*.yml`, `install.sh` |
| domain | existing term: o nome `backend` (serviço e host em `http://backend:8000`) significava o backend Python; passa a ser o alias de rede de qualquer stack - o nginx do frontend (`BACKEND_URL`), o proxy do Vite, `deploy/public/launchkit-compose`, `install.sh` (`HEALTH_URL`) e o `Service` do Helm referenciam esse nome hoje |
| stored data | nada a migrar; os volumes `pgdata` e `files` são compartilhados e dependem do critério 38 da task 1 (o Node sobe sobre banco criado pelo Alembic) |
| CI | novos jobs `stack-switch` e `select-stack`; `.github/ci/changes.py` ganha os dois gatilhos |

## Decided

| Decision | Shape | Alternative rejected |
|---|---|---|
| Variável de escolha | `BACKEND_STACK=python\|node`, padrão `python`, lida do `.env` | Duas variáveis (uma por serviço): permite combinações sem sentido, como API Python com worker Node. |
| Nomes dos serviços e porta | Python: `backend`, `celery-worker`, `celery-beat`; Node: `backend-node`, `worker-node`, `scheduler-node`; o serviço Node de API tem o alias de rede `backend` e escuta em `8000` | Renomear os serviços Python: quebra quem já usa o Compose e `deploy/public`. |
| Valor do Helm | `backend.stack: python\|node`, padrão `python` | Um chart por stack: duplica templates de Postgres, Redis, Ingress e HPA. |
| Nome da imagem publicada | `<IMAGE_PREFIX>/launchkit-backend-node` | Tag `-node` na imagem `launchkit-backend`: o mesmo nome apontaria para duas stacks e quebraria `docker pull` de quem fixa a imagem. |
| Contrato do script | `node scripts/select-stack.mjs --stack python\|node`; apaga o diretório e as referências da stack não escolhida; exit 0, 1 (falha), 2 (uso) | Manter as duas stacks em projetos derivados: o projeto carrega código morto e CI de uma stack que não usa. |

## Sources

- `docs/prds/prd-feature-1-node-fastify-backend.md` - histórias 6 e 8, FR-009 e FR-011
- `docs/plans/feature-1-node-fastify-backend.md` - decisão D2 e fase 7
- `docker-compose.yml`, `docker-compose.prod.yml`, `charts/launchkit/values.yaml`, `install.sh`, `.github/workflows/release.yml`, `deploy/public/` - o que hoje assume Python

This task is the record of decision. If a linked document diverges, ask before building.

## Unresolved

| # | Kind | Question | Until answered |
|---|---|---|---|
| 1 | blocks go-live | Em qual registry e organização o `release.yml` publica `launchkit-backend-node`? Hoje `IMAGE_PREFIX` e o chart apontam para `ghcr.io/your-org`. | Os critérios 7, 8 e 10 passam com o prefixo atual; ninguém consegue instalar a imagem Node de um registry real até alguém definir. |
| 2 | open | O mecanismo no Compose é `profiles` com interpolação ou um arquivo de overlay? | Decidido ao implementar; os critérios 1 a 3 valem para qualquer um dos dois. |
