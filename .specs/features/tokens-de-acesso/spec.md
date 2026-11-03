# Tokens de acesso pessoal Specification

## Problem Statement

Hoje a API do trackzyn só aceita o JWT da sessão de login, que dura pouco e dá acesso a tudo o que o usuário pode fazer. Uma automação (n8n, script, CI) ou um agente de IA não tem como criar tarefas sem guardar a senha do usuário ou um JWT que logo expira. Esta feature entrega tokens de longa duração, com permissão mínima e revogáveis, usados na API REST e num servidor MCP.

## Goals

- [ ] Um usuário gera um token e cria sua primeira tarefa com um único `curl`, sem usar a sessão de login.
- [ ] Um cliente MCP configurado com a URL e o token cria uma tarefa pela ferramenta `create_task`.
- [ ] Um token alcança só um workspace e só as rotas dos seus escopos; qualquer outra rota responde 403.
- [ ] Revogar um token bloqueia a requisição seguinte com 401.

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| OAuth 2.1 no MCP e em aplicativos de terceiros | Decisão do usuário: autenticação por token no cabeçalho. Clientes MCP que só aceitam OAuth não conectam nesta entrega. |
| Criar, editar ou excluir listas por token | O pedido é sobre tarefas; a automação usa listas que já existem. |
| Foco, relatórios, arquivos, workspaces, usuários e admin por token | Fora do pedido; o acesso é negado por padrão. |
| Token com mais de um workspace ou sem expiração | Decisão do usuário. |
| Renovar, renomear ou alterar os escopos de um token | Para mudar, o usuário gera outro e revoga o antigo. |
| Aviso por e-mail ou na interface de token perto de expirar | Não foi pedido; a lista mostra a data de expiração. |
| Tela de administrador para ver ou revogar tokens de outros | Não foi pedido; desativar o usuário já bloqueia todos os tokens dele (AUTH-05). |
| Tokens no modo local do desktop | A API local só aceita o token de sessão do processo principal (`requireLocalToken`), e nada fora da máquina a alcança. |
| Webhooks e notificações de saída | Feature separada. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Permissões | Escopos escolhidos na criação do token | Decisão do usuário | y |
| Alcance | Um workspace, fixado na criação | Decisão do usuário | y |
| Validade | Obrigatória: 30, 90 ou 365 dias, com 90 como padrão | Decisão do usuário | y |
| Canais | REST e MCP, ambos na P1 | Decisão do usuário | y |
| Retentativas | Cabeçalho `Idempotency-Key` opcional, válido por 24h, por token | Decisão do usuário; segue a ideia de `focus_actions` (AD-002) | y |
| Origem da tarefa | O token criador fica registrado e o cartão mostra `via <nome>` | Decisão do usuário | y |
| Lista de escopos | `lists:read`, `tasks:read`, `tasks:create`, `tasks:write`, `tasks:delete`; o mapa de rotas está em "Escopos e rotas" | O usuário escolheu escopos por token. Excluir ganhou escopo próprio porque apaga o tempo registrado e não tem volta (AD-005). | y |
| Escopos marcados por padrão no diálogo | `lists:read` e `tasks:create` | É o mínimo para o caso pedido: achar a lista e criar a tarefa. | y |
| Papel do dono | A permissão efetiva é a interseção entre os escopos e o papel atual; um `viewer` só pode ter escopos de leitura | Mantém `requireWrite` valendo para o token. | y |
| Revogar | Marca `revoked_at` e mantém a linha; não existe exclusão manual | Depois de um vazamento, o selo mostra o que o token criou. | y |
| Limpeza | Tokens revogados ou expirados são apagados 90 dias depois do fim; o selo some e a tarefa fica | Evita crescimento sem limite e mantém a janela de auditoria. | y |
| Senha, 2FA e sessão | Trocar a senha, ativar 2FA ou encerrar a sessão não revoga tokens | Tokens existem para funcionar sem sessão; revogar é uma ação explícita. | y |
| Reautenticação para gerar token | Não pede senha nem 2FA de novo; basta a sessão ativa | Mantém o fluxo simples. Risco aceito: quem controla uma sessão aberta consegue gerar um token. | y |
| Limite de tokens | 50 ativos por usuário | Barra abuso; está muito acima do uso esperado. | y |
| Limite de requisições | 60 por minuto por token, somando REST e MCP | Protege contra agente em loop; o `rateLimit` atual conta por IP e rota, o que não serve aqui. | y |
| Lista arquivada | Criar por token responde 409 `List is archived`; a sessão de login segue como está | Uma automação não enxerga que a lista saiu da tela. | y |
| Coluna padrão | Em `POST /api/tasks`, `column` passa a ser opcional, com `backlog` como padrão | Uma automação ou IA raramente sabe a coluna; a mudança não quebra quem já envia o campo. | y |
| Reenvio após exclusão | Reenviar a chave de uma tarefa já excluída responde 410 `Task was deleted` | Uma retentativa não pode ressuscitar o que o usuário apagou. | y |
| Conteúdo do reenvio | Devolve o estado atual da tarefa, com o cabeçalho `Idempotency-Replayed: true` | Não precisa guardar cópia da resposta. | y |
| Selo visível para todos | Todos os membros do workspace veem o nome do token | O selo existe para mostrar a origem; o diálogo avisa que o nome fica visível. | y |
| Transporte MCP | Streamable HTTP sem estado em `POST /api/mcp` | É o transporte remoto do protocolo e não exige estado de conexão, como AD-003. A versão do protocolo e do SDK é conferida em Design. | y |
| Clientes MCP suportados | Clientes que enviam cabeçalho `Authorization` próprio | Não verifiquei a lista atual de clientes; quem só aceita OAuth fica de fora. Conferir na fase de Design. | y |

