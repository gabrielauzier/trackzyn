# Backend Node.js (Fastify) com paridade de contrato

> Build this with **tlc-implement** (`.claude/skills/tlc-implement`).
> Every criterion below becomes a check with a proof, referenced by its number. Nothing under
> `Unresolved` gets settled while building.

## Intent

O backend do launchkit só existe em Python (FastAPI). Quem quer usar o template em Node/TypeScript precisa portar `backend/` à mão, sem especificação do contrato e sem testes de referência, e perde as atualizações do template. A fonte não traz números de demanda.

Ao fim desta task existe `backend-node/` (Fastify 5, TypeScript) que serve as mesmas 61 rotas do Python com o mesmo contrato HTTP, sobre o mesmo schema de banco, e uma suíte de contrato (`contracts/`) que roda contra qualquer uma das duas stacks. O frontend não muda. Escolher a stack em Compose, Helm e release é a task 2; o desktop é das tasks 3 e 4.

44 critérios em 7 slices · 6 portas de mão única · 0 abertas, 0 bloqueiam

## Criteria

### Contrato congelado

1. Quando `python backend/scripts/export_openapi.py` roda, então `contracts/openapi.json` lista todas as operações HTTP que o Python serve (61 hoje: 52 em `backend/app/api/`, 8 do fastapi-users, `GET /api/health`).
2. Se `contracts/openapi.json` difere da exportação atual do Python, então o job `contract-drift` do CI falha.
3. Dado o backend Python sobre PostgreSQL, quando `contracts/tests` roda com `API_URL` apontando para ele, então 0 casos falham.
4. Dado o backend Node sobre PostgreSQL, quando a mesma suíte roda no mesmo commit, então 0 casos falham e 0 casos são pulados por stack.

### Entrar e cadastrar

5. Dado `users` vazio, quando `GET /api/setup/status`, então 200 `{"has_users": false}`; quando `POST /api/setup/create-admin` com `email` e `password`, então 200 `{"access_token", "token_type": "bearer"}`; quando `create-admin` roda de novo, então 403 `{"detail": "Setup already completed"}`.
6. Quando `POST /api/auth/login` (`application/x-www-form-urlencoded`, `username` e `password`) recebe credenciais válidas, então 200 `{"access_token", "token_type": "bearer"}`; com senha errada, então 400 `{"detail": "LOGIN_BAD_CREDENTIALS"}`.
7. Dado `LOCAL_AUTH_ENABLED=false` com OIDC completo, quando `POST /api/auth/login`, `POST /api/setup/create-admin` ou uma troca de senha em `PATCH /api/users/me` chega, então 403 `{"detail": "LOCAL_AUTH_DISABLED"}`.
8. Dado `LOCAL_AUTH_ENABLED=false` sem OIDC completo, quando o processo sobe, então ele encerra com código diferente de 0 e a mensagem `LOCAL_AUTH_ENABLED=false requires a complete OIDC configuration; missing: <lista>`.
9. Dado um usuário criado por uma stack com hash argon2 (e outro com hash bcrypt), quando ele entra na outra stack com a mesma senha, então 200 com token válido, nos dois sentidos e nos dois formatos de hash.
10. Dado um usuário com hash bcrypt, quando o login é bem-sucedido no Node, então o hash armazenado passa a começar com `$argon2`.
11. Dado um token emitido por uma stack com o mesmo `SECRET_KEY`, quando `GET /api/users/me` roda na outra, então 200, nos dois sentidos; com token expirado (`ACCESS_TOKEN_EXPIRE_MINUTES`), então 401.
12. Quando o 6º `POST /api/auth/login` do mesmo IP chega em 60 s, então 429 `{"detail": "Too many requests"}` com `Retry-After: 60`; quando o 4º `POST /api/auth/register` do mesmo IP chega em 3600 s, então 429 com `Retry-After: 3600`.
13. Dado `TRUSTED_PROXY_HOPS=1` e `X-Forwarded-For: a, b`, quando o rate limit calcula a chave, então usa `b`; com `TRUSTED_PROXY_HOPS=2` e um único valor no cabeçalho, então usa `unknown`.
14. Quando `POST /api/auth/register` chega com registro desligado, então 403 `{"detail": "Registration is currently disabled"}`; com registro ligado, então 201 e `GET /api/workspaces` do novo usuário lista 1 workspace pessoal.
15. Quando `POST /api/auth/forgot-password` chega com um e-mail, então 202 e nenhum e-mail ou token é emitido; quando `POST /api/auth/reset-password` chega com token inválido, então 400 `{"detail": "RESET_PASSWORD_BAD_TOKEN"}`.
16. Quando qualquer rota recebe corpo inválido, então 422 `{"detail": [{"loc": ["body", ...], "msg", "type"}]}`.

