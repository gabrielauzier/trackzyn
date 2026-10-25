# Relatórios Specification

## Problem Statement

Com o foco, cada segundo de trabalho fica registrado como sessão, mas o usuário não tem como ver esse tempo somado: quanto trabalhou na semana, em que horário rende mais, quanto cada lista consome e se as estimativas acertam. Sem isso, o registro não ajuda a planejar melhor. Os prints `04-relatorios-visao-geral.png` e `05-relatorios-detalhes.png` mostram o que a fonte espera ver.

## Goals

- [ ] O usuário vê, para um período e uma lista, o tempo trabalhado, as tarefas concluídas e a média por tarefa, com os mesmos números que somaria à mão a partir das sessões.
- [ ] O usuário vê quais tarefas terminaram antes, no prazo ou depois da estimativa.

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Relatórios de equipe, somando vários membros | Decisão do usuário: cada um vê só o próprio tempo. |
| Gerar o arquivo PDF direto (sem o diálogo de impressão) | Decisão do usuário: o PDF sai pelo diálogo de impressão. |
| Editar sessões pelos relatórios | Não aparece na fonte. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Prioridade | Visão geral, antes/depois da estimativa e aba Sessões são P2; Exportar PDF é P3 | Decisão do usuário | y |
| De quem são os dados | Só as sessões e as conclusões do usuário logado, mesmo num workspace com outros membros | Decisão do usuário | y |
| Quem concluiu a tarefa | Nova coluna `tasks.completed_by_user_id`, gravada ao concluir pelo quadro, pelo foco ou pelo widget e limpa ao sair de Concluídas; tarefas concluídas antes da migration ficam sem dono e não entram nos relatórios | Decisão do usuário em 2026-10-25 (AD-006) | y |
| Tempo do selo antes/no prazo/depois | Tempo total da tarefa somando as sessões de todos os membros | Decisão do usuário em 2026-10-25: a estimativa é da tarefa | y |
| Período padrão | Semana atual, de segunda-feira até hoje | Decisão do usuário | y |
| Período máximo | 366 dias | Decisão do usuário | y |
| Dias trabalhados | Dias com ao menos uma sessão de tarefa | Decisão do usuário | y |
| Tempo trabalhado | Soma das sessões de tarefa, sem os intervalos | Fato da fonte: no print, 16h 52min é o tempo das tarefas e os 10min de intervalo aparecem à parte | y |
| Média por tarefa | Tempo trabalhado dividido pelas tarefas concluídas no período | Fato da fonte: 16h 52min ÷ 12 = 1h 24min, como no print | y |
| Tempo por lista | Uma fatia por lista e uma de `Intervalos`; o total soma tarefas e intervalos | Fato da fonte: 17h 2min = 16h 52min + 10min, como no print | y |
| Empate em mais produtivo | Mostra todos os empatados (`Segunda e quarta`) | Decisão do usuário | y |
| Antes, no prazo, depois | `No prazo` (verde) quando o gasto fica a até 5% da estimativa, para mais ou para menos; abaixo disso `Xmin antes` (verde); acima `Xmin depois` (vermelho) | Decisão do usuário | y |
| Listas arquivadas | Contam em `Todas as listas` e aparecem no filtro com o rótulo `arquivada` | Decisão do usuário | y |
| Sessão que atravessa a meia-noite | Dividida entre os dias | Decisão do usuário | y |
| Fuso dos dias e horas | `workspaces.timezone`; se nulo, o fuso da aplicação | Mesma regra de `listas-e-quadro` | y |
| Exportar PDF | Diálogo de impressão do sistema com a página formatada | Decisão do usuário | y |
| Filtro de uma lista excluída | Mostra "A lista foi excluída." e volta para `Todas as listas` | Decisão do usuário | y |
| Tarefa concluída no período com tempo registrado antes dele | Conta em `Tarefas concluídas` e o selo usa o tempo total da tarefa; `Tempo trabalhado` soma só as sessões do período | Decisão do usuário | y |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P2: Visão geral

**User Story**: Como usuário, quero ver meu tempo trabalhado, minhas tarefas concluídas e meus horários mais produtivos num período, para entender como uso meu tempo.

**Why P2**: Depende das sessões do foco (P1) e não é necessária para o uso diário.

**Acceptance Criteria**:

