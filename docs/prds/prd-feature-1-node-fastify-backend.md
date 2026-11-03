# PRD: Backend alternativo em Node.js (Fastify)

**Product/Feature Name:** launchkit: stack de backend Node.js + Fastify
**Status:** Draft
**Author:** Gabriel Auzier (com Claude)
**Stakeholders:** Mantenedor do launchkit, contribuidores, equipes que criam projetos a partir do template
**Date Created:** 2026-10-15
**Last Updated:** 2026-10-15
**Version:** 1.0

Plano técnico de referência: [feature-1-node-fastify-backend.md](../plans/feature-1-node-fastify-backend.md)

---

## Executive Summary

**One-liner:** Oferecer uma segunda implementação do backend do launchkit, em Node.js + Fastify, com o mesmo contrato HTTP da API em Python, e permitir escolher entre as duas stacks.

**Overview:** Hoje o launchkit é um template full-stack cujo backend só existe em Python (FastAPI, SQLAlchemy, Celery). Times que trabalham com TypeScript de ponta a ponta, ou que querem compartilhar tipos e validação com o frontend React, precisam reescrever o backend antes de começar. Esta feature entrega uma stack Node.js equivalente: 61 rotas (52 em `backend/app/api/`, 8 do fastapi-users e `/api/health`; contagem a confirmar pelo OpenAPI exportado na Fase 0), autenticação completa (senha, TOTP, passkeys, OIDC), workspaces com papéis, arquivos, painel admin e jobs em segundo plano.

O frontend não muda. Ele fala com `/api` e não sabe qual backend está atrás. A paridade é garantida por uma suíte de testes de contrato que roda contra as duas stacks no CI. A escolha da stack é feita por configuração (`BACKEND_STACK=python|node`) em quem hospeda, e por um script de seleção em quem cria um projeto novo a partir do template.

Esta feature também é pré-requisito do modo local da [Feature 2 (desktop com Electron)](prd-feature-2-electron-desktop.md), que embute o backend Node dentro do aplicativo.

**Quick Facts:**
- **Target Users:** Desenvolvedores que adotam o launchkit como base de projeto; mantenedores do template
- **Problem Solved:** Quem prefere ou precisa de Node/TypeScript no backend não tem como usar o template sem reescrevê-lo
- **Key Metric:** Percentual dos casos de teste de contrato que passam nas duas stacks (meta: 100%)
- **Target Launch:** Proposto para 2026-12-15, com base na estimativa de 5 a 6 semanas para uma pessoa (a confirmar)

---

## Problem Statement

### The Problem

O launchkit entrega um backend pronto e testado, mas amarrado a uma única linguagem. Para um time que não usa Python, o valor do template (auth, workspaces, admin, arquivos, jobs) some, porque o backend é justamente a parte mais cara de reconstruir.

### Current State

- Backend em `backend/`: FastAPI, SQLAlchemy 2 async, Alembic, fastapi-users (JWT), Celery + Redis, pytest.
- Frontend em `frontend/`: React, que consome `/api` via axios e interpreta erros no formato do FastAPI.
- Quem quer Node.js hoje faz um fork e porta tudo à mão, sem referência de contrato e sem garantia de compatibilidade com o frontend.

### Impact

**User Impact:**
- Times TypeScript descartam o template ou gastam semanas portando o backend.
- Quem porta perde as atualizações futuras do template.

**Business Impact:**
- Reduz a base de adoção possível do template.
- Não há como crescer o projeto para o desktop em modo offline (Feature 2) sem um backend que rode em Node dentro do Electron.

### Why Now?

A Feature 2 (Electron) precisa de um backend em Node para o modo local, e o frontend já usa TypeScript e Zod, o que torna o compartilhamento de tipos e validação natural.

---

## Goals & Objectives

### Business Goals

1. **Ampliar a adoção do template:** disponibilizar uma stack Node.js de primeira classe, com a mesma qualidade da Python.
2. **Manter as duas stacks sem divergência:** o contrato HTTP é verificado por máquina no CI.
3. **Destravar o desktop local:** entregar as interfaces (`KeyValueStore`, `JobQueue`) com implementação em memória que a Feature 2 precisa.

### User Goals

1. **Escolher a stack sem esforço:** uma variável de ambiente para rodar; um script para criar um projeto só com a stack escolhida.
2. **Trocar de stack sem perder dados:** um banco criado por uma stack funciona com a outra.
3. **Ter o mesmo comportamento:** o frontend, as integrações e os clientes existentes funcionam sem alteração.

