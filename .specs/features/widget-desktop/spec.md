# Widget de foco no desktop Specification

## Problem Statement

Na tela de foco, o cronômetro só aparece enquanto a janela do trackzyn está à frente. Quem trabalha em outro app (editor, navegador, planilha) perde de vista a tarefa e o tempo que falta, e precisa trocar de janela para pausar, concluir ou tirar um intervalo. A fonte pede um widget sempre visível, com só a atividade e o cronômetro decrescente, e os controles quando o mouse passa por cima. Essa tela não está nos prints.

## Goals

- [ ] Com o foco ligado no desktop, o usuário vê a tarefa e o cronômetro sobre qualquer outra janela, sem trocar de app.
- [ ] Todas as ações de foco (intervalo, anotações, pausar, pular, concluir, estender) funcionam pelo widget, sem abrir a janela principal.

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Widget no navegador (Document Picture-in-Picture) | Decisão do usuário: no navegador, o foco é uma tela comum. |
| Atalho global, fora do app | Decisão do usuário: o atalho funciona só com o trackzyn em foco, para não tomar a combinação de outros apps. |
| Abrir o widget sem tarefa em foco | Decisão do usuário. |
| Regras do cronômetro, dos intervalos e dos sons | Feature `foco-e-sons`; o widget usa as mesmas regras. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Plataforma | Só o app desktop (Electron); janela sem moldura, sempre acima das outras e que pode ser arrastada | Decisão do usuário | y |
| Conteúdo sem o mouse | Só o título da tarefa atual e o cronômetro | Pedido da fonte | y |
| Controles com o mouse | `Intervalo`, `Anotações`, `Pausar`/`Retomar`, `Pular`, `Concluir` e `Expandir` | Pedido da fonte | y |
| Como o widget abre | `Focar agora` no desktop; o ícone de recolher da tela de foco; minimizar a janela principal com tarefa em foco; o atalho `Ctrl+Shift+F` (Windows/Linux) ou `⌘+Shift+F` (macOS) | Decisão do usuário | y |
| Atalho | Funciona só com uma janela do trackzyn ativa; no widget, o mesmo atalho fecha o widget como `Expandir` | Decisão do usuário (sem conflito com outros apps) | y |
| Janela principal ao abrir o widget | Minimizada | Decisão do usuário | y |
| Janela principal restaurada pela barra de tarefas/Dock | O widget fecha, como `Expandir` | Decisão do usuário | y |
| Minimizar sem tarefa em foco | Não abre o widget | Decisão do usuário | y |
| Anotações | O widget cresce e mostra um campo com as anotações da tarefa atual; o texto é salvo quando o campo perde o foco | Decisão do usuário | y |
| Última tarefa de Hoje concluída pelo widget | O widget continua aberto com `Tudo limpo` e `Expandir` | Decisão do usuário | y |
| Posição inicial | Canto superior direito da tela onde está a janela principal, com margem da borda | Decisão do usuário | y |
| Lembrar a posição | Sim, inclusive depois de reiniciar o app; se a tela não existe mais, volta à posição inicial | Decisão do usuário | y |
| Sons com as duas janelas | Cada som toca uma vez só, na janela visível (o widget quando ele está aberto) | Regra de `foco-e-sons` aplicada a duas janelas; sem ela o som tocaria duas vezes | y |
| Estender e Concluir no widget em `00:00:00` | Aparecem só com o mouse sobre o widget, como os outros controles | Decisão do usuário | y |
| Atalho com o widget ativo | Faz o mesmo que `Expandir` | Decisão do usuário | y |
| Sincronia entre as janelas | Uma ação numa janela aparece na outra em até 1 s, sem recarregar | Fato de projeto: as duas janelas mostram o mesmo foco | y |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Widget sempre visível ⭐ MVP

**User Story**: Como usuário do app desktop, quero um widget pequeno sempre visível com a tarefa e o cronômetro, para acompanhar o foco enquanto trabalho em outros apps.

**Why P1**: É o pedido central da fonte e a tela nova que não está nos prints.

**Acceptance Criteria**:

1. WHEN o usuário clica `Focar agora` no desktop THEN the trackzyn SHALL abrir o widget e minimizar a janela principal. (WIDGET-01)
2. WHEN o usuário clica no ícone de recolher da tela de foco THEN the trackzyn SHALL abrir o widget e minimizar a janela principal. (WIDGET-02)
3. WHEN o usuário minimiza a janela principal com uma tarefa em foco, contando ou pausada, THEN the trackzyn SHALL abrir o widget. (WIDGET-03)
4. WHEN o usuário pressiona `Ctrl+Shift+F` (Windows/Linux) ou `⌘+Shift+F` (macOS) com a janela principal ativa e uma tarefa em foco THEN the trackzyn SHALL abrir o widget e minimizar a janela principal. (WIDGET-04)
5. WHILE outro app está ativo the trackzyn SHALL deixar `Ctrl+Shift+F` e `⌘+Shift+F` chegarem a esse app. (WIDGET-05)
6. The trackzyn SHALL mostrar o widget numa janela sem moldura, acima de todas as outras janelas, que pode ser arrastada. (WIDGET-06)
7. WHILE o mouse está fora do widget the trackzyn SHALL mostrar só o título da tarefa atual, cortado com reticências quando não cabe, e o cronômetro. (WIDGET-07)
8. WHILE o mouse está sobre o widget the trackzyn SHALL mostrar também `Intervalo`, `Anotações`, `Pausar` (ou `Retomar`), `Pular`, `Concluir` e `Expandir`. (WIDGET-08)
9. WHEN o widget abre pela primeira vez THEN the trackzyn SHALL posicioná-lo no canto superior direito da tela onde está a janela principal, com margem da borda. (WIDGET-09)
10. WHEN o usuário arrasta o widget e o abre de novo, inclusive depois de reiniciar o app, THEN the trackzyn SHALL abri-lo na última posição. (WIDGET-10)
11. IF a última posição do widget fica fora de todas as telas conectadas THEN the trackzyn SHALL abri-lo na posição inicial. (WIDGET-11)

**Independent Test**: No desktop, focar uma tarefa, trocar para outro app e ver o widget por cima; passar o mouse e ver os 6 controles; arrastar, reiniciar o app e ver a mesma posição.

---

### P1: Ações pelo widget ⭐ MVP

**User Story**: Como usuário, quero pausar, pular, concluir, tirar intervalo, estender e anotar pelo widget, sem voltar à janela principal.

**Why P1**: Sem as ações, o widget só mostra o tempo e obriga a trocar de janela para qualquer coisa.

**Acceptance Criteria**:

1. WHEN o usuário clica `Pausar`, `Retomar`, `Pular`, `Concluir` ou `Intervalo` no widget THEN the trackzyn SHALL aplicar a mesma regra da tela de foco (FOCUS-04 a FOCUS-09 e BREAK-01 a BREAK-04 de `foco-e-sons`). (WIDGET-12)
2. WHILE o cronômetro está em `00:00:00` com a estimativa esgotada, WHEN o mouse passa sobre o widget, the trackzyn SHALL mostrar `Estender` e `Concluir` junto dos outros controles. (WIDGET-13)
3. WHEN o usuário clica `Anotações` THEN the trackzyn SHALL aumentar o widget e mostrar um campo com as anotações da tarefa atual. (WIDGET-14)
4. WHEN o campo de anotações do widget perde o foco THEN the trackzyn SHALL salvar o texto, que SHALL aparecer igual no diálogo da tarefa. (WIDGET-15)
5. WHEN o usuário conclui pelo widget a última tarefa pendente de Hoje THEN the trackzyn SHALL manter o widget aberto com `Tudo limpo` e `Expandir`. (WIDGET-16)
6. WHEN a tarefa em foco é excluída, sai de Hoje ou a lista é arquivada THEN the trackzyn SHALL fechar o widget e restaurar a janela principal no quadro. (WIDGET-17)

**Independent Test**: Pelo widget, pausar, retomar, pular, tirar um intervalo de 1 min, escrever uma anotação e conferir no diálogo da tarefa, e concluir a última tarefa de Hoje.

---

### P1: Voltar ao app e sincronia ⭐ MVP

**User Story**: Como usuário, quero sair do widget de volta ao app e ver as duas janelas sempre com o mesmo estado.

**Why P1**: "Aumentar" é um dos controles pedidos, e duas janelas com estados diferentes registrariam tempo errado.

**Acceptance Criteria**:

1. WHEN o usuário clica `Expandir` THEN the trackzyn SHALL fechar o widget e restaurar a janela principal em primeiro plano, na tela de foco. (WIDGET-18)
2. WHEN o usuário restaura a janela principal pela barra de tarefas ou pelo Dock THEN the trackzyn SHALL fechar o widget. (WIDGET-19)
3. WHEN o usuário pressiona `Ctrl+Shift+F` ou `⌘+Shift+F` com o widget ativo THEN the trackzyn SHALL fazer o mesmo que `Expandir`. (WIDGET-20)
4. WHEN o widget é fechado pelo sistema (`⌘W` ou `Alt+F4`) THEN the trackzyn SHALL fazer o mesmo que `Expandir`, sem encerrar a sessão. (WIDGET-21)
5. WHEN uma ação muda o foco numa das janelas THEN the trackzyn SHALL mostrar o novo estado na outra em até 1 s, sem recarregar. (WIDGET-22)
6. WHILE o widget está aberto the trackzyn SHALL tocar cada som só no widget, uma vez. (WIDGET-23)
7. WHERE o trackzyn roda no navegador the trackzyn SHALL esconder o ícone de recolher, não registrar o atalho e funcionar sem `window.trackzyn`. (WIDGET-24)

**Independent Test**: Com o widget aberto, pausar na janela principal e ver o widget parar em até 1 s; restaurar o app pelo Dock e ver o widget fechar; abrir o app no navegador e conferir que o ícone de recolher não aparece.

---

## Edge Cases

- WHEN o usuário minimiza a janela principal sem tarefa em foco THEN the trackzyn SHALL minimizar a janela normalmente, sem abrir o widget.
- IF o servidor não responde a uma ação feita no widget THEN the trackzyn SHALL seguir a fila offline de `foco-e-sons` (SYNC-05 a SYNC-07) e mostrar os avisos dela no próprio widget.
- WHEN o título da tarefa muda enquanto o widget está aberto THEN the trackzyn SHALL mostrar o novo título em até 1 s.
- IF o usuário fecha o app com o widget aberto e a tarefa contando THEN the trackzyn SHALL mostrar o diálogo de SYNC-08 antes de fechar.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| WIDGET-01 | P1: Widget sempre visível | Tasks | Implementing |
| WIDGET-02 | P1: Widget sempre visível | Tasks | Implementing |
| WIDGET-03 | P1: Widget sempre visível | Tasks | Implementing |
| WIDGET-04 | P1: Widget sempre visível | Tasks | In Tasks |
| WIDGET-05 | P1: Widget sempre visível | Tasks | In Tasks |
| WIDGET-06 | P1: Widget sempre visível | Tasks | Implementing |
| WIDGET-07 | P1: Widget sempre visível | Tasks | In Tasks |
| WIDGET-08 | P1: Widget sempre visível | Tasks | In Tasks |
| WIDGET-09 | P1: Widget sempre visível | Tasks | Implementing |
| WIDGET-10 | P1: Widget sempre visível | Tasks | Implementing |
| WIDGET-11 | P1: Widget sempre visível | Tasks | Implementing |
| WIDGET-12 | P1: Ações pelo widget | Tasks | In Tasks |
| WIDGET-13 | P1: Ações pelo widget | Tasks | In Tasks |
| WIDGET-14 | P1: Ações pelo widget | Tasks | In Tasks |
| WIDGET-15 | P1: Ações pelo widget | Tasks | In Tasks |
| WIDGET-16 | P1: Ações pelo widget | Tasks | In Tasks |
| WIDGET-17 | P1: Ações pelo widget | Tasks | Implementing |
| WIDGET-18 | P1: Voltar ao app e sincronia | Tasks | Implementing |
| WIDGET-19 | P1: Voltar ao app e sincronia | Tasks | Implementing |
| WIDGET-20 | P1: Voltar ao app e sincronia | Tasks | In Tasks |
| WIDGET-21 | P1: Voltar ao app e sincronia | Tasks | Implementing |
| WIDGET-22 | P1: Voltar ao app e sincronia | Tasks | Implementing |
| WIDGET-23 | P1: Voltar ao app e sincronia | Tasks | Implementing |
| WIDGET-24 | P1: Voltar ao app e sincronia | Tasks | Implementing |

**Coverage:** 24 total, 24 mapped to tasks, 0 unmapped

---

## Success Criteria

- [ ] Durante um foco de 30 min trabalhando em outro app, o usuário pausa, retoma e conclui pelo widget sem abrir a janela principal nenhuma vez.
- [ ] Em nenhum momento as duas janelas mostram estados diferentes por mais de 1 s.