1. WHEN o usuário abre `Relatórios` pelo menu lateral THEN the trackzyn SHALL mostrar a aba `Visão geral` com o filtro de lista em `Todas as listas`, o período da segunda-feira corrente até hoje e os cartões `Dias trabalhados`, `Tarefas concluídas`, `Tempo trabalhado` e `Média por tarefa`. (REPORT-01)
2. WHEN o período tem sessões de tarefa de 1h30min na segunda e de 2h na quarta, um intervalo de 10min na quarta e 2 tarefas concluídas THEN the trackzyn SHALL mostrar `Dias trabalhados` 2, `Tarefas concluídas` 2, `Tempo trabalhado` `3h 30min` e `Média por tarefa` `1h 45min`. (REPORT-02)
3. WHEN o período não tem tarefa concluída THEN the trackzyn SHALL mostrar `—` em `Média por tarefa`. (REPORT-03)
4. The trackzyn SHALL mostrar um gráfico de barras com um grupo por dia do período e as séries `Tarefas`, `Intervalos` e `Total` (tarefas mais intervalos), usando o `BarChart` e a paleta que já existem. (REPORT-04)
5. The trackzyn SHALL mostrar `Hora mais produtiva` (faixa de uma hora com mais tempo de tarefa, como `18–19h`), `Dia mais produtivo` (dia da semana) e `Mês mais produtivo` (como `out. de 2026`), listando todos os empatados quando houver empate. (REPORT-05)
6. The trackzyn SHALL mostrar a rosca `Tempo por lista` com uma fatia por lista e uma de `Intervalos`, a legenda com nome, tempo e porcentagem, e o cabeçalho `N listas, Tempo total: X`. (REPORT-06)
7. WHEN o usuário escolhe uma lista no filtro THEN the trackzyn SHALL recalcular cartões, gráfico, mais produtivos e tarefas concluídas só com as sessões e tarefas dessa lista. (REPORT-07)
8. The trackzyn SHALL listar no filtro as listas arquivadas com o rótulo `arquivada` e contá-las em `Todas as listas`. (REPORT-08)
9. The trackzyn SHALL contar só as sessões e as conclusões do usuário logado. (REPORT-09)
10. WHEN uma sessão vai das 23:30 às 00:30 no fuso do workspace THEN the trackzyn SHALL contar 30min em cada um dos dois dias. (REPORT-10)
11. WHILE uma sessão está aberta the trackzyn SHALL contá-la até o momento da consulta. (REPORT-11)
12. WHEN o período não tem sessão THEN the trackzyn SHALL mostrar `0`, `0min` e `—` nos cartões e `Sem atividade no período` no gráfico, na rosca e nos mais produtivos. (REPORT-12)
13. IF o fim do período vem antes do início ou o período passa de 366 dias THEN the trackzyn SHALL responder 422 e manter o filtro anterior na tela. (REPORT-13)

**Independent Test**: Gerar sessões conhecidas em PGlite, abrir a visão geral e comparar cada número com a conta feita à mão.

---

### P2: Antes ou depois da estimativa

**User Story**: Como usuário, quero ver quais tarefas terminei antes, no prazo ou depois da estimativa, para estimar melhor.

**Why P2**: Usa as estimativas do quadro e o tempo do foco; ajuda a planejar, mas não é necessário no dia a dia.

**Acceptance Criteria**:

1. The trackzyn SHALL agrupar as tarefas concluídas no período por dia de conclusão, do mais recente para o mais antigo, com o cabeçalho do dia e `N tarefas`. (REPORT-14)
2. WHEN o tempo gasto fica a até 5% da estimativa, para mais ou para menos, THEN the trackzyn SHALL mostrar o selo verde `No prazo`. (REPORT-15)
3. WHEN o tempo gasto fica mais de 5% abaixo da estimativa THEN the trackzyn SHALL mostrar o selo verde `<diferença> antes` (como `2h 32min antes`). (REPORT-16)
4. WHEN o tempo gasto fica mais de 5% acima da estimativa THEN the trackzyn SHALL mostrar o selo vermelho `<diferença> depois` (como `21min depois`). (REPORT-17)
5. WHEN a tarefa não tem estimativa THEN the trackzyn SHALL mostrá-la sem selo e fora das porcentagens. (REPORT-18)
6. The trackzyn SHALL mostrar no cabeçalho a porcentagem de selos verdes e de vermelhos entre as tarefas com estimativa e uma barra dividida nessas proporções; com 5 verdes e 6 vermelhos, `45,45%` e `54,55%`. (REPORT-19)

