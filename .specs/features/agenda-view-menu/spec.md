# Menu de exibição da Agenda Specification

## Problem Statement

Quem não trabalha no fim de semana vê na Agenda duas colunas sempre vazias, e por causa delas as colunas dos dias úteis ficam mais estreitas. A lupa (1x, 2x, 3x) ocupa espaço na barra de ferramentas, ao lado de Dia e Semana. A issue #26 pede um filtro de dias da semana e um menu de exibição, no canto da grade, que junte o filtro e a lupa.

## Goals

- [ ] O usuário escolhe quais dias da semana a grade da semana mostra, e os dias escolhidos ocupam a largura toda.
- [ ] As opções de exibição da Agenda (dias e lupa) ficam num menu só, aberto por um botão no canto da grade.

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Filtrar dias na visão Dia | Decisão do usuário (#26): o filtro só aparece na visão Semana. |
| Guardar a seleção de dias no servidor ou por workspace | É uma preferência de exibição deste dispositivo, como a lupa. |
| Mudar o que os relatórios ou os totais contam | Esconder um dia só muda o desenho da grade. |
| Começar a semana em outro dia que não segunda | AD-004: a semana vai de segunda a domingo. |
| Outras opções no menu além de dias e lupa | A issue pede só essas duas. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Desenho | Botão no canto superior esquerdo da grade, acima da coluna de horas; menu com `Dias da semana` (uma caixa por dia, atalhos `Todos` e `Seg – Sex`) e a `Lupa`; com algum dia escondido, um ponto no botão | Desenho aprovado pelo usuário (canvas `Agenda · menu de exibição`, https://claude.ai/artifact/JRuVmmkkmvqMMWYZEQysUN) | y |
| Filtro e visão | O filtro de dias só aparece no menu na visão Semana; na visão Dia, o menu mostra só a lupa | Decisão do usuário (#26) | y |
| Lupa | Sai da barra de ferramentas e vai para o menu, nas duas visões | Decisão do usuário (#26): o menu junta as configurações de exibição | y |
| Botão na visão Dia | No topo da coluna de horas da linha do tempo do dia, no mesmo lugar que na semana | A visão Dia não tem a linha de cabeçalho dos dias; o lugar é o mesmo à esquerda das horas | y |
| Quando vale | Marcar, desmarcar e os atalhos mudam a grade na hora, sem botão de aplicar; o menu continua aberto; a lupa também vale na hora | Decisão do usuário (#26), depois de voltar atrás no botão `Aplicar` | y |
| Último dia | O último dia marcado não pode ser desmarcado: a caixa dele fica desabilitada | Decisão do usuário (#26) | y |
| Lembrar | A seleção de dias fica lembrada neste dispositivo, como a lupa; a primeira vez, os sete dias | Mesmo comportamento da lupa (#19); quem esconde o fim de semana quer isso toda vez | y |
| Dias escondidos | Saem do cabeçalho e da grade; as setas continuam mudando de semana inteira; os totais dos dias que ficam não mudam | Esconder só muda o desenho | y |
| Dia escondido escolhido | Escolher no calendário, ou ir para `Hoje`, num dia escondido abre a semana dele sem mostrar o dia; `Nova sessão` continua abrindo o painel com o horário de hoje | O painel não depende da coluna estar à vista | y |
| Sessões dos dias escondidos | Continuam contando no aviso de sobreposição do painel | Esconder um dia não esconde as sessões dele do que se sobrepõe | y |

**Open questions:** none - all resolved or logged above (required before the spec is confirmed).

---

## User Stories

### P1: Abrir o menu de exibição ⭐ MVP

**User Story**: Como usuário, quero um lugar só para as opções de exibição da Agenda.

**Why P1**: O filtro de dias precisa de um lugar, e a lupa vai para ele.

**Acceptance Criteria**:

1. The Agenda SHALL show, in the top left corner of the week grid, above the hour column, a button named `Opções de exibição`.  <!-- ubiquitous -->
2. The Agenda SHALL show the same button at the top of the hour column of the day view.  <!-- ubiquitous -->
3. WHEN the button is clicked THEN the Agenda SHALL open a menu below it and mark the button as expanded.  <!-- event-driven -->
4. WHEN the menu is open and Esc is pressed or a click lands outside it THEN the Agenda SHALL close the menu and give the focus back to the button.  <!-- event-driven -->
5. The menu SHALL hold the zoom control, labelled `Lupa`, with `1x`, `2x` and `3x`, which works as today (one level at a time, remembered on the device).  <!-- ubiquitous -->
6. The Agenda SHALL no longer show the zoom control in the toolbar.  <!-- ubiquitous -->

**Independent Test**: Clicar no botão do canto da grade, ver a lupa dentro do menu, trocar para 1x e ver a grade encolher; a barra de ferramentas não tem mais a lupa.

---

### P1: Escolher os dias da semana ⭐ MVP

**User Story**: Como usuário, quero esconder os dias da semana que não uso, para ver os outros com mais espaço.

**Why P1**: É o pedido da issue.

**Acceptance Criteria**:

7. WHILE the Agenda is in the week view, the menu SHALL show `Dias da semana` with one checkbox per day, from `Segunda-feira` to `Domingo`, each checked when that day is shown.  <!-- state-driven -->
8. WHILE the Agenda is in the day view, the menu SHALL not show `Dias da semana`.  <!-- state-driven -->
9. WHEN a day is unchecked THEN the week grid SHALL leave out its header and its column at once, the remaining columns SHALL share the whole width, and the menu SHALL stay open.  <!-- event-driven -->
10. WHEN a day is checked again THEN the week grid SHALL show it again at once, in its place in the week.  <!-- event-driven -->
17. The Agenda SHALL apply every change made in the menu at once, without a confirm button.  <!-- ubiquitous -->
18. WHEN a zoom level is clicked in the menu THEN the grid SHALL change at once and the menu SHALL stay open.  <!-- event-driven -->
11. WHEN `Seg – Sex` is clicked THEN the Agenda SHALL show Monday to Friday and hide Saturday and Sunday at once.  <!-- event-driven -->
12. WHEN `Todos` is clicked THEN the Agenda SHALL show the seven days at once.  <!-- event-driven -->
13. IF only one day is checked THEN its checkbox SHALL be disabled, so the week always shows at least one day.  <!-- unwanted-behavior -->
14. WHILE at least one day is hidden, the button SHALL show a dot and be named `Opções de exibição, N de 7 dias`.  <!-- state-driven -->
15. WHEN the Agenda opens THEN it SHALL show the days chosen last on this device, or the seven days the first time, or if storage holds no valid choice.  <!-- event-driven -->
16. The Agenda SHALL keep the day total of each shown day, the week navigation by whole weeks, and the overlap warning (AGENDA-19) as they are, hidden days included in the warning.  <!-- ubiquitous -->

**Independent Test**: Abrir o menu, clicar em `Seg – Sex` e ver na hora a semana com cinco colunas mais largas e o ponto no botão; recarregar e ver as mesmas cinco colunas.

---

## Edge Cases

- IF the device storage is off or holds something other than a list of week days THEN the Agenda SHALL show the seven days (DAYS-15).
- WHEN the view switches from Semana to Dia THEN the menu SHALL drop `Dias da semana`, and the day view SHALL show the day it is on, hidden or not (DAYS-8).
- WHEN today is a hidden day THEN `Nova sessão` SHALL still open the panel on today (DAYS-16).

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| DAYS-01 | P1: Menu | T3, T5 | In Tasks |
| DAYS-02 | P1: Menu | T4, T5 | In Tasks |
| DAYS-03 | P1: Menu | T2 | In Tasks |
| DAYS-04 | P1: Menu | T2 | In Tasks |
| DAYS-05 | P1: Menu | T2, T5 | In Tasks |
| DAYS-06 | P1: Menu | T5 | In Tasks |
| DAYS-07 | P1: Dias | T2 | In Tasks |
| DAYS-08 | P1: Dias | T2, T5 | In Tasks |
| DAYS-09 | P1: Dias | T2, T3, T5 | In Tasks |
| DAYS-10 | P1: Dias | T5 | In Tasks |
| DAYS-11 | P1: Dias | T1, T2 | In Tasks |
| DAYS-12 | P1: Dias | T1, T2 | In Tasks |
| DAYS-13 | P1: Dias | T1, T2 | In Tasks |
| DAYS-14 | P1: Dias | T2 | In Tasks |
| DAYS-15 | P1: Dias | T1, T5 | In Tasks |
| DAYS-16 | P1: Dias | T5 | In Tasks |
| DAYS-17 | P1: Dias | T2, T5 | In Tasks |
| DAYS-18 | P1: Menu | T2 | In Tasks |

**Coverage:** 18 total, 18 mapped to tasks, 0 unmapped

---

## Success Criteria

- [ ] Com `Seg – Sex`, a semana mostra cinco colunas, mais largas, e continua assim ao reabrir a Agenda.
- [ ] A lupa funciona como hoje, agora dentro do menu, nas duas visões.