### Non-Goals

- Remover, congelar ou depreciar o backend Python.
- Alterar o contrato da API. Mudanças de contrato começam no Python e são replicadas no Node.
- Rodar as duas stacks ao mesmo tempo contra o mesmo banco em produção.
- Reescrever o frontend.

---

## User Personas

### Primary Persona: Desenvolvedor TypeScript que adota o template

**Demographics:**
- Role/Title: Desenvolvedor full-stack ou líder técnico de um time pequeno
- Tech savviness: Alta
- Location: Global; documentação em inglês, com guia de self-hosting em português

**Behaviors:**
- Prefere uma única linguagem no projeto inteiro
- Avalia o template pelo README e pela facilidade de subir com `docker compose up`

**Needs & Motivations:**
- Começar com auth, workspaces e admin prontos, na linguagem do time
- Poder acompanhar atualizações do template

**Pain Points:**
- O backend em Python obriga a manter duas linguagens e dois toolchains
- Portar à mão não tem especificação nem testes de referência

**Quote:** _"Eu gostaria de usar o template, mas meu time só escreve TypeScript."_

### Secondary Persona: Mantenedor / contribuidor do template

**Behaviors:**
- Abre PRs que mudam a API e quer saber se quebraram alguma das stacks

**Needs & Motivations:**
- Um jeito objetivo de saber que as duas stacks continuam equivalentes

**Pain Points:**
- Revisão manual de paridade é lenta e falha

### Secondary Persona: Operador que faz self-hosting

**Behaviors:**
- Usa Docker Compose ou Helm; segue o guia em `deploy/public`

**Needs & Motivations:**
- Trocar de stack por configuração, mantendo dados e rotina de backup

---

## User Stories & Requirements

### Epic: Backend Node.js com paridade de contrato

#### Must-Have Stories (P0)

##### Story 1: Contrato congelado e verificável

**User Story:**
```
As a mantenedor do template,
I want a suíte de contrato HTTP executável contra qualquer backend,
So that eu saiba objetivamente se uma stack diverge da referência.
```

**Acceptance Criteria:**
- [ ] Given o backend Python rodando, when a suíte de contrato executa, then todos os casos passam
- [ ] Given uma mudança de rota no Python, when o CI roda, then o job falha se `contracts/openapi.json` não foi regenerado
- [ ] A suíte cobre status, corpo, cabeçalhos e o formato de erros (`detail` string, `detail` com `code`/`message` e 422 com lista)

**Priority:** Must Have (P0)
**Effort:** M
**Dependencies:** Nenhuma

---

##### Story 2: Login e cadastro no Node

**User Story:**
```
As a usuário final,
I want entrar e me cadastrar com e-mail e senha no backend Node,
So that o produto funcione igual independente da stack.
```

**Acceptance Criteria:**
- [ ] Given o primeiro acesso, when completo `/setup`, then o admin é criado e posso fazer login
- [ ] Given um usuário criado pelo Python, when faço login no Node com a mesma senha (hash argon2 ou bcrypt), then o login funciona
- [ ] Given um token emitido pelo Python, when o envio ao Node, then ele é aceito (e vice-versa)
- [ ] Given `LOCAL_AUTH_ENABLED=false`, when tento login local, then recebo o mesmo erro do Python
- [ ] Edge case: mais de 5 tentativas de login por minuto retornam 429 com `Retry-After`

**Priority:** Must Have (P0)
**Effort:** L
**Dependencies:** Story 1

---

##### Story 3: Autenticação avançada

**User Story:**
```
As a usuário final,
I want usar TOTP, passkeys e SSO (OIDC) no backend Node,
So that eu mantenha os mesmos métodos de segurança que tenho hoje.
```

**Acceptance Criteria:**
- [ ] Given 2FA ativo, when faço login, then recebo `requires_2fa` e um `temp_token` válido por 5 minutos
- [ ] Given uma passkey cadastrada na stack Python, when autentico no Node, then funciona (e vice-versa)
- [ ] Given OIDC configurado, when faço login pelo provedor, then sou redirecionado com o token e, conforme a config, tenho usuário criado, vinculado e papéis sincronizados
- [ ] Edge case: `WEBAUTHN_RP_ID` e `WEBAUTHN_ORIGIN` vazios seguem a origem do navegador, como no Python

