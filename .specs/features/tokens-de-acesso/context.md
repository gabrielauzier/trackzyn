# Tokens de acesso pessoal Context

**Gathered:** 2026-11-02
**Spec:** `.specs/features/tokens-de-acesso/spec.md`
**Status:** Spec aprovada; em Design

---

## Feature Boundary

Tokens de longa duração, com escopo e revogáveis, que permitem a automações e agentes de IA criar e gerenciar tarefas pela API REST e por um servidor MCP. Listas, foco, relatórios, workspaces e administração ficam fora do alcance dos tokens.

---

## Implementation Decisions

### O que o token pode fazer

- Permissões por escopos escolhidos na criação do token, não um acesso fixo.
- O acesso é negado por padrão: uma rota só aceita token se estiver declarada na tabela de escopos.

### Alcance e validade

- Cada token vale para um único workspace, fixado na criação.
- Validade obrigatória de 30, 90 ou 365 dias, com 90 como padrão. Não existe token sem expiração.

### Como a IA se conecta

- REST e MCP entram juntos na primeira entrega.
- O MCP autentica com o mesmo token, no cabeçalho `Authorization`. OAuth fica fora.

### Dados e retentativas

- `POST /api/tasks` aceita `Idempotency-Key` opcional, válido por 24h, por token.
- O token criador fica registrado na tarefa e o cartão mostra o selo `via <nome>`.

### Agent's Discretion

Nenhum ponto foi deixado para o agente decidir sozinho; os padrões abaixo foram aprovados com a spec.

### Declined / Undiscussed Gray Areas → Assumptions

Na seção Assumptions & Open Questions da spec, aprovadas pelo usuário em 2026-11-02: lista de escopos com `tasks:delete` separado, papel do dono, revogação sem exclusão, limpeza em 90 dias, senha e 2FA que não revogam tokens, geração sem reautenticação, limites (50 tokens, 60 req/min), lista arquivada, coluna padrão, reenvio após exclusão, conteúdo do reenvio, selo visível a todos, transporte MCP e clientes suportados.

---

## Specific References

- Fatos do código que moldam a spec:
  - `backend-node/src/plugins/auth.ts`: `requireUser` só aceita o JWT; o token precisa de um caminho próprio que não abra as demais rotas.
  - `backend-node/src/routes/lists.ts`: `GET /api/lists` devolve `preview` com títulos de tarefas, por isso SCOPE-09.
  - `backend-node/src/plugins/rate-limit.ts`: o limite atual conta por IP e rota; o do token conta por token.
  - `backend-node/src/services/tasks.ts`: `createTask` não recusa lista arquivada, por isso API-09.
  - `backend-node/src/local/token-guard.ts`: no modo local toda requisição exige o token de sessão, por isso TOKEN-13.
  - `focus_actions` (AD-002): referência para a tabela de idempotência.

---

## Deferred Ideas

- OAuth 2.1 para clientes MCP que só aceitam esse fluxo.
- Criar e editar listas por token.
- Aviso de token perto de expirar.
- Tela de administrador para tokens de outros usuários.