**Open questions:** none - all resolved or logged above.

---

## Escopos e rotas

Toda rota fora desta tabela responde 403 a um token (SCOPE-03).

| Escopo | Rotas REST | Ferramentas MCP |
| ------ | ---------- | --------------- |
| `lists:read` | `GET /api/lists`, `GET /api/lists/:list_id` | `list_lists` |
| `tasks:read` | `GET /api/lists/:list_id/board`, `GET /api/tasks/:task_id` | `get_board`, `get_task` |
| `tasks:create` | `POST /api/tasks` | `create_task` |
| `tasks:write` | `PATCH /api/tasks/:task_id`, `POST /api/tasks/:task_id/move`, `POST /api/tasks/:task_id/move-to-list`, `POST /api/tasks/:task_id/duplicate`, `POST /api/tasks/:task_id/subtasks`, `PATCH /api/subtasks/:subtask_id`, `POST /api/subtasks/:subtask_id/move` | `update_task`, `move_task`, `add_subtask` |
| `tasks:delete` | `DELETE /api/tasks/:task_id`, `DELETE /api/subtasks/:subtask_id` | `delete_task` |

---

## User Stories

### P1: Gerar um token ⭐ MVP

**User Story**: Como usuário, quero gerar um token com nome, workspace, escopos e validade para entregar a uma automação só o acesso de que ela precisa.

**Why P1**: Sem token não existe nenhum dos outros caminhos.

**Acceptance Criteria**:

1. WHEN o usuário abre `Tokens de acesso` no menu da conta THEN the trackzyn SHALL mostrar um diálogo com a lista de tokens dele e a ação `Gerar token`. (TOKEN-01)
2. WHEN o usuário abre `Gerar token` THEN the trackzyn SHALL mostrar o workspace atual selecionado, os escopos `lists:read` e `tasks:create` marcados e a validade de 90 dias. (TOKEN-02)
3. WHEN uma sessão de login envia `POST /api/tokens` com `name` de 1 a 100 caracteres, `workspace_id`, ao menos um escopo e `expires_in_days` igual a 30, 90 ou 365 THEN the trackzyn SHALL responder 201 com o id, o token completo e `expires_at`. (TOKEN-03)
4. The trackzyn SHALL gerar cada token no formato `tkz_` seguido de 43 caracteres base64url, vindos de 32 bytes aleatórios. (TOKEN-04)
5. The trackzyn SHALL guardar só o hash SHA-256 do token, de modo que o valor completo não possa ser lido do banco. (TOKEN-05)
6. WHEN o token é criado THEN the trackzyn SHALL mostrar o valor completo uma única vez, com um botão de copiar e o aviso `Copie agora; este token não será mostrado de novo`. (TOKEN-06)
7. IF `name`, `scopes` ou `expires_in_days` está fora do definido em TOKEN-03, ou um escopo é desconhecido, THEN the trackzyn SHALL responder 422 no formato de erro de validação que já existe. (TOKEN-07)
8. IF o usuário já tem um token ativo com o mesmo nome THEN the trackzyn SHALL responder 409 `Token name already in use`. (TOKEN-08)
9. IF o usuário já tem 50 tokens ativos THEN the trackzyn SHALL responder 409 `Token limit reached`. (TOKEN-09)
10. IF o usuário não pertence ao workspace informado THEN the trackzyn SHALL responder 404 `Workspace not found`. (TOKEN-10)
11. IF um `viewer` pede `tasks:create`, `tasks:write` ou `tasks:delete` THEN the trackzyn SHALL responder 403 `Read-only role`. (TOKEN-11)
12. The trackzyn SHALL mostrar todos os textos do diálogo em português e em inglês, conforme o idioma da interface. (TOKEN-12)
13. WHILE o backend roda no modo local do desktop the trackzyn SHALL responder 404 em `/api/tokens` e em `/api/mcp`. (TOKEN-13)
14. WHILE o backend roda no modo local do desktop the trackzyn SHALL esconder o item `Tokens de acesso` do menu da conta. (TOKEN-14)

**Independent Test**: Gerar um token pela interface, conferir que o valor aparece uma vez e consultar a tabela para ver só o hash.

---

### P1: Ver e revogar tokens ⭐ MVP

**User Story**: Como usuário, quero ver meus tokens e revogar qualquer um deles para cortar o acesso de uma automação ou de um token vazado.

**Why P1**: Um token de longa duração sem revogação seria um risco de segurança sem saída.

**Acceptance Criteria**:

1. WHEN uma sessão de login envia `GET /api/tokens` THEN the trackzyn SHALL devolver só os tokens do usuário, cada um com id, nome, workspace, escopos, `display_hint`, `created_at`, `expires_at`, `last_used_at`, `revoked_at` e `status`. (MANAGE-01)
2. The trackzyn SHALL formar `display_hint` como `tkz_…` seguido dos 4 últimos caracteres do token, e nunca devolver o valor completo depois da criação. (MANAGE-02)
3. The trackzyn SHALL calcular `status` como `revoked` se `revoked_at` estiver preenchido, senão `expired` se `expires_at` já passou, senão `active`. (MANAGE-03)
4. WHEN o usuário confirma a revogação no diálogo de confirmação que já existe THEN the trackzyn SHALL enviar `DELETE /api/tokens/:id`, responder 204 e mostrar o token como `revoked`. (MANAGE-04)
5. WHEN `DELETE /api/tokens/:id` chega para um token já revogado ou expirado THEN the trackzyn SHALL responder 204 sem alterar `revoked_at` já preenchido. (MANAGE-05)
6. IF o token pertence a outro usuário THEN the trackzyn SHALL responder 404 a `DELETE /api/tokens/:id`. (MANAGE-06)
7. WHEN um token usado com sucesso tem `last_used_at` nulo ou com mais de 60 s THEN the trackzyn SHALL gravar a hora atual em `last_used_at`. (MANAGE-07)
8. WHEN se passam 90 dias de `revoked_at` ou de `expires_at` THEN the trackzyn SHALL apagar o token na próxima escrita de tokens do usuário dono, mantendo as tarefas criadas por ele. (MANAGE-08)

**Independent Test**: Gerar dois tokens, revogar um, conferir os estados na lista e que o outro continua funcionando.

---

### P1: Autenticar e limitar pelo token ⭐ MVP

**User Story**: Como dono de uma automação, quero que o token alcance só o workspace e as rotas que escolhi para que um vazamento cause o menor dano possível.

**Why P1**: É o que separa um token de um JWT sem prazo; REST e MCP dependem disso.

**Acceptance Criteria**:

1. WHEN uma requisição envia `Authorization: Bearer tkz_...` com um token ativo de um usuário ativo THEN the trackzyn SHALL autenticá-la como o dono do token. (AUTH-01)
2. IF o token não existe THEN the trackzyn SHALL responder 401 `Unauthorized`. (AUTH-02)
3. IF o token está expirado THEN the trackzyn SHALL responder 401 `Unauthorized`. (AUTH-03)
4. WHEN um token é revogado THEN the trackzyn SHALL responder 401 `Unauthorized` à primeira requisição seguinte com ele, sem cache ou atraso. (AUTH-04)
5. IF o dono do token está inativo THEN the trackzyn SHALL responder 401 `Unauthorized`. (AUTH-05)
6. WHEN o usuário é excluído THEN the trackzyn SHALL apagar os tokens dele em cascata. (AUTH-06)
7. WHEN o workspace é excluído THEN the trackzyn SHALL apagar os tokens dele em cascata. (AUTH-07)
8. WHEN uma requisição com token não envia `X-Workspace-Id` THEN the trackzyn SHALL usar o workspace do token. (SCOPE-01)
9. IF `X-Workspace-Id` difere do workspace do token THEN the trackzyn SHALL responder 403 `Token is bound to another workspace`. (SCOPE-02)
10. IF um token chama uma rota fora da tabela "Escopos e rotas" THEN the trackzyn SHALL responder 403 `Route not available for tokens`. (SCOPE-03)
11. The trackzyn SHALL negar a tokens qualquer rota nova que não tenha sido declarada na tabela de escopos. (SCOPE-04)
12. IF um token chama uma rota da tabela sem o escopo correspondente THEN the trackzyn SHALL responder 403 `Missing scope: <escopo>`. (SCOPE-05)
13. IF um token chama `/api/tokens` THEN the trackzyn SHALL responder 403 `Route not available for tokens`, para um token nunca gerar outro. (SCOPE-06)
14. WHILE o dono é `viewer` no workspace do token the trackzyn SHALL responder 403 `Read-only role` às rotas dos escopos `tasks:create`, `tasks:write` e `tasks:delete`. (SCOPE-07)
15. IF o dono deixou de ser membro do workspace do token ou o workspace foi arquivado THEN the trackzyn SHALL responder 404 `Workspace not found`. (SCOPE-08)
16. WHILE o token não tem `tasks:read` the trackzyn SHALL devolver `preview` vazio em `GET /api/lists`, porque esse campo traz títulos de tarefas. (SCOPE-09)
17. WHEN um token faz a 61ª requisição dentro de 60 s THEN the trackzyn SHALL responder 429 `Too many requests` com `Retry-After: 60`, contando REST e MCP juntos. (RATE-01)
18. The trackzyn SHALL manter para o JWT de sessão o comportamento atual de autenticação, escopo de workspace e limites de requisição. (SCOPE-10)
19. The trackzyn SHALL registrar `token_id` e `user_id` em cada requisição autenticada por token e nunca registrar o valor do token. (OBS-01)

**Independent Test**: Com um token só com `tasks:create`, conferir 201 em `POST /api/tasks`, 403 em `DELETE /api/tasks/:id` e 403 em `GET /api/users/me`.

---

### P1: Criar tarefas pela API REST ⭐ MVP

**User Story**: Como automação, quero criar uma tarefa completa numa só requisição, sem risco de duplicar numa retentativa.

**Why P1**: É o caso de uso pedido.

**Acceptance Criteria**:

1. WHEN um token com `tasks:create` envia `POST /api/tasks` com `list_id` e `title` THEN the trackzyn SHALL responder 201 com a tarefa no fim da coluna `backlog`. (API-01)
2. WHEN o corpo traz `column` THEN the trackzyn SHALL criar a tarefa no fim dessa coluna. (API-02)
3. WHEN o corpo traz `estimate_minutes` de 1 a 1440 THEN the trackzyn SHALL gravar a estimativa. (API-03)
4. WHEN o corpo traz `notes` de até 10 000 caracteres THEN the trackzyn SHALL gravar as anotações. (API-04)
5. WHEN o corpo traz `subtasks` com até 50 títulos de 1 a 255 caracteres THEN the trackzyn SHALL criar as subtarefas na ordem enviada. (API-05)
6. IF um campo está fora desses limites THEN the trackzyn SHALL responder 422 sem criar nada. (API-06)
7. IF a gravação de qualquer subtarefa falha THEN the trackzyn SHALL desfazer a criação da tarefa e das demais subtarefas. (API-07)
8. IF `list_id` é de outro workspace ou não existe THEN the trackzyn SHALL responder 404. (API-08)
9. IF um token cria uma tarefa numa lista arquivada THEN the trackzyn SHALL responder 409 `List is archived`. (API-09)
10. WHEN um token cria uma tarefa na coluna `done` THEN the trackzyn SHALL contar a conclusão para o dono do token, como em AD-006. (API-10)
11. WHEN duas requisições com o mesmo token e o mesmo `Idempotency-Key` chegam em até 24h THEN the trackzyn SHALL criar uma única tarefa e devolver a mesma tarefa às duas, inclusive se chegarem ao mesmo tempo. (IDEM-01)
12. WHEN uma requisição é atendida por uma chave já usada THEN the trackzyn SHALL responder 201 com o estado atual da tarefa e o cabeçalho `Idempotency-Replayed: true`. (IDEM-02)
13. IF a mesma chave chega com um corpo diferente THEN the trackzyn SHALL responder 409 `Idempotency key reused with a different payload`. (IDEM-03)
14. IF a tarefa da chave foi excluída THEN the trackzyn SHALL responder 410 `Task was deleted`. (IDEM-04)
15. IF `Idempotency-Key` tem mais de 255 caracteres ou está vazio THEN the trackzyn SHALL responder 422. (IDEM-05)
16. WHEN uma chave é reenviada depois de 24h THEN the trackzyn SHALL criar uma tarefa nova. (IDEM-06)
17. WHEN dois tokens usam a mesma chave THEN the trackzyn SHALL criar uma tarefa para cada um. (IDEM-07)
18. WHEN o JWT de sessão envia `Idempotency-Key` THEN the trackzyn SHALL ignorar o cabeçalho. (IDEM-08)
19. The trackzyn SHALL descrever em `/api/openapi.json` o esquema de autenticação por token e o escopo exigido em cada rota da tabela. (API-11)

**Independent Test**: `curl` com um token cria uma tarefa com notas e 2 subtarefas; o reenvio com a mesma chave devolve o mesmo id e o quadro mostra uma tarefa só.

---

### P1: Conectar uma IA por MCP ⭐ MVP

**User Story**: Como usuário de um cliente de IA compatível com MCP, quero conectar o trackzyn com uma URL e um token para o agente criar e consultar tarefas por conta própria.

**Why P1**: Decisão do usuário: o MCP faz parte da primeira entrega.

**Acceptance Criteria**:

1. WHEN um cliente MCP envia `initialize` em `POST /api/mcp` com um token ativo THEN the trackzyn SHALL responder com o nome e a versão do servidor e com a capacidade `tools`. (MCP-01)
2. WHEN o cliente chama `tools/list` THEN the trackzyn SHALL devolver só as ferramentas dos escopos do token, conforme "Escopos e rotas". (MCP-02)
3. The trackzyn SHALL descrever na ferramenta `create_task` os mesmos campos e limites de `POST /api/tasks`, mais o parâmetro opcional `idempotency_key`. (MCP-03)
4. WHEN `create_task` é chamada com argumentos válidos THEN the trackzyn SHALL criar a tarefa pela mesma regra de API-01 a API-10 e devolver o id e o título. (MCP-04)
5. WHEN `create_task` recebe `idempotency_key` THEN the trackzyn SHALL aplicar as mesmas regras de IDEM-01 a IDEM-07. (MCP-05)
6. IF uma ferramenta falha por validação, escopo, papel ou recurso inexistente THEN the trackzyn SHALL devolver `isError: true` com o mesmo texto de erro da rota REST equivalente. (MCP-06)
7. IF a requisição MCP vem sem token válido THEN the trackzyn SHALL responder HTTP 401 com `WWW-Authenticate: Bearer`. (MCP-07)
8. IF `POST /api/mcp` recebe o JWT de sessão THEN the trackzyn SHALL responder HTTP 401. (MCP-08)
9. IF a requisição traz um cabeçalho `Origin` diferente de `FRONTEND_URL` THEN the trackzyn SHALL responder HTTP 403, para barrar DNS rebinding. (MCP-09)
10. WHEN um cliente envia `GET /api/mcp` THEN the trackzyn SHALL responder HTTP 405, pois o servidor não abre fluxo de eventos. (MCP-10)
11. The trackzyn SHALL atender cada requisição MCP sem guardar estado de sessão entre elas. (MCP-11)
12. WHEN o token mostrado na criação é exibido THEN the trackzyn SHALL mostrar junto a URL de `/api/mcp` e um exemplo de configuração com o cabeçalho `Authorization`. (MCP-12)