### 2FA, passkeys e OIDC

17. Dado 2FA ativo, quando o login é válido, então 200 `{"requires_2fa": true, "temp_token", "available_methods": ["totp"]}`; `"passkey"` entra em `available_methods` só quando o usuário tem 2FA ativo e ao menos 1 passkey.
18. Quando o login emite `temp_token`, então o Redis guarda `2fa_temp:<temp_token>` com JSON `{"user_id", "available_methods"}` e TTL de 300 s; um `temp_token` emitido por uma stack é aceito por `POST /api/auth/2fa/verify` da outra; um `temp_token` usado uma vez é recusado na segunda com 401 `{"detail": "Invalid or expired token"}`.
19. Quando `POST /api/auth/2fa/verify` recebe código errado, então 400 `{"detail": "Invalid 2FA code"}`; quando recebe o 6º pedido do mesmo IP em 60 s, então 429.
20. Quando `POST /api/auth/2fa/disable` recebe senha errada, então 400 `{"detail": "Invalid password"}`; sem 2FA configurado, então 400 `{"detail": "2FA is not set up"}`.
21. Dado uma passkey registrada por uma stack, quando o usuário autentica com ela na outra (nos dois sentidos), então a autenticação é aceita; os challenges ficam no Redis como `<prefixo>:<challenge_id>` no mesmo formato nas duas stacks.
22. Dado `WEBAUTHN_RP_ID` e `WEBAUTHN_ORIGIN` vazios, quando uma cerimônia chega, então RP ID e origin vêm da origem do request; dado `WEBAUTHN_RP_ID` fixo, quando chega uma origem fora dele, então a recusa tem o mesmo status e `detail.code` do Python.
23. Quando `GET /api/auth/oidc/login` roda com OIDC configurado, então 307 para o `authorization_endpoint` com `client_id`, `redirect_uri`, `response_type=code`, `scope`, `state`, `nonce`, `code_challenge` e `code_challenge_method=S256`, e o Redis guarda `oidc_state:<state>` com JSON `{"nonce", "code_verifier"}`.
24. Quando `GET /api/auth/oidc/callback` recebe `code` e `state` válidos, então 307 para `<FRONTEND_URL>/auth/oidc/callback#access_token=<jwt>&token_type=bearer`.
25. Quando a suíte de contrato roda, então ela contém um caso para cada caso de `backend/tests/test_oidc_auth.py` (auto-registro, vínculo `disabled|verified_email|email`, e-mail verificado, sincronização de papéis), `test_passkeys.py` e `test_two_factor.py`, e todos passam nas duas stacks.

### Workspaces

