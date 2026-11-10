# Contagem de horas Context

**Gathered:** 2026-11-10
**Spec:** `.specs/features/contagem-de-horas/spec.md`
**Status:** Ready for design

---

## Feature Boundary

Uma configuração do workspace, `Horas totais` (padrão, como hoje) ou `Horas líquidas`, que muda como a Agenda, os Relatórios, a capacidade do Planejamento e o tempo gasto de cada tarefa somam trechos que se sobrepõem. Nada é gravado além da configuração; toda conta é feita na leitura.

---

## Implementation Decisions

### Telas que seguem a configuração

- Agenda (total do dia e duração de um bloco unido), Relatórios, capacidade do Planejamento e tempo gasto por tarefa (quadro, foco, widget, MCP, feito × estimado).
- Somas de estimativas sem horário ficam fora: não há sobreposição para descontar.

### Tempo por lista nos Relatórios

- Cada lista mostra o tempo inteiro; só o total geral é líquido.
- A tela avisa que o modo líquido está ligado e mostra também o total bruto.

### Intervalo sobreposto a tarefa

- O trecho conta só como tarefa: o tempo trabalhado não muda e o trecho sai do tempo de pausa. No plano, uma pausa coberta por um bloco de tarefa não reduz o livre.

### Onde aparece o total bruto

- Relatórios: aviso acima dos cards e `Bruto: X` no card `Tempo trabalhado`.
- Agenda: tooltip `Horas líquidas · bruto: X` no total do dia.
- Planejamento e tempo gasto da tarefa: só o número do modo escolhido.

### Agent's Discretion

- Valor padrão `gross`, quem altera (dono ou gestor), forma do controle (dois botões de opção) e posição na tela: seguem #22 e #23.
- Planejamento líquido: ordem de precedência tarefa (blocos) > agendadas > pausas para decidir em que conta cai um minuto sobreposto.
- Prazo da estimativa no foco usa o mesmo tempo gasto mostrado.

### Declined / Undiscussed Gray Areas → Assumptions

- Sessões de quem entram na união: as do usuário logado nos Relatórios e na Agenda; as de todos os membros no tempo gasto da tarefa (já é o recorte de hoje). Registrado nas Assumptions da spec.
- Texto do aviso de sobreposição da Agenda muda conforme o modo. Registrado nas Assumptions da spec.

---

## Specific References

- Configurações irmãs: `Esconder sessões curtas` (#22) e `Juntar sessões próximas` (#23), em `frontend/src/pages/workspace-settings.tsx`.

---

## Deferred Ideas

None - discussion stayed within feature scope.