**Priority:** Must Have (P0)
**Effort:** L
**Dependencies:** Story 2

---

##### Story 4: Workspaces e permissões

**User Story:**
```
As a membro de um workspace,
I want que meu papel (owner, editor, viewer ou manager) seja respeitado,
So that eu só faça o que minha permissão permite.
```

**Acceptance Criteria:**
- [ ] Given o cabeçalho `X-Workspace-Id`, when chamo uma rota de dados, then o workspace e a membership são resolvidos como no Python
- [ ] Given um viewer, when tento escrever, then recebo 403 `Read-only role`
- [ ] Given um usuário novo, when me cadastro, then recebo um workspace pessoal
- [ ] Os casos de `test_write_permission_gate.py` existem como testes de contrato e passam nas duas stacks

**Priority:** Must Have (P0)
**Effort:** M
**Dependencies:** Story 2

---

##### Story 5: Admin e arquivos

**User Story:**
```
As a administrador,
I want gerenciar usuários e configurações, e enviar e baixar arquivos no backend Node,
So that o painel admin e a tela de arquivos funcionem sem alteração.
```

**Acceptance Criteria:**
- [ ] Given um superusuário, when uso `/api/admin/*`, then CRUD de usuários, settings, timezone, formatos e cores se comportam como no Python
- [ ] Given um arquivo acima de `STORAGE_MAX_FILE_SIZE_MB` ou com extensão fora de `STORAGE_ALLOWED_EXTENSIONS`, when faço upload, then ele é rejeitado com o mesmo erro do Python
- [ ] Given um arquivo enviado, when faço download, then recebo o conteúdo em stream com o tipo correto

**Priority:** Must Have (P0)
**Effort:** M
**Dependencies:** Story 4

---

##### Story 6: Escolha da stack

**User Story:**
```
As a operador ou desenvolvedor,
I want escolher a stack por configuração,
So that eu suba o backend que preferir sem editar arquivos de infraestrutura.
```

**Acceptance Criteria:**
- [ ] Given `BACKEND_STACK=node` no `.env`, when executo `docker compose up`, then sobem o backend Node, seu worker e seu scheduler, e nenhum serviço Python
- [ ] Given `BACKEND_STACK=python` (padrão), when executo `docker compose up`, then o comportamento atual não muda
- [ ] Given `scripts/select-stack.mjs --stack node`, when executo, then o diretório `backend/` e as referências a Python em Compose, CI, Helm e README são removidos, e o projeto sobe com `docker compose up`
- [ ] Given o Helm com `backend.stack: node`, when instalo o chart, then imagem, migration, worker e scheduler usam a stack Node

**Priority:** Must Have (P0)
**Effort:** M
**Dependencies:** Stories 2 a 5

---

#### Should-Have Stories (P1)

##### Story 7: Jobs em segundo plano e CLI

**User Story:**
```
As a desenvolvedor,
I want jobs agendados e um CLI de administração no backend Node,
So that eu tenha o mesmo ponto de partida que tenho no Celery.
```

**Acceptance Criteria:**
- [ ] Given o worker Node rodando, when o scheduler dispara, then o job `report_user_count` executa de hora em hora
- [ ] Given `npm run cli -- create-user`, when informo e-mail, senha e `--superuser`, then o usuário é criado como no `app/cli.py`

**Priority:** Should Have (P1)
**Effort:** S
**Dependencies:** Story 2

---

##### Story 8: Trocar de stack mantendo os dados

**User Story:**
```
As a operador,
I want migrar uma instalação de Python para Node,
So that eu adote a nova stack sem perder dados.
```

**Acceptance Criteria:**
- [ ] Given um banco criado pelo Alembic, when subo o backend Node, then ele reconhece o schema e funciona sem recriar tabelas
- [ ] Given dois bancos vazios, when aplico as migrations de cada stack, then o `pg_dump --schema-only` dos dois é idêntico (ignorando as tabelas de controle de migration)
- [ ] O guia de migração em `deploy/public` documenta o procedimento e o backup prévio

**Priority:** Should Have (P1)
**Effort:** M
**Dependencies:** Story 6

---

#### Nice-to-Have Stories (P2)

##### Story 9: Tipos do frontend gerados do contrato

**User Story:**
```
As a desenvolvedor do frontend,
I want gerar os tipos de `src/types` a partir de `contracts/openapi.json`,
So that os tipos não saiam de sincronia com a API.
```