26. Quando `X-Workspace-Id` não é um UUID, então 400 `{"detail": "Invalid X-Workspace-Id"}`; quando é de um workspace inexistente, arquivado ou do qual o usuário não é membro nem gerente, então 404 `{"detail": "Workspace not found"}`; quando o cabeçalho falta, então vale o workspace padrão do usuário, e sem nenhum, 404 `{"detail": "No workspace available"}`.
27. Quando um viewer escreve, então 403 `{"detail": "Read-only role"}`; quando um editor chama rota exclusiva de owner, então 403 `{"detail": "Insufficient role"}`; um gerente (`managed_by_user_id`) tem direitos de owner sem linha em `workspace_members`.
28. Quando a suíte de contrato roda, então cada uma das 12 operações de `/api/workspaces` e `/api/users` (`lookup`, `directory`) tem ao menos 1 caso com status e corpo, incluindo `archive` e a remoção de membro.
29. Dado dois `POST /api/workspaces/{id}/members` simultâneos para o mesmo usuário, então `workspace_members` contém 1 linha para o par (restrição `uq_workspace_member`), um pedido responde 201 e o outro 409, nas duas stacks (o Python passa a capturar `IntegrityError` nessa corrida e a responder 409, no lugar do 500 de hoje).
30. Quando a suíte de contrato roda, então ela contém os casos de `backend/tests/test_write_permission_gate.py` para viewer, editor e owner, e todos passam nas duas stacks.

### Admin e arquivos

31. Quando um usuário sem `is_superuser` chama uma das 9 operações de `/api/admin/*` que exigem superusuário, então 403, e sem token, 401; `GET /api/admin/registration-status` e `GET /api/admin/default-colors` respondem 200 sem token; `GET /api/admin/number-format` e `GET /api/admin/date-format` respondem 200 a qualquer usuário ativo e 401 sem token.
32. Quando a suíte de contrato roda, então cada uma das 13 operações de `/api/admin/*` tem ao menos 1 caso com status e corpo.
33. Quando `POST /api/files` recebe arquivo acima de `STORAGE_MAX_FILE_SIZE_MB`, então 400 `{"detail": "File too large. Maximum size is <N> MB."}`; com extensão fora de `STORAGE_ALLOWED_EXTENSIONS`, então 400 `{"detail": "File type '.<ext>' is not allowed. Allowed: <lista>"}`; com arquivo válido, então 201 com o registro do arquivo.
34. Quando `GET /api/files/{id}/download` roda, então 200 com `Content-Type` do registro e `Content-Disposition: inline; filename*=UTF-8''<nome codificado>`; com id inexistente ou de outro workspace, então 404 `{"detail": "File not found"}`.

### Jobs e CLI

35. Dado o worker Node e Redis, quando o job `ping` roda, então o resultado é `"pong"`; o scheduler registra `report-user-count-hourly` com intervalo de 3600 s e, a cada execução, loga `There are <N> users`.
36. Quando `npm run cli -- create-user <email> <senha>` roda, então cria o usuário, o workspace pessoal e imprime `User created successfully: <email>`; com `create-admin`, `Admin created successfully: <email>` e `is_superuser` verdadeiro; com argumentos fora de `create-user|create-admin <email> <senha>`, imprime o uso e sai com código 1.

### Banco, portas, falhas de dependência, segredos e CI