**Independent Test**: Configurar um cliente MCP com a URL e um token com `lists:read` e `tasks:create`, pedir uma tarefa em linguagem natural e ver a tarefa no quadro; `delete_task` não aparece em `tools/list`.

---

### P1: Ver a origem da tarefa ⭐ MVP

**User Story**: Como membro do workspace, quero ver quais tarefas vieram de uma automação ou IA para distinguir o que eu mesmo criei.

**Why P1**: Decisão do usuário; sem isso, um agente com defeito enche o quadro sem deixar sinal.

**Acceptance Criteria**:

1. WHEN uma tarefa é criada por `POST /api/tasks` ou `create_task` com token THEN the trackzyn SHALL registrar o token criador na tarefa. (ORIGIN-01)
2. The trackzyn SHALL devolver `created_via` com o nome do token, ou `null`, nas respostas de tarefa e do quadro. (ORIGIN-02)
3. WHILE `created_via` não é nulo the trackzyn SHALL mostrar no cartão e no diálogo da tarefa o selo `via <nome>`, em todos os papéis. (ORIGIN-03)
4. WHEN o token é revogado ou expira THEN the trackzyn SHALL manter o selo. (ORIGIN-04)
5. WHEN o token é apagado pela limpeza de MANAGE-08 THEN the trackzyn SHALL manter a tarefa e devolver `created_via` nulo. (ORIGIN-05)
6. WHEN uma tarefa é duplicada ou editada THEN the trackzyn SHALL manter `created_via` da original e deixar nulo na cópia. (ORIGIN-06)
7. The trackzyn SHALL avisar no diálogo de `Gerar token` que o nome do token fica visível aos membros do workspace nas tarefas criadas por ele. (ORIGIN-07)

**Independent Test**: Criar uma tarefa por token e outra pela interface; só a primeira mostra `via <nome>`; depois de revogar o token, o selo continua.

---

## Edge Cases

- IF o cabeçalho `Authorization` traz um token malformado com o prefixo `tkz_` THEN the trackzyn SHALL responder 401 `Unauthorized`. (AUTH-08)
- IF um JWT de sessão é enviado às rotas de `/api/tokens` depois de expirar THEN the trackzyn SHALL responder 401 `Unauthorized`, como nas demais rotas. (AUTH-09)
- WHEN `expires_at` é igual ao instante da requisição THEN the trackzyn SHALL tratar o token como expirado. (AUTH-10)
- WHEN duas criações simultâneas levariam o usuário a mais de 50 tokens ativos THEN the trackzyn SHALL aceitar só as que couberem no limite e responder 409 `Token limit reached` às demais. (TOKEN-15)
- WHEN duas criações simultâneas usam o mesmo nome THEN the trackzyn SHALL aceitar uma e responder 409 `Token name already in use` à outra. (TOKEN-16)
- IF o token foi rebaixado de papel entre duas requisições THEN the trackzyn SHALL aplicar o papel atual já na requisição seguinte, sem cache. (SCOPE-11)

---

## Implicit-requirement sweep

