# Tokens de acesso e MCP

Um token de acesso deixa uma automação ou um agente de IA usar o trackzyn sem a sua sessão de login. Cada token vale para um único workspace, tem os escopos que você escolheu, expira em 30, 90 ou 365 dias e pode ser revogado a qualquer momento.

Nos exemplos, troque `https://seu-servidor` pelo endereço do seu trackzyn, `tkz_SEU_TOKEN` pelo seu token e `ID_DA_LISTA` pelo id de uma lista.

## Gerar um token

1. Abra o menu da conta, na parte de baixo da barra lateral, e escolha **Tokens de acesso**.
2. Clique em **Gerar token** e informe o nome, o workspace, os escopos e a validade.
3. Copie o valor. Ele aparece uma única vez: o trackzyn guarda só o hash.

O nome do token fica visível aos membros do workspace: as tarefas criadas por ele mostram o selo `via <nome>`.

A mesma tela lista os seus tokens e revoga qualquer um deles. A revogação vale já na requisição seguinte. Para mudar escopos ou validade, gere outro token e revogue o antigo.

## Criar uma tarefa com `curl`

Encontre o id da lista (requer `lists:read`):

```bash
curl https://seu-servidor/api/lists \
  -H "Authorization: Bearer tkz_SEU_TOKEN"
```

Crie a tarefa (requer `tasks:create`):

```bash
curl -X POST https://seu-servidor/api/tasks \
  -H "Authorization: Bearer tkz_SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: pedido-1234" \
  -d '{
    "list_id": "ID_DA_LISTA",
    "title": "Revisar o contrato",
    "column": "today",
    "estimate_minutes": 45,
    "notes": "Criada pelo guia de tokens",
    "subtasks": ["Ler as cláusulas", "Enviar os comentários"]
  }'
```

A resposta é `201` com a tarefa. Só `list_id` e `title` são obrigatórios.

| Campo | Regra |
| ----- | ----- |
| `title` | Obrigatório, de 1 a 255 caracteres |
| `column` | `backlog` (padrão), `this_week`, `today` ou `done` |
| `estimate_minutes` | De 1 a 1440 |
| `notes` | Até 10 000 caracteres |
| `subtasks` | Até 50 títulos, de 1 a 255 caracteres, criados na ordem enviada |

Criar numa lista arquivada responde `409 List is archived`. A especificação completa, com o escopo de cada rota, está em `/api/openapi.json`.

## Escopos

Toda rota fora desta tabela responde `403 Route not available for tokens`. Isso inclui `/api/tokens`: um token nunca gera outro.

| Escopo | Rotas REST | Ferramentas MCP |
| ------ | ---------- | --------------- |
| `lists:read` | `GET /api/lists`, `GET /api/lists/:list_id` | `list_lists` |
| `tasks:read` | `GET /api/lists/:list_id/board`, `GET /api/tasks/:task_id` | `get_board`, `get_task` |
| `tasks:create` | `POST /api/tasks` | `create_task` |
| `tasks:write` | `PATCH /api/tasks/:task_id`, `POST /api/tasks/:task_id/move`, `POST /api/tasks/:task_id/move-to-list`, `POST /api/tasks/:task_id/duplicate`, `POST /api/tasks/:task_id/subtasks`, `PATCH /api/subtasks/:subtask_id`, `POST /api/subtasks/:subtask_id/move` | `update_task`, `move_task`, `add_subtask` |
| `tasks:delete` | `DELETE /api/tasks/:task_id`, `DELETE /api/subtasks/:subtask_id` | `delete_task` |

O token alcança só o workspace dele: não é preciso enviar `X-Workspace-Id`, e um valor diferente responde `403`. O papel atual do dono continua valendo: um `viewer` só pode ter escopos de leitura. Sem `tasks:read`, o campo `preview` de `GET /api/lists` vem vazio, porque traz títulos de tarefas.

Cada token pode fazer 60 requisições por minuto, somando REST e MCP. Passar disso responde `429` com `Retry-After: 60`.

## Evitar tarefas duplicadas

Envie o cabeçalho `Idempotency-Key` em `POST /api/tasks` para repetir uma requisição sem criar outra tarefa. A chave tem até 255 caracteres, vale por 24 horas e é separada por token.

| Situação | Resposta |
| -------- | -------- |
| Mesma chave e mesmo corpo | `201` com o estado atual da tarefa e `Idempotency-Replayed: true` |
| Mesma chave com outro corpo | `409 Idempotency key reused with a different payload` |
| A tarefa da chave foi excluída | `410 Task was deleted` |
| Chave vazia ou com mais de 255 caracteres | `422` |
| Mesma chave depois de 24 horas | Cria uma tarefa nova |

## Conectar um cliente MCP

O servidor MCP fica em `/api/mcp`, com transporte Streamable HTTP sem estado. A configuração abaixo usa o formato mais comum; o nome dos campos muda de um cliente para outro.

```json
{
  "mcpServers": {
    "trackzyn": {
      "type": "http",
      "url": "https://seu-servidor/api/mcp",
      "headers": {
        "Authorization": "Bearer tkz_SEU_TOKEN"
      }
    }
  }
}
```

**O cliente precisa enviar o cabeçalho `Authorization` com o token.** Sem ele, ou com o JWT da sessão de login, o servidor responde `401`.

**Clientes que só aceitam OAuth não conectam.** O trackzyn não oferece OAuth no MCP.

O cliente vê só as ferramentas dos escopos do token. `create_task` aceita os mesmos campos de `POST /api/tasks`, mais o parâmetro opcional `idempotency_key`, com as mesmas regras do cabeçalho `Idempotency-Key`. Um erro de ferramenta volta com `isError: true` e o mesmo texto da rota REST.

Uma requisição com `Origin` diferente de `FRONTEND_URL` responde `403`. Clientes fora do navegador não enviam esse cabeçalho.

## Erros de autenticação

| Resposta | Causa |
| -------- | ----- |
| `401 Unauthorized` | Token inexistente, malformado, expirado ou revogado, ou dono inativo |
| `403 Missing scope: <escopo>` | Falta esse escopo ao token |
| `403 Route not available for tokens` | A rota não aceita tokens |
| `403 Token is bound to another workspace` | `X-Workspace-Id` difere do workspace do token |
| `403 Read-only role` | O dono do token é `viewer` e a rota escreve |
| `404 Workspace not found` | O dono saiu do workspace, ou o workspace foi arquivado |

## Para quem administra o servidor

A variável `PERSONAL_TOKENS_ENABLED` liga a feature e vem ligada por padrão. Com `false`, `/api/tokens` e `/api/mcp` respondem `404` e o menu da conta não mostra **Tokens de acesso**. O modo local do desktop roda sempre assim.

Tokens revogados ou expirados são apagados 90 dias depois do fim. As tarefas continuam, sem o selo.