37. Dado dois bancos PostgreSQL vazios, quando as migrations do Alembic rodam em um e as do Drizzle no outro, então `pg_dump --schema-only` dos dois é idêntico, ignorando `alembic_version` e `__drizzle_migrations`; a diferença faz o job `schema-diff` falhar.
38. Dado um banco criado pelo Alembic com `alembic_version` = `001`, quando o Node sobe, então ele não executa DDL e registra a migration inicial como aplicada; dado um banco vazio, então cria as 6 tabelas.
39. Quando `npm test` roda em `backend-node/` sem `REDIS_URL`, então os testes de integração passam usando `KeyValueStore` e `JobQueue` em memória.
40. Sempre, nenhuma linha de log do Node durante a suíte de contrato contém a senha, o `access_token`, o `temp_token` ou o `SECRET_KEY` usados nos casos.
41. Quando um PR altera só `backend-node/`, então `.github/ci/changes.py` marca `run_backend_node=true` e `run_backend`, `run_frontend`, `run_helm` como `false`; quando altera `contracts/`, marca `run_backend_node` e `run_backend` como `true`; um caminho desconhecido continua rodando tudo; `test_changes.py` cobre os três casos.
42. Se o Redis não responde, então `POST /api/auth/login` e as demais rotas com rate limit retornam 500, como o Python.
43. Quando a suíte de contrato roda, então cada operação sem critério próprio (`POST /api/auth/logout`, `GET /api/info`, `GET /api/timezones`, `GET /api/settings/files`, `GET /api/auth/oidc/config`, `GET` e `DELETE /api/users/{id}`, `GET /api/files`, `PATCH /api/files/{id}`, `DELETE /api/files/{id}`) tem ao menos 1 caso com status e corpo, e passa nas duas stacks.
44. Quando `PATCH /api/workspaces/{id}` ou `PATCH /api/admin/settings/timezone` recebe um fuso com caixa errada (`America/sao_paulo`), então 400 `{"detail": "Invalid IANA timezone"}` nas duas stacks; um alias aceito pelo Python (`US/Pacific`) responde 200 nas duas; e `GET /api/timezones` lista os mesmos nomes nas duas stacks.

## Out of scope

- Remover ou congelar o backend Python - as duas stacks seguem mantidas.
- Mudar o contrato da API - mudança de contrato começa no Python e é replicada no Node; a única exceção desta task é o 409 do critério 29 (correção de um 500).
- Rodar as duas stacks ao mesmo tempo sobre o mesmo banco - risco de corrupção e de conflito de migrations.
- Enviar e-mail de reset de senha - o Python também não envia (`on_after_forgot_password` não existe); o Node espelha.
- Gerar os tipos de `frontend/src/types` a partir do OpenAPI - história P2 do PRD.
- Provider de armazenamento S3 - vem depois, nas duas stacks.
- Renomear `backend/` para `backends/python/` - mexe em CI, Compose, Helm e docs sem ganho funcional.
- Escolha da stack em Compose, Helm, `install.sh` e release - task 2.

## Observable

| Surface | Decision | Landing |
| --- | --- | --- |
| API, todas as rotas | formato da resposta | 3, 4, 28, 32 |
| API, todas as rotas | formato e códigos de erro | 5, 6, 7, 14, 15, 16, 19, 20, 26, 27, 29, 33, 34, 43 |
| API, todas as rotas | quem pode chamar | 26, 27, 31 |
| API, todas as rotas | versionamento | n/a - a API não tem prefixo de versão; o contrato é `/api/*` |
| API, todas as rotas | limite de taxa | 12, 13, 19 |
| API `GET /api/auth/oidc/login` | limite de taxa | n/a - essa rota não tem limite hoje e isso não muda |
| comando `npm run cli -- create-user` | saída, flags e códigos de saída | 36 |
| tarefa agendada `report-user-count-hourly` | saída | 35 |
| webhook | qualquer decisão | n/a - nenhum webhook |

## Swept

- validation: 16, 33
- failure modes: 8, 16
- idempotency and retry: 5, 18
- authorization: 26, 27, 31
- concurrency and ordering: 29
- data lifecycle: 28 (arquivar e remover membro), 34
- external-dependency failure: 42
- state transitions: 17, 28
- observability: 40 (log padrão do Fastify em JSON, sem endpoint de métricas)

## Impact