**Acceptance Criteria:**
- [ ] Given `contracts/openapi.json`, when executo o gerador, then os tipos produzidos compilam com o frontend sem alterações manuais

**Priority:** Nice to Have (P2)
**Effort:** S
**Dependencies:** Story 1

---

### Functional Requirements

| Req ID | Description | Priority | Status |
|--------|-------------|----------|--------|
| FR-001 | O backend Node expõe as mesmas 61 rotas, com os mesmos caminhos, métodos, corpos, status e erros do Python | Must Have | Open |
| FR-002 | Variáveis de ambiente e leitura de segredos (`CREDENTIALS_DIRECTORY`) têm os mesmos nomes e a mesma semântica do `Settings` Python, incluindo a validação de `LOCAL_AUTH_ENABLED=false` sem OIDC completo | Must Have | Open |
| FR-003 | Hashes de senha (argon2 e bcrypt) e JWTs (HS256, mesmas claims e audiences) são intercambiáveis entre as stacks | Must Have | Open |
| FR-004 | `temp_token` de 2FA, state de OIDC e challenges de WebAuthn usam o mesmo formato e as mesmas chaves no Redis | Must Have | Open |
| FR-005 | O schema do banco criado pela migration Drizzle é idêntico ao criado pelo Alembic | Must Have | Open |
| FR-006 | Os erros seguem o formato do FastAPI, incluindo 422 com `detail: [{loc, msg, type}]` | Must Have | Open |
| FR-007 | O rate limit usa o mesmo algoritmo e respeita `TRUSTED_PROXY_HOPS` | Must Have | Open |
| FR-008 | Redis, fila de jobs e armazenamento ficam atrás de interfaces (`KeyValueStore`, `JobQueue`, `StorageProvider`), com implementações em memória para testes e para o modo desktop local | Must Have | Open |
| FR-009 | `BACKEND_STACK` seleciona a stack no Compose; `backend.stack` seleciona no Helm; `scripts/select-stack.mjs` remove a stack não escolhida | Must Have | Open |
| FR-010 | A suíte de contrato roda no CI contra as duas stacks, usando PostgreSQL real | Must Have | Open |
| FR-011 | O pipeline de release publica a imagem `launchkit-backend-node` | Should Have | Open |
| FR-012 | O OpenAPI do Node fica disponível em `/api/openapi.json` e `/api/docs` | Should Have | Open |

### Non-Functional Requirements

| Req ID | Category | Description | Target |
|--------|----------|-------------|--------|
| NFR-001 | Qualidade | Cobertura de testes unitários e de integração do backend Node | Pelo menos 60% (mesmo piso do Python no CI) |
| NFR-002 | Performance | Latência de `GET /api/health` e de rotas de leitura simples, p95, com Postgres local | Menor ou igual à do backend Python na mesma máquina |
| NFR-003 | Segurança | Nenhum segredo em logs; mesmos limites de tamanho e extensão de upload; mesmos cookies e cabeçalhos | Paridade verificada por teste |
| NFR-004 | Compatibilidade | Node.js LTS vigente; PostgreSQL 16 | Fixados em `mise.toml` e nas imagens |
| NFR-005 | Manutenibilidade | Estrutura de `backend-node/` espelha `routes/`, `services/` e `providers/` do Python | Um arquivo Node por arquivo Python |
| NFR-006 | Operação | Imagem Docker do backend Node, com migration, worker e scheduler | Sobe por `docker compose up` sem passos manuais |

---

## Success Metrics

### Key Performance Indicators (KPIs)

#### Primary Metric (North Star)

**Metric:** Taxa de aprovação da suíte de contrato nas duas stacks
**Definition:** Casos de contrato aprovados dividido pelo total, por stack, em cada execução do CI na `main`
**Current Baseline:** Não existe suíte de contrato hoje
**Target:** 100% nas duas stacks no lançamento e em todas as execuções seguintes
**Why This Metric:** É a medida direta de que o frontend funciona com qualquer backend

#### Secondary Metrics