**Independent Test**: Concluir tarefas com estimativa de 60min e gastos de 50, 58, 63 e 80 min e uma sem estimativa; conferir os selos `10min antes`, `No prazo`, `No prazo`, `20min depois` e nenhum, e as porcentagens 75% e 25%.

---

### P2: Aba Sessões

**User Story**: Como usuário, quero ver cada sessão registrada, com início, fim e duração, para conferir de onde vêm os números.

**Why P2**: Dá transparência aos totais; não é necessária para focar.

**Acceptance Criteria**:

1. WHEN o usuário abre a aba `Sessões` THEN the trackzyn SHALL listar as sessões do período agrupadas por dia, com início, fim, tarefa (ou `Intervalo`), lista e duração. (REPORT-20)
2. WHILE uma sessão está aberta the trackzyn SHALL mostrá-la com `em andamento` no lugar do fim. (REPORT-21)
3. WHEN o período não tem sessão THEN the trackzyn SHALL mostrar `Sem atividade no período`. (REPORT-22)

**Independent Test**: Com 3 sessões e um intervalo em dois dias, conferir a lista e a sessão aberta marcada como `em andamento`.

---

### P3: Exportar PDF

**User Story**: Como usuário, quero salvar a visão geral em PDF para guardar ou enviar.

**Why P3**: Conveniência; o mesmo conteúdo já está na tela.

**Acceptance Criteria**:

1. WHEN o usuário clica `Exportar PDF` THEN the trackzyn SHALL abrir o diálogo de impressão do sistema com a visão geral formatada para página, com o período e o filtro de lista no topo e sem o menu lateral. (REPORT-23)

**Independent Test**: Clicar `Exportar PDF`, escolher "Salvar como PDF" e conferir o arquivo.

---

## Edge Cases

- WHEN o período tem um só dia THEN the trackzyn SHALL mostrar o gráfico com um grupo de barras e os mais produtivos desse dia.
- IF o filtro aponta para uma lista excluída THEN the trackzyn SHALL mostrar "A lista foi excluída." e voltar o filtro para `Todas as listas`.
- WHEN uma tarefa foi concluída no período, mas o tempo dela foi registrado antes do período THEN the trackzyn SHALL contá-la em `Tarefas concluídas` e mostrar o selo com o tempo total da tarefa, enquanto `Tempo trabalhado` SHALL contar só as sessões dentro do período.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| REPORT-01 | P2: Visão geral | Tasks | In Tasks |
| REPORT-02 | P2: Visão geral | Tasks | Implementing |
| REPORT-03 | P2: Visão geral | Tasks | Implementing |
| REPORT-04 | P2: Visão geral | Tasks | Implementing |
| REPORT-05 | P2: Visão geral | Tasks | Implementing |
| REPORT-06 | P2: Visão geral | Tasks | Implementing |
| REPORT-07 | P2: Visão geral | Tasks | Implementing |
| REPORT-08 | P2: Visão geral | Tasks | Implementing |
| REPORT-09 | P2: Visão geral | Tasks | Implementing |
| REPORT-10 | P2: Visão geral | Tasks | Implementing |
| REPORT-11 | P2: Visão geral | Tasks | Implementing |
| REPORT-12 | P2: Visão geral | Tasks | Implementing |
| REPORT-13 | P2: Visão geral | Tasks | In Tasks |
| REPORT-14 | P2: Antes ou depois da estimativa | Tasks | Implementing |
| REPORT-15 | P2: Antes ou depois da estimativa | Tasks | Implementing |
| REPORT-16 | P2: Antes ou depois da estimativa | Tasks | Implementing |
| REPORT-17 | P2: Antes ou depois da estimativa | Tasks | Implementing |
| REPORT-18 | P2: Antes ou depois da estimativa | Tasks | Implementing |
| REPORT-19 | P2: Antes ou depois da estimativa | Tasks | Implementing |
| REPORT-20 | P2: Aba Sessões | Tasks | In Tasks |
| REPORT-21 | P2: Aba Sessões | Tasks | In Tasks |
| REPORT-22 | P2: Aba Sessões | Tasks | In Tasks |
| REPORT-23 | P3: Exportar PDF | Tasks | In Tasks |

**Coverage:** 23 total, 23 mapped to tasks, 0 unmapped

---

## Success Criteria

- [ ] Para qualquer conjunto de sessões de teste, cada número da visão geral é igual à conta feita à mão.
- [ ] Os selos de 100% das tarefas concluídas com estimativa seguem a regra de 5%.