| Front | What changes |
|---|---|
| domain | new term: `KeyValueStore` - leitura, escrita com TTL, remoção e operações de sorted set para o rate limit; lives in `backend-node/src/ports/` |
| domain | new term: `JobQueue` - enfileirar, agendar e consumir jobs; lives in `backend-node/src/ports/` |
| domain | new term: `StorageProvider` - mesma interface de `backend/app/providers/storage.py`; lives in `backend-node/src/ports/` |
| domain | new term: suíte de contrato - testes black-box que recebem `API_URL`; lives in `contracts/tests/` |
| domain | existing terms: nenhum muda de significado |
| domain | existing: `POST /api/workspaces/{id}/members` passa a responder 409 (antes 500) na corrida de convites; quem ramifica nisso hoje: nenhum chamador conhecido no frontend |
| stored data | nada a migrar; o Node precisa rodar sobre bancos criados pelo Alembic (critério 38) |
| stored data | Redis: as stacks passam a ler e escrever os mesmos formatos de `2fa_temp:*`, `oidc_state:*` e dos challenges de passkey; uma mudança num formato agora exige mudar as duas |
| CI | `.github/ci/changes.py` e `test_changes.py` ganham `run_backend_node`; novos jobs `backend-node-tests`, `contract` (matriz python/node), `contract-drift` e `schema-diff` |

## Decided

| Decision | Shape | Alternative rejected |
|---|---|---|
| Schema do Node = Alembic `001`, com baseline | 6 tabelas (`app_settings`, `users`, `user_passkeys`, `workspaces`, `workspace_members`, `files`) em Drizzle; se `alembic_version` existe com `version_num = '001'`, marca a migration inicial como aplicada sem DDL; senão roda as migrations | Prisma: depende de engine binário e não roda sobre PGlite (task 4). Node sem migrations próprias: um projeto só-Node ficaria dependente de Python. |
| Formatos compartilhados entre stacks | JWT HS256 com `SECRET_KEY`, `sub` = UUID do usuário, `aud` = `fastapi-users:auth`; senha gravada em argon2, lida em argon2 e bcrypt; Redis: `2fa_temp:<token>` `{"user_id","available_methods"}` TTL 300, `oidc_state:<state>` `{"nonce","code_verifier"}`, challenges `<prefixo>:<challenge_id>` | Formatos próprios do Node: impede trocar de stack com sessões e passkeys vivas, e a task 4 (OIDC) assume o payload único. |
| Portas para infraestrutura | `KeyValueStore`, `JobQueue`, `StorageProvider`, cada uma com implementação Redis/BullMQ (ou disco) e em memória; padrão que o Python não tem | Usar `ioredis` e BullMQ direto: BullMQ exige Redis e o backend não poderia rodar dentro do Electron (task 4). |
| Dependências do backend Node | Fastify 5, `fastify-type-provider-zod` + Zod 4, `@fastify/swagger`, `@fastify/multipart`, Drizzle ORM + drizzle-kit, `ioredis`, BullMQ, `@node-rs/argon2`, `bcryptjs`, `otpauth`, `@simplewebauthn/server`, `jose` com `fetch` para o cliente OIDC (no lugar de `openid-client`, decisão do usuário: espelha o `httpx` do Python), Vitest | TypeBox no lugar de Zod: sem reuso de schemas com o frontend, que já usa Zod 4. |
| Caminhos | `backend-node/`, `contracts/openapi.json`, `contracts/tests/` | Renomear `backend/` agora: quebra caminhos de CI, Compose, Helm, `install.sh` e `deploy/public`. |
| Formato de erro | `{"detail": <string>}`, `{"detail": {"code","message"}}` e 422 `{"detail": [{"loc","msg","type"}]}` | Formato nativo do Fastify (`statusCode`, `error`, `message`): `frontend/src/lib/api-errors.ts` lê `detail`. |

## Sources

- `docs/prds/prd-feature-1-node-fastify-backend.md` - histórias 1 a 5 e 7, requisitos FR-001 a FR-008 e FR-010
- `docs/plans/feature-1-node-fastify-backend.md` - fases, decisões D3 a D7
- `backend/app/` e `backend/tests/` - o contrato de referência (rotas, erros, formatos); `backend/uv.lock` fixa fastapi-users 15.0.5 e pwdlib com argon2 e bcrypt

This task is the record of decision. If a linked document diverges, ask before building.

## Unresolved

| # | Kind | Question | Until answered |
|---|---|---|---|
| | | None | |