| Metric | Current | Target | Timeframe |
|--------|---------|--------|-----------|
| Diferença de schema Alembic vs Drizzle | Não medida | 0 linhas de diff | A cada PR |
| Cobertura de testes do backend Node | 0% (não existe) | 60% ou mais | No lançamento |
| Tempo de `docker compose up` até `/api/health` saudável com `BACKEND_STACK=node` | Não medido | Comparável ao da stack Python (mesma ordem de grandeza) | No lançamento |
| Rotas do Python cobertas pelo Node | 0 de 61 | 61 de 61 | No lançamento |
| Projetos criados com `select-stack` que sobem sem edição manual | Não medido | 100% nos testes do CI | No lançamento |

### Measurement Framework

**Framework Used:** Custom (a feature é de infraestrutura de template; AARRR e HEART não se aplicam)

**Adoção:**
- Issues e discussões do repositório que mencionam a stack Node (indicador qualitativo; sem telemetria no template)

**Qualidade:**
- Resultado do job `contract` por stack
- Resultado do job de diff de schema
- Cobertura do job `backend-node-tests`

### Analytics Implementation

**Eventos a acompanhar:** não se aplica, porque o launchkit não coleta telemetria. A medição é feita pelo CI e pelo repositório.

**Dashboards:**
- Página de execuções do GitHub Actions para os jobs `contract`, `schema-diff` e `backend-node-tests`

---

## Scope

### In Scope

**Phase 1 (MVP):**
- Suíte de contrato e `contracts/openapi.json` (Fase 0 do plano)
- Backend Node com as 61 rotas: auth (senha, 2FA, passkeys, OIDC), workspaces, admin, arquivos, info, timezones e settings
- Schema Drizzle e migration inicial equivalentes à `001`
- Interfaces `KeyValueStore`, `JobQueue` e `StorageProvider`, com versões em memória
- Seleção por `BACKEND_STACK`, Compose com profiles, Helm e `select-stack`
- CI com jobs para o backend Node, contrato (matriz) e diff de schema
- Worker e scheduler com os jobs de exemplo, e o CLI `create-user`
- Documentação no README e no guia de self-hosting

**Phase 2 (Post-MVP):**
- Guia e ferramental de migração Python para Node
- Geração de tipos do frontend a partir do OpenAPI
- Provider de armazenamento S3 nas duas stacks

### Out of Scope

**Explicitamente excluído:**
- Remoção ou depreciação do Python: as duas stacks são mantidas
- Mudanças de contrato da API: ficam para PRDs próprios, sempre começando no Python
- Execução simultânea das duas stacks sobre o mesmo banco: risco de corrupção de dados e de conflito de migrations
- Renomear `backend/` para `backends/python/`: mexe em CI, Compose, Helm e docs sem ganho funcional agora
- Telemetria de uso do template

### Future Considerations

- Compartilhar schemas Zod entre backend Node e frontend
- Outras stacks (por exemplo Go), usando a mesma suíte de contrato
- Renomear os diretórios das stacks para um layout simétrico

---

## Technical Considerations

### High-Level Architecture

`backend-node/` com Fastify 5 e TypeScript estrito, validação com Zod e `fastify-type-provider-zod`, OpenAPI com `@fastify/swagger`, ORM Drizzle e `drizzle-kit`. A organização interna é `routes/`, `services/`, `providers/`, `ports/`, `plugins/` e `jobs/`. A suíte de contrato fica em `contracts/` e recebe a URL da API por variável, o que permite rodá-la contra qualquer stack.

### Technology Stack

**Backend:**
- Node.js LTS vigente, TypeScript, Fastify 5
- Drizzle ORM e drizzle-kit; `ioredis`; BullMQ
- `jose` (JWT), `@node-rs/argon2` e `bcryptjs` (senhas), `otpauth` (TOTP), `@simplewebauthn/server` (passkeys), `openid-client` (OIDC), `@fastify/multipart` (uploads)
- Vitest, com PGlite em memória ou PostgreSQL real nos testes

**Infrastructure:**
- PostgreSQL 16 e Redis, como hoje
- Docker Compose com profiles, Helm chart com `backend.stack`

### API Requirements

Sem endpoints novos. O contrato é o do backend Python (61 rotas em `/api/*`: 52 em `backend/app/api/`, 8 do fastapi-users e `/api/health`), congelado em `contracts/openapi.json`.

### Security Requirements

