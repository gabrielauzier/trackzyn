# Esconder sessões curtas Specification

## Problem Statement

Um foco iniciado e pausado em poucos segundos vira uma sessão como qualquer outra. Na Agenda ele aparece como um risco de 1 px que polui a grade, e na aba Sessões dos Relatórios ocupa uma linha inteira. A issue #22 pede uma configuração do workspace que esconda as sessões menores que X minutos nessas duas telas, sem mudar o tempo registrado.

## Goals

- [ ] O dono do workspace liga a configuração, define X entre 1 e 60 minutos, e as sessões menores que X somem da Agenda e da aba Sessões para todos os membros.
- [ ] Ligar ou desligar a configuração não muda nenhum total: o total do dia na Agenda e toda a visão geral dos Relatórios continuam iguais.

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Esconder as sessões curtas da visão geral dos Relatórios (horas, por lista, gráfico do dia) | Decisão do usuário: as sessões escondidas continuam contando nos totais; a issue cita só a Agenda e a aba Sessões. |
| Apagar ou juntar sessões curtas | A configuração só muda o que aparece; o tempo registrado fica intacto. |
| Configuração por usuário | A issue pede uma configuração do workspace. |
| Esconder sessões no foco, no quadro ou no tempo gasto da tarefa | A issue cita só a Agenda e a aba Sessões. |
| Mostrar as sessões escondidas sob demanda (um "mostrar todas") | Nem a issue nem o usuário pedem. |
| Ler ou mudar a configuração por token de acesso (`tkz_`) | AD-007: a rota de workspace não tem escopo de token; a issue não pede. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Totais | As sessões escondidas continuam contando no total do dia da Agenda e em toda a visão geral dos Relatórios | Decisão do usuário (#22) | y |
| Como X é escolhido | Um interruptor liga a configuração, e um campo de número define X, de 1 a 60 minutos | Decisão do usuário (#22) | y |
| Valor de X ao ligar pela primeira vez | 1 minuto | Esconde os focos de segundos, o caso que motivou a issue, sem esconder sessões de trabalho | y |
| O que é "menor que X" | A duração da sessão inteira, do início ao fim, é menor que X × 60 segundos; uma sessão de exatamente X minutos aparece | Leitura literal de "menores que X"; a duração inteira não muda com o dia ou o período em que a sessão é cortada | y |
| Sessão que atravessa a meia-noite | Some ou aparece por inteiro, pela duração inteira, nos dois dias | Consequência da linha acima: não esconder só um pedaço | y |
| Sessão em andamento | Sempre aparece, mesmo enquanto é menor que X | Quem acabou de iniciar o foco veria o bloco sumir e reaparecer; a sessão ainda não tem duração final | y |
| Intervalos | A regra vale também para os intervalos (pausas) | A issue fala de sessões, e o intervalo é uma sessão na Agenda e na aba Sessões | y |
| Quem altera | Só o dono do workspace (papel `owner`) ou o gestor externo (`manager`), como o fuso e o idioma; "dono" nesta spec quer dizer os dois | Mesma regra das outras configurações do workspace: `PATCH /api/workspaces/:id` exige o nível `owner`, que o `manager` também tem (`ROLE_RANK`), e a tela usa `canManage` | y |
| Quem é afetado | Todos os membros veem as mesmas sessões escondidas | A issue pede uma configuração do workspace | y |
| Sobreposição na Agenda | O aviso de sobreposição do painel (AGENDA-19) ignora as sessões escondidas, e elas não dividem a largura da coluna (AGENDA-06) com os blocos visíveis | Decisão do usuário (#22): a Agenda só avisa sobre o que se vê; o tempo em comum com uma sessão escondida continua contando nas duas, sem aviso | y |
| Sessão salva ou ajustada para menos de X na Agenda | É salva normalmente e some da grade; o painel fecha | Mesmo comportamento de uma sessão que sai da Agenda (AGENDA-32); X é uma escolha do dono | y |
| Onde fica | Na tela de configurações do workspace, abaixo do fuso horário | É onde ficam as configurações do workspace hoje | y |

**Open questions:** none - all resolved or logged above (required before the spec is confirmed).

---

## User Stories

### P1: Configurar o limite no workspace ⭐ MVP

**User Story**: Como dono do workspace, quero ligar um limite de duração mínima das sessões exibidas, para que focos de segundos não poluam a Agenda e os Relatórios de ninguém.

**Why P1**: Sem a configuração não há o que esconder.

**Acceptance Criteria**:

1. The system SHALL store, per workspace, a minimum session length that is either off or a whole number of minutes from 1 to 60, off by default.  <!-- ubiquitous -->
2. WHEN a workspace is read THEN the system SHALL return its minimum session length as `min_session_minutes`, `null` when off, to every member.  <!-- event-driven -->
3. WHEN the owner sends `min_session_minutes` with a whole number from 1 to 60 or `null` in `PATCH /api/workspaces/:id` THEN the system SHALL save it and return it.  <!-- event-driven -->
4. IF `min_session_minutes` is below 1, above 60 or not a whole number THEN the system SHALL answer 422 and keep the stored value.  <!-- unwanted-behavior -->
5. IF a member who is not the owner sends `min_session_minutes` THEN the system SHALL answer 403 and keep the stored value.  <!-- unwanted-behavior -->
6. WHEN the owner opens the workspace settings THEN the system SHALL show, below the timezone, the switch `Esconder sessões curtas` and, while it is on, the field `Menos de` with the minutes.  <!-- event-driven -->
7. WHEN the owner turns the switch on for a workspace that has it off THEN the system SHALL fill the field with 1.  <!-- event-driven -->
8. WHEN the owner saves the settings with the switch off THEN the system SHALL send `min_session_minutes: null`.  <!-- event-driven -->
9. IF the field holds a value outside 1 to 60 or not a whole number while the switch is on THEN the system SHALL show `Entre 1 e 60 minutos.` under it and send nothing.  <!-- unwanted-behavior -->
10. WHILE the viewer is not the owner the system SHALL show the switch and the field disabled, with the stored value.  <!-- state-driven -->

**Independent Test**: Como dono, ligar a configuração com 5 minutos, salvar, recarregar a página e ver o interruptor ligado com 5; como editor, ver os dois desabilitados.

---

### P1: Esconder as sessões curtas da Agenda ⭐ MVP

**User Story**: Como membro, quero que a Agenda não mostre as sessões menores que o limite do workspace, para ver só o tempo que importa.

**Why P1**: A Agenda é uma das duas telas que a issue cita.

**Acceptance Criteria**:

11. WHILE the workspace has a minimum of X minutes, the Agenda SHALL not draw a closed session whose whole length, from start to end, is below X × 60 seconds, in the week or the day view.  <!-- state-driven -->
12. WHILE the workspace has a minimum of X minutes, the Agenda SHALL draw a closed session whose whole length is exactly X × 60 seconds or more.  <!-- state-driven -->
13. The Agenda SHALL draw the open session whatever its length.  <!-- ubiquitous -->
14. The Agenda SHALL count the hidden sessions in the day total of the week header and of the day view.  <!-- ubiquitous -->
15. The Agenda SHALL leave the hidden sessions out of the overlap warning of the panel (AGENDA-19) and out of the side-by-side layout of the blocks (AGENDA-06), so a block overlapping only hidden sessions takes the whole width of its column.  <!-- ubiquitous -->
16. WHILE the workspace has the minimum off, the Agenda SHALL draw every session.  <!-- state-driven -->
17. WHEN a session is saved or adjusted to a length below X THEN the Agenda SHALL take its block off the grid and close its panel.  <!-- event-driven -->
18. WHEN the owner changes the minimum THEN the Agenda SHALL apply the new value the next time the workspace is read, without a reload.  <!-- event-driven -->

**Independent Test**: Com o limite em 5 minutos, uma sessão de 4 min 59 s some da grade e a de 5 min aparece; o total do dia continua somando as duas.

---

### P1: Esconder as sessões curtas da aba Sessões ⭐ MVP

**User Story**: Como membro, quero que a aba Sessões dos Relatórios não liste as sessões menores que o limite do workspace.

**Why P1**: É a outra tela que a issue cita.

**Acceptance Criteria**:

19. WHILE the workspace has a minimum of X minutes, `GET /api/reports/sessions` SHALL leave out every piece of a closed session whose whole length is below X × 60 seconds.  <!-- state-driven -->
20. WHILE the workspace has a minimum of X minutes, `GET /api/reports/sessions` SHALL keep every piece of a session that crosses midnight when its whole length is X × 60 seconds or more, even if one piece is shorter.  <!-- state-driven -->
21. `GET /api/reports/sessions` SHALL keep the open session whatever its length.  <!-- ubiquitous -->
22. IF every session of a day is hidden THEN `GET /api/reports/sessions` SHALL leave that day out.  <!-- unwanted-behavior -->
23. The overview of the Reports (`GET /api/reports/overview`) SHALL count the hidden sessions as it does today.  <!-- ubiquitous -->
24. WHILE the workspace has the minimum off, `GET /api/reports/sessions` SHALL return every session, as today.  <!-- state-driven -->

**Independent Test**: Com o limite em 5 minutos, a aba Sessões não lista a sessão de 2 minutos, e a visão geral continua com as mesmas horas.

---

## Edge Cases

- WHEN a session lasts exactly X minutes THEN the system SHALL show it (HIDE-12, HIDE-20).
- IF every session of a day is hidden in the Agenda THEN the Agenda SHALL show the day with its total and no blocks, as a day with sessions (not the empty-day message of AGENDA-42).
- IF the workspace changes THEN the Agenda and the Reports SHALL use the minimum of the workspace now current.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| HIDE-01 | P1: Configurar | T1 | Verified |
| HIDE-02 | P1: Configurar | T2 | Verified |
| HIDE-03 | P1: Configurar | T2 | Verified |
| HIDE-04 | P1: Configurar | T2 | Verified |
| HIDE-05 | P1: Configurar | T2 | Verified |
| HIDE-06 | P1: Configurar | T8 | Verified |
| HIDE-07 | P1: Configurar | T8 | Verified |
| HIDE-08 | P1: Configurar | T8 | Verified |
| HIDE-09 | P1: Configurar | T8 | Verified |
| HIDE-10 | P1: Configurar | T8 | Verified |
| HIDE-11 | P1: Agenda | T4, T5, T6, T7 | Verified |
| HIDE-12 | P1: Agenda | T4, T5 | Verified |
| HIDE-13 | P1: Agenda | T4 | Verified |
| HIDE-14 | P1: Agenda | T5, T6 | Verified |
| HIDE-15 | P1: Agenda | T5, T6, T7 | Verified |
| HIDE-16 | P1: Agenda | T4, T7 | Verified |
| HIDE-17 | P1: Agenda | T7 | Verified |
| HIDE-18 | P1: Agenda | T7 | Verified |
| HIDE-19 | P1: Sessões | T3 | Verified |
| HIDE-20 | P1: Sessões | T3 | Verified |
| HIDE-21 | P1: Sessões | T3 | Verified |
| HIDE-22 | P1: Sessões | T3 | Verified |
| HIDE-23 | P1: Sessões | T3 | Verified |
| HIDE-24 | P1: Sessões | T3 | Verified |

**Coverage:** 24 total, 24 mapped to tasks, 24 verified (Verifier round 2 PASS)

---

## Success Criteria

- [ ] Com o limite ligado, nenhuma sessão encerrada menor que X aparece na Agenda nem na aba Sessões.
- [ ] Ligar e desligar o limite não muda nenhum número da visão geral dos Relatórios nem o total do dia da Agenda.