| Dimensão | Cobertura |
| -------- | --------- |
| Validação e limites | TOKEN-07, API-06, IDEM-05 |
| Falhas e falha parcial | API-07, MCP-06 |
| Idempotência e retentativa | IDEM-01 a IDEM-08, MANAGE-05 |
| Autorização e limite de requisições | AUTH-01 a AUTH-10, SCOPE-01 a SCOPE-11, RATE-01 |
| Concorrência e ordem | IDEM-01, TOKEN-15, TOKEN-16; a posição da tarefa usa o `lockList` que já existe |
| Ciclo de vida e expiração | MANAGE-03, MANAGE-08, AUTH-06, AUTH-07, IDEM-06 |
| Observabilidade | OBS-01, MANAGE-07; o projeto não tem camada de métricas, então métricas são N/A |
| Dependência externa | N/A: nenhum serviço novo. O limite de requisições usa o `KeyValueStore` atual, com o mesmo comportamento se ele falhar. |
| Transições de estado | MANAGE-03 a MANAGE-05: `active` → `revoked` ou `expired`; `revoked` nunca volta |

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| TOKEN-01 | P1: Gerar um token | Tasks | In Tasks |
| TOKEN-02 | P1: Gerar um token | Tasks | Implementing |
| TOKEN-03 | P1: Gerar um token | Tasks | Implementing |
| TOKEN-04 | P1: Gerar um token | Tasks | Implementing |
| TOKEN-05 | P1: Gerar um token | Tasks | Implementing |
| TOKEN-06 | P1: Gerar um token | Tasks | Implementing |
| TOKEN-07 | P1: Gerar um token | Tasks | Implementing |
| TOKEN-08 | P1: Gerar um token | Tasks | Implementing |
| TOKEN-09 | P1: Gerar um token | Tasks | Implementing |
| TOKEN-10 | P1: Gerar um token | Tasks | Implementing |
| TOKEN-11 | P1: Gerar um token | Tasks | Implementing |
| TOKEN-12 | P1: Gerar um token | Tasks | Implementing |
| TOKEN-13 | P1: Gerar um token | Tasks | Implementing |
| TOKEN-14 | P1: Gerar um token | Tasks | In Tasks |
| TOKEN-15 | Edge Cases | Tasks | Implementing |
| TOKEN-16 | Edge Cases | Tasks | Implementing |
| MANAGE-01 | P1: Ver e revogar tokens | Tasks | Implementing |
| MANAGE-02 | P1: Ver e revogar tokens | Tasks | Implementing |
| MANAGE-03 | P1: Ver e revogar tokens | Tasks | Implementing |
| MANAGE-04 | P1: Ver e revogar tokens | Tasks | Implementing |
| MANAGE-05 | P1: Ver e revogar tokens | Tasks | Implementing |
| MANAGE-06 | P1: Ver e revogar tokens | Tasks | Implementing |
| MANAGE-07 | P1: Ver e revogar tokens | Tasks | Implementing |
| MANAGE-08 | P1: Ver e revogar tokens | Tasks | Implementing |
| AUTH-01 | P1: Autenticar e limitar pelo token | Tasks | Implementing |
| AUTH-02 | P1: Autenticar e limitar pelo token | Tasks | Implementing |
| AUTH-03 | P1: Autenticar e limitar pelo token | Tasks | Implementing |
| AUTH-04 | P1: Autenticar e limitar pelo token | Tasks | Implementing |
| AUTH-05 | P1: Autenticar e limitar pelo token | Tasks | Implementing |
| AUTH-06 | P1: Autenticar e limitar pelo token | Tasks | Implementing |
| AUTH-07 | P1: Autenticar e limitar pelo token | Tasks | Implementing |
| AUTH-08 | Edge Cases | Tasks | Implementing |
| AUTH-09 | Edge Cases | Tasks | Implementing |
| AUTH-10 | Edge Cases | Tasks | Implementing |
| SCOPE-01 | P1: Autenticar e limitar pelo token | Tasks | Implementing |
| SCOPE-02 | P1: Autenticar e limitar pelo token | Tasks | Implementing |
| SCOPE-03 | P1: Autenticar e limitar pelo token | Tasks | Implementing |
| SCOPE-04 | P1: Autenticar e limitar pelo token | Tasks | Implementing |
| SCOPE-05 | P1: Autenticar e limitar pelo token | Tasks | Implementing |
| SCOPE-06 | P1: Autenticar e limitar pelo token | Tasks | Implementing |
| SCOPE-07 | P1: Autenticar e limitar pelo token | Tasks | Implementing |
| SCOPE-08 | P1: Autenticar e limitar pelo token | Tasks | Implementing |
| SCOPE-09 | P1: Autenticar e limitar pelo token | Tasks | Implementing |
| SCOPE-10 | P1: Autenticar e limitar pelo token | Tasks | Implementing |
| SCOPE-11 | Edge Cases | Tasks | Implementing |
| RATE-01 | P1: Autenticar e limitar pelo token | Tasks | Implementing |
| OBS-01 | P1: Autenticar e limitar pelo token | Tasks | Implementing |
| API-01 | P1: Criar tarefas pela API REST | Tasks | Implementing |
| API-02 | P1: Criar tarefas pela API REST | Tasks | Implementing |
| API-03 | P1: Criar tarefas pela API REST | Tasks | Implementing |
| API-04 | P1: Criar tarefas pela API REST | Tasks | Implementing |
| API-05 | P1: Criar tarefas pela API REST | Tasks | Implementing |
| API-06 | P1: Criar tarefas pela API REST | Tasks | Implementing |
| API-07 | P1: Criar tarefas pela API REST | Tasks | Implementing |
| API-08 | P1: Criar tarefas pela API REST | Tasks | Implementing |
| API-09 | P1: Criar tarefas pela API REST | Tasks | Implementing |
| API-10 | P1: Criar tarefas pela API REST | Tasks | Implementing |
| API-11 | P1: Criar tarefas pela API REST | Tasks | Implementing |
| IDEM-01 | P1: Criar tarefas pela API REST | Tasks | Implementing |
| IDEM-02 | P1: Criar tarefas pela API REST | Tasks | Implementing |
| IDEM-03 | P1: Criar tarefas pela API REST | Tasks | Implementing |
| IDEM-04 | P1: Criar tarefas pela API REST | Tasks | Implementing |
| IDEM-05 | P1: Criar tarefas pela API REST | Tasks | Implementing |
| IDEM-06 | P1: Criar tarefas pela API REST | Tasks | Implementing |
| IDEM-07 | P1: Criar tarefas pela API REST | Tasks | Implementing |
| IDEM-08 | P1: Criar tarefas pela API REST | Tasks | Implementing |
| MCP-01 | P1: Conectar uma IA por MCP | Tasks | Implementing |
| MCP-02 | P1: Conectar uma IA por MCP | Tasks | Implementing |
| MCP-03 | P1: Conectar uma IA por MCP | Tasks | Implementing |
| MCP-04 | P1: Conectar uma IA por MCP | Tasks | Implementing |
| MCP-05 | P1: Conectar uma IA por MCP | Tasks | Implementing |
| MCP-06 | P1: Conectar uma IA por MCP | Tasks | Implementing |
| MCP-07 | P1: Conectar uma IA por MCP | Tasks | Implementing |
| MCP-08 | P1: Conectar uma IA por MCP | Tasks | Implementing |
| MCP-09 | P1: Conectar uma IA por MCP | Tasks | Implementing |
| MCP-10 | P1: Conectar uma IA por MCP | Tasks | Implementing |
| MCP-11 | P1: Conectar uma IA por MCP | Tasks | Implementing |
| MCP-12 | P1: Conectar uma IA por MCP | Tasks | Implementing |
| ORIGIN-01 | P1: Ver a origem da tarefa | Tasks | Implementing |
| ORIGIN-02 | P1: Ver a origem da tarefa | Tasks | Implementing |
| ORIGIN-03 | P1: Ver a origem da tarefa | Tasks | In Tasks |
| ORIGIN-04 | P1: Ver a origem da tarefa | Tasks | Implementing |
| ORIGIN-05 | P1: Ver a origem da tarefa | Tasks | Implementing |
| ORIGIN-06 | P1: Ver a origem da tarefa | Tasks | Implementing |
| ORIGIN-07 | P1: Ver a origem da tarefa | Tasks | Implementing |

**Coverage:** 85 total, 85 mapped to tasks, 0 unmapped

---

## Success Criteria

- [ ] Do diálogo `Gerar token` até a primeira tarefa criada por `curl`, o usuário gasta menos de 2 minutos seguindo só o que a tela mostra.
- [ ] Um cliente MCP cria uma tarefa a partir de um pedido em linguagem natural e o quadro a mostra com `via <nome>`.
- [ ] Um teste percorre todas as rotas registradas da API e confirma 403 com token em toda rota fora da tabela de escopos.
- [ ] 10 reenvios simultâneos com a mesma `Idempotency-Key` resultam em exatamente uma tarefa.