- **Authentication:** JWT HS256 compatível entre as stacks; hash de senha com argon2 (e leitura de bcrypt); rehash no login quando aplicável
- **Authorization:** papéis de workspace (owner, editor, viewer, manager virtual) e superusuário, com as mesmas regras
- **Data Encryption:** TLS na borda, como hoje; segredos por variável de ambiente ou `CREDENTIALS_DIRECTORY`
- **Rate Limiting:** login 5 por minuto, cadastro e reset 3 por hora, por IP, com `TRUSTED_PROXY_HOPS`
- **Compliance:** sem requisito regulatório específico; a revisão de segurança cobre os fluxos de auth antes do lançamento

### Performance Requirements

- **Response Time:** paridade ou melhor que o Python na mesma máquina (medido com carga simples nas rotas de leitura)
- **Concurrency:** sem requisito além do que o Python atende hoje
- **Caching:** o timezone da aplicação é lido com cache curto (30 s), como no Python

### Scalability

Mesma topologia do Python: backend, worker e scheduler escalam de forma independente; o HPA do Helm continua válido para o backend.

### Data Considerations

**Data Model:** seis tabelas (`app_settings`, `users`, `user_passkeys`, `workspaces`, `workspace_members`, `files`), idênticas nas duas stacks.

**Data Migration:**
- Cada stack tem suas migrations; ambas chegam ao mesmo schema
- Migração de uma instalação existente: backup, troca de `BACKEND_STACK`, validação (Story 8)
- Rollback: restaurar o backup e voltar a `BACKEND_STACK=python`

**Privacy & Compliance:**
- PII (e-mail, segredos de TOTP, chaves públicas de passkeys) tratada como no Python
- Os logs não registram senhas, tokens ou segredos

---

## Design & UX Requirements

### User Experience Principles

Sem mudança visual. A experiência de quem usa o produto é idêntica nas duas stacks. A experiência relevante é a do desenvolvedor: escolher a stack deve exigir uma única variável ou um único comando.

### User Flows

**Primary Flow (operador):**
1. Copia `.env.example` para `.env`
2. Define `BACKEND_STACK=node`
3. Executa `docker compose up --build`
4. Abre `http://localhost:3000` e conclui o `/setup`

**Alternative Flows:**
- Criar um projeto novo: executa `scripts/select-stack.mjs --stack node` e segue o fluxo acima
- Erro de configuração: valor inválido de `BACKEND_STACK` falha com mensagem clara listando os valores aceitos

### Visual Design

Não se aplica. Nenhum componente de interface novo.

### Accessibility (a11y)

Não se aplica, porque a feature não altera a interface.

### Responsive Design

Não se aplica.

---

## Timeline & Milestones

**Target Launch Date:** Proposto para 2026-12-15 (a confirmar com a capacidade real)

### Phases

| Phase | Deliverables | Owner | Start Date | End Date |
|-------|-------------|-------|------------|----------|
| **Fase 0: Contrato** | `openapi.json`, suíte de contrato verde no Python | Mantenedor | 2026-10-19 | 2026-10-23 |
| **Fase 1: Esqueleto** | Config, schema Drizzle, erros, rotas básicas, Compose | Mantenedor | 2026-10-26 | 2026-10-30 |
| **Fase 2: Auth núcleo** | Hash, JWT, setup, login, registro, rate limit | Mantenedor | 2026-11-02 | 2026-11-06 |
| **Fase 3: Auth avançada** | TOTP, passkeys, OIDC | Mantenedor | 2026-11-09 | 2026-11-17 |
| **Fase 4: Workspaces** | Contexto, rotas, permissões | Mantenedor | 2026-11-18 | 2026-11-24 |
| **Fase 5: Admin e arquivos** | `/api/admin/*`, `/api/files` | Mantenedor | 2026-11-25 | 2026-11-30 |
| **Fase 6: Jobs e CLI** | Worker, scheduler, `create-user` | Mantenedor | 2026-12-01 | 2026-12-03 |
| **Fase 7: Operação e docs** | Helm, release, `select-stack`, CI, README | Mantenedor | 2026-12-04 | 2026-12-15 |

### Key Milestones

- **2026-10-23:** contrato congelado e suíte verde no Python
- **2026-11-17:** auth completa (senha, 2FA, passkeys, OIDC) com testes cruzados entre as stacks
- **2026-11-30:** paridade de todas as rotas
- **2026-12-15:** release com a stack Node documentada

As datas partem da estimativa de uma pessoa em tempo integral e são uma proposta de planejamento, não um compromisso.

---

## Risks & Mitigation

| Risk | Impact | Probability | Mitigation Strategy | Owner |
|------|--------|------------|---------------------|-------|
| Detalhes internos do fastapi-users (parâmetros do argon2, rehash, claims do JWT) | Alto | Média | Testes cruzados de token e hash na Fase 2, lendo o código das versões travadas no `uv.lock` | Mantenedor |
| Diferenças sutis no formato de erros e na validação (422) | Alto | Média | Error handler central e teste de contrato para cada erro que o frontend interpreta | Mantenedor |
| Custo de manter duas stacks (toda mudança de API é feita duas vezes) | Alto | Alta | Suíte de contrato obrigatória; fluxo "Python primeiro, Node em seguida"; `select-stack` deixa projetos derivados com uma stack só | Mantenedor |
| Divergência de schema entre Alembic e Drizzle | Alto | Média | Job de diff de schema no CI | Mantenedor |
| Testes unitários com PGlite ou SQLite escondendo diferenças do Postgres | Médio | Média | A suíte de contrato roda sempre contra PostgreSQL real | Mantenedor |
| WebAuthn com origin e RP ID dinâmicos | Médio | Média | Portar os casos de `test_passkeys.py` como testes unitários | Mantenedor |

### Contingency Plans

**If a compatibilidade de tokens entre as stacks não for alcançável na Fase 2:**
- Action plan: declarar tokens e hashes não intercambiáveis, exigir novo login e reset de senha na troca de stack, e documentar
- Decision maker: Mantenedor
- Trigger: testes cruzados reprovados após duas tentativas de correção

---

## Dependencies & Assumptions

### Dependencies

**Internal:**
- [ ] Suíte de contrato pronta e verde no Python (Fase 0), pré-requisito de todas as demais fases
- [ ] Mudanças em `.github/ci/changes.py` para reconhecer `backend-node/` e `contracts/`

**External:**
- [ ] Bibliotecas Node listadas em Technology Stack, com versões fixadas em lockfile

### Assumptions

- O Python continua sendo a referência do contrato durante todo o projeto
- Uma pessoa em tempo integral executa as fases em sequência
- O CI do GitHub Actions comporta um job adicional de contrato com PostgreSQL e Redis
- Quem usa o template aceita manter o Redis nas duas stacks (a versão em memória é para testes e desktop)

---

## Open Questions

- [ ] **Biblioteca de validação: Zod ou TypeBox?**
  - **Context:** Zod permite compartilhar schemas com o frontend (que já usa Zod 4); TypeBox é nativo do Fastify e mais rápido
  - **Options:** Zod (recomendado); TypeBox
  - **Owner:** Mantenedor
  - **Deadline:** Antes da Fase 1 (2026-10-26)

- [ ] **Renomear `backend/` para `backends/python/` agora ou depois?**
  - **Context:** layout simétrico versus risco de quebrar CI, Compose, Helm e docs
  - **Options:** manter (recomendado); renomear na Fase 7
  - **Owner:** Mantenedor
  - **Deadline:** Antes da Fase 7

- [ ] **Gerar os tipos do frontend a partir do OpenAPI entra neste escopo?**
  - **Context:** o OpenAPI congelado na Fase 0 torna a geração barata
  - **Options:** incluir como P2 (proposto); adiar
  - **Owner:** Mantenedor
  - **Deadline:** Fim da Fase 0

---

## Stakeholder Sign-Off

| Stakeholder | Role | Review Status | Approved | Date |
|------------|------|---------------|----------|------|
| Gabriel Auzier | Product / Mantenedor | ⏳ Pending | ☐ | - |
| A definir | Engineering review | ⏳ Pending | ☐ | - |
| A definir | Security review (auth) | ⏳ Pending | ☐ | - |

---

## Appendix

### References

- [Plano técnico da Feature 1](../plans/feature-1-node-fastify-backend.md)
- `backend/app/` (implementação de referência em Python)

### Related Documents

- [PRD da Feature 2: desktop com Electron](prd-feature-2-electron-desktop.md)

### Glossary

- **Stack:** conjunto linguagem, framework e ferramentas do backend (Python/FastAPI ou Node/Fastify)
- **Contrato:** comportamento HTTP observável da API (rotas, corpos, status, erros)
- **Suíte de contrato:** testes black-box que recebem a URL de uma API e verificam o contrato
- **Workspace:** a fronteira de tenant; todo dado de domínio pertence a um workspace

### Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-15 | Gabriel Auzier (com Claude) | Rascunho inicial |
