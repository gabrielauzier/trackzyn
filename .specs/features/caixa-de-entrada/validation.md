# Caixa de entrada: validation report

## Validation: caixa-de-entrada - FAIL

**Iteration**: 2 (of at most 3)
**Date**: 2026-11-13
**Spec**: `.specs/features/caixa-de-entrada/spec.md` (103 requirement IDs; PROC-03, MODAL-06, CAP-04, CAP-06 and INBOX-04 changed by the user on 2026-11-13, after iteration 1)
**Diff ranges**: feature `7ad8c99..41b0188` (43 commits, 153 files, +14 781 / −526); fix batch of this iteration `d74f9c5..41b0188` (7 commits, T34–T40, 25 files, +674 / −124). The code did not change between the iteration-1 head `2858734` and `d74f9c5` (docs only), so iteration-1 citations in files outside the fix diff still hold.
**Verifier**: independent sub-agent (author ≠ verifier). It ran read-only on the real tree. The mutations and the probe ran in a scratch `git worktree`.

**Why FAIL:** one requirement is still contradicted by the code. In MODAL-06, the API must refuse a group on a reminder. `POST /api/tasks/:id/move` with `group_id` puts a reminder into a group and answers **200**. A scratch probe confirmed it. The reminder is then stuck: any later `PATCH`, even a plain rename, answers 422 `reminder_field`. The other 102 IDs match the spec outcome, and all 13 mutations were killed. Every gate is green.

---

## Gate Check

| Package | lint | typecheck | test | build |
| --- | --- | --- | --- | --- |
| backend-node | exit 0 | exit 0 | exit 0: 1244 passed, 9 skipped (96 files passed, 1 skipped) | n/a |
| frontend | exit 0 | exit 0 | exit 0: 2214 passed, 0 skipped (192 files) | exit 0 (`vite build`) |
| desktop | exit 0 | exit 0 | exit 0: 281 passed, 4 skipped (38 files passed, 1 skipped) | n/a |

- Test integrity: compared with iteration 1, backend went from 1225 to 1244 (+19) and frontend from 2199 to 2214 (+15); desktop is unchanged. Two assertions were inverted on purpose because the spec changed (MODAL-06): `BE/test/mcp/task-fields-tools.test.ts:63-64` and `FE/components/board/task-dialog.test.tsx:510-522`. No test was deleted.
- Skipped tests (9 backend, 4 desktop) are in suites outside the diff, the same as in iteration 1.
- **Known flaky test**: `frontend/src/pages/focus-widget.test.tsx` › "a second click on Notes closes the open notes for good, and saves what was written".
  - It passed in the full gate run.
  - Run alone at HEAD, it failed 4 times out of 5.
  - Run alone in a scratch worktree at the base `d7e18fe`, with the same `node_modules` and no dependency changes in `d7e18fe..HEAD`, it failed 3 times out of 5.
  - The feature range touches neither `focus-widget.test.tsx` nor `focus-widget.tsx` (last change `adf8cea`, 2026-11-06).
  - **Classification: flaky, pre-existing, not caused by the feature.** Branches named `fix/focus-widget-notes-flaky-test` and `fix/focus-widget-notes-second-click` already exist in other worktrees.

---

## Task Completion

T1–T40 are all `[x]` in tasks.md. Phase 7 (T34–T40) deviations:

| Deviation | Effect |
| --- | --- |
| T36: "Fora do escopo: arrastar um lembrete para dentro de um contêiner (`moveTask`) ainda o põe no grupo." | **Contradicts MODAL-06** ("a API SHALL recusar com 422 esses campos num lembrete"). Confirmed by a probe; see gap 1. |
| T38: no card, the task card included, has `Iniciar foco` in its menu; the L-048 contrast is made on `Focar agora` | Consistent with REM-05: the reminder offers no focus. Evidenced by `FE/pages/list-board.test.tsx:828,832`. |
| T39: on desktop with the global shortcut on and bound to any combination, Mod+Shift+Space never opens the overlay | Consistent with CAP-04 as written ("no desktop com o atalho global desligado"). |

---

## Spec-Anchored Acceptance Criteria

Legend: ✅ the asserted value matches the spec outcome · ❌ the code contradicts the spec · ⚠️ spec-precision note (the spec gives no exact value).
Paths: `BE/` = `backend-node/`, `FE/` = `frontend/src/`, `DT/` = `desktop/src/`. Line numbers are at `41b0188`.

### P1 Capturar

| ID | Spec outcome | Evidence `file:line`: assertion | Status |
| --- | --- | --- | --- |
| CAP-01 | Item with trimmed text, arrival time, origin `app`; field cleared | `BE/test/routes/inbox.test.ts:42-43` `toMatchObject({ text: 'Ligar', source: 'app', … })`, `Date.parse(created_at) >= before - 1000`; `FE/pages/inbox.test.tsx:117-120` `toHaveBeenCalledWith({ text: 'Ligar para o contador', source: 'app' })`, `toHaveValue('')`; `FE/components/capture/capture-overlay.test.tsx:108` | ✅ |
| CAP-02 | No item; field keeps focus | `BE/test/routes/inbox.test.ts:54-55` `toBe(422)`, `counted()).toBe(0)`; `FE/pages/inbox.test.tsx:128-129` `not.toHaveBeenCalled()`, `toHaveFocus()` | ✅ |
| CAP-03 | 422; `Até 500 caracteres`; text kept | `BE/test/routes/inbox.test.ts:60-62` 501 → 422, 500 → 201; `FE/pages/inbox.test.tsx:140-141,151-152` | ✅ |
| CAP-04 | The hotkey (web, or desktop with the global shortcut off), the palette and the sidebar open the overlay with the field focused | `FE/components/capture/capture-overlay.test.tsx:41-42,52-53` (both combinations); `:87-88` desktop with the shortcut off → dialog `Capturar` and `toHaveFocus()`; `FE/components/command-palette.test.tsx:104-105` palette → dialog and textbox `toHaveFocus()`; `FE/components/app-layout.test.tsx:395` sidebar | ✅ (iteration-1 gap closed; mutant N6b killed) |
| CAP-05 | Esc closes, no item | `FE/components/capture/capture-overlay.test.tsx:119-120`; `FE/pages/capture-window.test.tsx:73-74` | ✅ |
| CAP-06 | Desktop with the shortcut on: the shortcut opens the capture window above the others, with another app or Trackzyn in front; origin `desktop` | `DT/main/capture-shortcut.test.ts:37-39` `onPress).toHaveBeenCalledTimes(1)`; `DT/main/capture-window.test.ts:57,84` `alwaysOnTop: true`, `['setAlwaysOnTop', true, 'floating']`; `FE/components/capture/capture-overlay.test.tsx:76-78` Trackzyn in front → `getCaptureShortcut` read and overlay `not.toBeInTheDocument()`; `FE/pages/capture-window.test.tsx:52` `{ text, source: 'desktop' }` | ✅ (N6a killed; the glue at `DT/main/index.ts` has no test) |
| CAP-07 | Turning off or changing the shortcut frees the old combination at once | `DT/main/capture-shortcut.test.ts:56-57,64`; `FE/components/capture/capture-shortcut-settings.test.tsx:61,74` | ✅ |
| CAP-08 | `Esse atalho já está em uso`; the shortcut stays off | `DT/main/capture-shortcut.test.ts:71-72,79-80`; `FE/components/capture/capture-shortcut-settings.test.tsx:111-112,124-125` | ✅ |
| CAP-09 | Token: owner's inbox, the token's workspace, origin `mcp`/`api` plus the token | `BE/test/routes/inbox-capture-tokens.test.ts:33-35,44-46` `toMatchObject({ source: 'api', created_via: stringMatching(/^token-/) })` | ✅ |
| CAP-10 | Without `inbox:create`: 403, no item | `BE/test/routes/inbox-capture-tokens.test.ts:72-74,83-84` | ✅ |

### P1 Ver e manter a caixa

| ID | Spec outcome | Evidence | Status |
| --- | --- | --- | --- |
| INBOX-01 | Sidebar count of the user's Atuais; no number at 0 | `BE/test/routes/inbox.test.ts:80-81,96,99`; `FE/components/app-layout.test.tsx:359-361,370-371` | ✅ |
| INBOX-02 | Own items, oldest first, age and origin | `BE/test/routes/inbox.test.ts:78,111` `toEqual([first, second, third])`; `FE/pages/inbox.test.tsx:81-90` | ✅ |
| INBOX-03 | Another user's item is never shown, counted or processed; 404 through the API | `BE/test/routes/inbox.test.ts:88-91` PATCH/discard/restore `toBe(404)`; `BE/test/routes/inbox-send.test.ts:335-337` send 404; `BE/test/routes/inbox-commit.test.ts:133-141` commit with another user's id `toBe(404)`, `backlog()).toEqual([])`, own-only commit → 200 | ✅ (iteration-1 gap closed; N1 killed) |
| INBOX-04 | Discard: out of Atuais, in the Lixeira with the date, **and its draft deleted** | `BE/test/routes/inbox.test.ts:122-125` `list()).toEqual([])`, trash `[id]`, `discarded_at >= before`; `:153-158` trash `draft: null`, restored `draft: null`, next commit `{ tasks: [], groups: [], discarded: [] }`; `:166` Processar discard → `draft: null`; `FE/pages/inbox.test.tsx:162-169` `'Descartado em 13 nov'` | ✅ (N2 killed) |
| INBOX-05 | Restore at the arrival position | `BE/test/routes/inbox.test.ts:140` `toEqual([old, newer])` | ✅ |
| INBOX-06 | Read deletes items discarded **more than** 30 days ago | `BE/test/routes/inbox.test.ts:181-182` fixed clock: exactly 30 days kept `toEqual([kept])`, 30 days + 1 minute deleted `toEqual([])`; `:193-194` | ✅ (M2b and M2c killed) |
| INBOX-07 | `Nada na caixa. Capture o que estiver na cabeça.` | `FE/pages/inbox.test.tsx:190-191` | ✅ |

### P1 Enviar rápido

| ID | Spec outcome | Evidence | Status |
| --- | --- | --- | --- |
| QUICK-01 | Writable, unarchived list select; `HH:MM`; discard | `FE/components/inbox/inbox-row.test.tsx:105-111,120-121` | ✅ |
| QUICK-02 | Stored, survives a reload | `BE/test/routes/inbox.test.ts:204-205`; `FE/components/inbox/inbox-row.test.tsx:136,147-148` | ✅ |
| QUICK-03 | `Enviar` hidden without a list | `FE/components/inbox/inbox-row.test.tsx:127` | ✅ |
| QUICK-04 | Task at the end of Backlog, item removed, one transaction | `BE/test/routes/inbox-send.test.ts:50-53` `title: 'DEV-1701', estimate_minutes: 90, column: 'backlog'`, order `['Antes','DEV-1701']`, `inbox()).toEqual([])` | ✅ |
| QUICK-05 | Invalid `HH:MM` → field invalid, not stored | `FE/components/inbox/inbox-row.test.tsx:158-161`; `BE/test/routes/inbox.test.ts:212-214` | ✅ |
| QUICK-06 | 409, item kept, list cleared | `BE/test/routes/inbox-send.test.ts:230-232,239-242` | ✅ |
| QUICK-07 | Over 255: no `Enviar`; needs Processar | `FE/components/inbox/inbox-row.test.tsx:168,174`; `BE/test/routes/inbox-send.test.ts:258-262` | ✅ |
| QUICK-08 | Row click opens Processar; controls do not | `FE/components/inbox/inbox-row.test.tsx:210,224-226` | ✅ |
| QUICK-09 | Hover: border highlighted, title underlined | `FE/components/inbox/inbox-row.test.tsx:236-237` `toHaveClass('hover:border-primary')`, `group-hover/row:underline` | ✅ ⚠️ CSS classes only |

### P1 Processar como tarefa

| ID | Spec outcome | Evidence | Status |
| --- | --- | --- | --- |
| PROC-01 | Text, origin, age; `Tarefa`; name = text ≤255; the row's list and estimate | `FE/components/inbox/process-dialog.test.tsx:94-100,107` | ✅ |
| PROC-02 | Empty name or no list → disabled and the field marked | `FE/components/inbox/process-dialog.test.tsx:113-116,125-128` | ✅ |
| PROC-03 | No day → Backlog; today **or past** → Hoje; rest of this week (Mon–Sun) → Esta semana; later → Backlog; `Vai para <lista> › <coluna>` | `BE/test/services/decision.test.ts:11-12,16,20-21` (`'2026-11-10'` and `'2026-11-06'` → `'today'`), `:25-26,30`; `FE/lib/inbox/decision.test.ts:10,15,19,23,27-28,32,36`; `FE/components/inbox/process-dialog.test.tsx:134-151` `'Vai para Work (ADSET) › Hoje'` | ✅ (spec changed; both copies tested; N7 killed) |
| PROC-04 | The chosen column wins | `BE/test/routes/inbox-send.test.ts:90-92`; `FE/components/inbox/process-dialog.test.tsx:159,162` | ✅ |
| PROC-05 | Task at the end of the destination with all fields; item removed; one transaction | `BE/test/routes/inbox-send.test.ts:73-83` all fields; `:106-109` order `['Antes','DEV-1701']`, `position).toBe(Math.max(...))`, `inbox()).toEqual([])`; `FE/components/inbox/process-dialog.test.tsx:180-190` | ✅ (iteration-1 gap closed) |
| PROC-06 | Task in Concluídas, done now by the user; item removed | `BE/test/routes/inbox-send.test.ts:197-198`, `:205-207` `column: 'done'`, `completedBy).toBe(owner.id)`, `inbox()).toEqual([])` | ✅ (iteration-1 gap closed) |
| PROC-07 | `Descartar` → Lixeira | `BE/test/routes/inbox-send.test.ts:216-220`; `FE/components/inbox/process-dialog.test.tsx:214-215` | ✅ |
| PROC-08 | Failure keeps item and values; error in the form | `BE/test/routes/inbox-send.test.ts:325-326`; `FE/components/inbox/process-dialog.test.tsx:301-302` alert, `nameField()).toHaveValue('Nome novo')` | ✅ |

### P1 Processar tudo

| ID | Spec outcome | Evidence | Status |
| --- | --- | --- | --- |
| ALL-01 | First item without a decision; `Processar · <n> de <total>`; progress bar | `FE/components/inbox/review-step.test.tsx:114-116,124` | ✅ |
| ALL-02 | Draft saved, nothing on the board, next item opened | `FE/components/inbox/review-step.test.tsx:134-139` | ✅ |
| ALL-03 | `Pular` saves nothing | `FE/components/inbox/review-step.test.tsx:147-148` | ✅ |
| ALL-04 | Review with type, name, priority, destination or `Lixeira`; per-list count and sum | `FE/components/inbox/review-step.test.tsx:164-172,186-189` | ✅ |
| ALL-05 | Review item opens its form; saving returns to the review | `FE/components/inbox/review-step.test.tsx:198-207` | ✅ |
| ALL-06 | All in one transaction; skipped items stay | `BE/test/routes/inbox-commit.test.ts:45-50,58-65` | ✅ |
| ALL-07 | One blocked → nothing sent, 409, each item with its reason | `BE/test/routes/inbox-commit.test.ts:80-84,96-99,106-107`; `FE/components/inbox/review-step.test.tsx:247-251` | ✅ |
| ALL-08 | Drafts kept; reopen at the first without a decision | `FE/components/inbox/review-step.test.tsx:264-267` | ✅ |
| ALL-09 | Sent by row or alone → draft deleted | `BE/test/routes/inbox-commit.test.ts:116-120` | ✅ |

### P1 Lembrete

| ID | Spec outcome | Evidence | Status |
| --- | --- | --- | --- |
| REM-01 | Reminder without estimate, optional day and time, PROC-03 column rules | `BE/test/routes/inbox-send.test.ts:143` `kind: 'reminder', estimate_minutes: null, column: 'backlog'`; `:125,129,133` scheduled today → `'today'`, Sunday → `'this_week'`, next Monday → `'backlog'` | ✅ (iteration-1 gap closed) |
| REM-02 | Field hidden; 422 for an estimate | `BE/test/routes/tasks-fields.test.ts:174-178` `code: 'reminder_estimate'`; `BE/test/routes/inbox-send.test.ts:159-160`; `FE/components/inbox/process-dialog.test.tsx:224` | ✅ |
| REM-03 | Compact card: bell, title, priority, day or time; no checkbox, estimate or time | `FE/components/board/task-card.test.tsx:623-639`; `:647` day only `getByTitle('Sex, 13 nov')).toHaveTextContent(/^Sex$/)`, `:651` `'Sex 10:00'` | ✅ (iteration-1 gap closed) |
| REM-04 | Done completes it | `BE/test/routes/reminders.test.ts:97-99` | ✅ |
| REM-05 | No `Iniciar foco`; 422 through the API | `BE/test/routes/reminders.test.ts:36-38`; `FE/pages/list-board.test.tsx:828,832` `Focus now` disabled and the reminder's menu is exactly `['Move left','Move right','Change list','Schedule','Duplicate','Delete task']`; `FE/components/board/board-column.test.tsx:110,116` | ✅ (iteration-1 gap closed; N5 killed) |
| REM-06 | Agenda marker at the time, no duration | `FE/components/agenda/scheduled-block.test.tsx:151-156`; `BE/test/routes/reminders.test.ts:111-114` | ✅ |

### P1 Grupo de tarefas

| ID | Spec outcome | Evidence | Status |
| --- | --- | --- | --- |
| GRP-01 | Group and tasks in typed order, in the destination | `BE/test/routes/inbox-send.test.ts:176-186` | ✅ |
| GRP-02 | No task → disabled, `Adicione a primeira tarefa` | `FE/components/inbox/process-dialog.test.tsx:245-246` | ✅ |
| GRP-03 | `HH:MM` suffix → estimate | `FE/lib/inbox/decision.test.ts:43-56`; `BE/test/services/decision.test.ts:41,45-46,50-51,55-56` | ✅ |
| GRP-04 | Container with name, `<n> tarefas`, cards in group order | `FE/components/board/group-container.test.tsx:30-31` `/^Pipeline de scripts3 tarefasDEV-1DEV-2DEV-3$/`; `FE/components/board/board-column.test.tsx:373-374` | ✅ |
| GRP-05 | No container without tasks | `FE/components/board/board-column.test.tsx:384` | ✅ |
| GRP-06 | Reorder in the group, across columns | `BE/test/routes/tasks-group-move.test.ts:57-61` `['a','g3','g1','b']` | ✅ |
| GRP-07 | Out of the container → leaves the group | `BE/test/routes/tasks-group-move.test.ts:88-90`; `FE/pages/list-board.test.tsx:1251` | ✅ |
| GRP-08 | Into the container → joins the group | `BE/test/routes/tasks-group-move.test.ts:105-108`; `FE/pages/list-board.test.tsx:1264` | ✅ (but see MODAL-06: a reminder joins too) |
| GRP-09 | Container drag moves the column's group tasks in order | `BE/test/routes/groups.test.ts:108-116`; `FE/pages/list-board.test.tsx:1278-1279` | ✅ |
| GRP-10 | Toast `<grupo> está sem próxima ação` + `Adicionar tarefa` | `FE/pages/list-board.test.tsx:1303,1305,1329` | ✅ |
| GRP-11 | Group tasks behave like normal tasks in focus, Agenda, scheduling, planning and reports | `BE/test/routes/group-tasks.test.ts:51` focus session `{ kind: 'task', task_id }`, `:56-57` spent 600–660 s; `:66` agenda `timed` contains the task; `:76` plan candidate; `:86-88` report `task_seconds` and `by_list`; `BE/test/services/schedule.test.ts:335` scheduling | ✅ (iteration-1 gap closed) ⚠️ the spec still names no per-surface value |

### P1 Prioridade / Prazo / Aguardando / Flag

| ID | Spec outcome | Evidence | Status |
| --- | --- | --- | --- |
| PRI-01 | Enum, default `none`, 422 otherwise | `BE/test/routes/tasks-fields.test.ts:63-74,80-82` | ✅ |
| PRI-02 | Icon only, tooltip/label, four colours and shapes | `FE/components/board/priority.test.tsx:15-26`; `FE/components/board/task-card.test.tsx:495` | ✅ |
| PRI-03 | No icon for `none` | `FE/components/board/priority.test.tsx:32` | ✅ |
| PRI-04 | Same select in Processar, the modal and the group | `FE/components/board/priority.test.tsx:44-53`; `FE/components/board/task-dialog.test.tsx:373`; `FE/components/inbox/process-dialog.test.tsx:171`, `:289` group → `objectContaining({ type: 'group', priority: 'high' })` | ✅ (iteration-1 gap closed) |
| DUE-01 | Day-only due date for tasks and groups | `BE/test/routes/tasks-fields.test.ts:59-60`; `BE/test/routes/inbox-send.test.ts:178` | ✅ |
| DUE-02 | Hourglass + `Prazo <dia>`, neutral | `FE/components/board/task-card.test.tsx:554,562-564` | ✅ ⚠️ "neutral" = `bg-muted` |
| DUE-03 | Yellow `Prazo amanhã` / `Prazo hoje` | `FE/components/board/task-card.test.tsx:555-556`; `FE/lib/board/due.test.ts:39-43` | ✅ |
| DUE-04 | Red `Atrasada · <dia>` | `FE/components/board/task-card.test.tsx:557` | ✅ |
| DUE-05 | Neutral in Concluídas | `FE/components/board/task-card.test.tsx:558`; `FE/lib/board/due.test.ts:23` | ✅ ⚠️ same reading |
| WAIT-01 | Mark + "de quem" ≤100 | `BE/test/routes/tasks-fields.test.ts:59,88-90` | ✅ |
| WAIT-02 | Person icon + `Aguardando · <de quem>` / `Aguardando` | `FE/components/board/task-card.test.tsx:537,541` | ✅ |
| WAIT-03 | Column kept | `BE/test/routes/tasks-fields.test.ts:116-119` | ✅ |
| WAIT-04 | Waiting estimate out of the column header and Hoje's pending estimate | `BE/test/routes/board-fields.test.ts:107-108,126-127`; `FE/pages/list-board.test.tsx:852-855` optimistic sums before the refetch: `'This list has 2 pending tasks, Est.: 1hr 30min'`, Today and This week headers `/^1hr 30min$/` | ✅ (iteration-1 defect fixed; N4 killed) |
| WAIT-05 | Unmarking clears "de quem" | `BE/test/routes/tasks-fields.test.ts:132-133` | ✅ |
| FLAG-01 | Flag + reason ≤200 | `BE/test/routes/tasks-fields.test.ts:59,96-98` | ✅ |
| FLAG-02 | Red border, red flag, reason or `Flag sem motivo` | `FE/components/board/task-card.test.tsx:507-511,517-518` | ✅ |
| FLAG-03 | Red border only for flagged tasks | `FE/components/board/task-card.test.tsx:531` | ✅ |
| FLAG-04 | Removing the flag clears the reason | `BE/test/routes/tasks-fields.test.ts:140` | ✅ |
| FLAG-05 | Done → flag cleared, not restored | `BE/test/routes/tasks-flag-group.test.ts:43-46,61-62`; `BE/test/routes/tasks-fields.test.ts:164-165` | ✅ |
| FLAG-06 | Column, priority, Aguardando kept | `BE/test/routes/tasks-fields.test.ts:155,157` | ✅ |

### P1 Campos do card and Modal

| ID | Spec outcome | Evidence | Status |
| --- | --- | --- | --- |
| FIELDS-01 | Name, estimate, time always | `FE/components/board/task-card.test.tsx:488-490` | ✅ |
| FIELDS-02 | Gear → popover, 4 switches, note | `FE/components/board/card-fields-settings.test.tsx:29-35`; `FE/pages/list-board.test.tsx:1146` | ✅ |
| FIELDS-03 | Server, per user and list, all on by default | `BE/test/routes/card-fields.test.ts:33,40-41,59-61` | ✅ |
| FIELDS-04 | Off → hidden on that list for that user, data kept | `FE/pages/list-board.test.tsx:1151-1155,1172`; `BE/test/routes/card-fields.test.ts:59-61` | ✅ |
| FIELDS-05 | Flag off removes the border | `FE/components/board/task-card.test.tsx:524-525` | ✅ |
| FIELDS-06 | Reminder card and group container with any combination | `FE/components/board/task-card.test.tsx:616-640`; `FE/components/board/group-container.test.tsx:83,89-93` each field off → container, count and card still shown, that field `not.toBeInTheDocument()`, the others shown | ✅ (iteration-1 gap closed) |
| MODAL-01 | Field order | `FE/components/board/task-dialog.test.tsx:370-383` | ✅ |
| MODAL-02 | `+ Flag` with its hint → reason and `Tirar flag` | `FE/components/board/task-dialog.test.tsx:389-406` | ✅ |
| MODAL-03 | Aguardando switch → `De quem` | `FE/components/board/task-dialog.test.tsx:413-416` | ✅ |
| MODAL-04 | Groups + `Sem grupo`; acts like a drag, task at the end of the group | `FE/components/board/task-dialog.test.tsx:425,450,481`; `BE/test/routes/tasks-group-move.test.ts:189-190,201-202` | ✅ |
| MODAL-05 | Save writes the new fields | `FE/components/board/task-dialog.test.tsx:446-455` | ✅ |
| MODAL-06 | A reminder hides Estimativa, Grupo, Subtarefas, Prazo, Flag and Aguardando; **the API refuses those fields on a reminder with 422** | UI: `FE/components/board/task-dialog.test.tsx:513-522` all six `not.toBeInTheDocument()`, `:528-533` the task shows them. API: `BE/test/routes/tasks-fields.test.ts:192-203` PATCH 422 `reminder_field` and nothing stored, `:209-211` create 422, `:217-222` a task accepts them; `BE/test/routes/inbox-send.test.ts:151-153` decision `due_on` 422; `BE/test/mcp/task-fields-tools.test.ts:63-64` | ❌ **`POST /api/tasks/:id/move` with `group_id` puts a reminder in a group (200).** `moveTask` (`BE/src/services/tasks.ts:278-334`, group resolved at `:291-299`) never checks `kind`, and the frontend drop (`FE/components/board/drop-target.ts`, `FE/pages/list-board.tsx`) has no reminder rule. Probe: the move answered `200 {kind: 'reminder', group_id: <group>}`, then `PATCH { title: 'Outro' }` answered `422 reminder_field`, so the reminder can no longer be edited until it is dragged out. No test covers this path. |

### P2 API e MCP, and Edge cases

| ID | Spec outcome | Evidence | Status |
| --- | --- | --- | --- |
| API-01 | 8 fields in `get_board`, `get_task`, REST | `BE/test/routes/tasks-fields.test.ts:59-60`; `BE/test/routes/board-fields.test.ts:59-78`; `BE/test/mcp/task-fields-tools.test.ts:43,45,52-53` | ✅ |
| API-02 | `create_task`/`update_task` store them with the same validations | `BE/test/mcp/task-fields-tools.test.ts:38-40,59-64` | ✅ |
| API-03 | Invalid → 422, nothing stored | `BE/test/routes/tasks-fields.test.ts:80-110`; `BE/test/mcp/task-fields-tools.test.ts:70-89` | ✅ |
| EDGE-01 | Two concurrent sends → one task, 409 to the second | `BE/test/routes/inbox-send.test.ts:271-273` `[200, 409]`; `:313-315` second send interleaved past the pre-check `rejects.toMatchObject({ statusCode: 409, extra: { reason: 'already_processed' } })`, one task, empty inbox | ✅ (M4 killed) |
| EDGE-02 | Archived list → `Lista arquivada`, ALL-07 | `BE/test/routes/inbox-commit.test.ts:81`; `FE/components/inbox/review-step.test.tsx:247` | ✅ |
| EDGE-03 | Restore brings back the list and the estimate | `BE/test/routes/inbox.test.ts:139` | ✅ |
| EDGE-04 | A list change ungroups the task | `BE/test/routes/tasks-flag-group.test.ts:76-78` | ✅ |
| EDGE-05 | Container in Concluídas and open columns, per-column count | `FE/components/board/board-column.test.tsx:407-409` | ✅ |
| EDGE-06 | Schedule badge and due chip both, apart | `FE/components/board/task-card.test.tsx:579-583` | ✅ |
| EDGE-07 | Inbox and count per workspace | `BE/test/routes/inbox.test.ts:237-240` | ✅ |
| EDGE-08 | Leaving the workspace deletes the items | `BE/test/routes/inbox-capture-tokens.test.ts:107-113` | ✅ |

**Total: 102/103 IDs match the spec outcome.** One is ❌ (MODAL-06, the move path).

---

## Spec-precision gaps

1. **DUE-02 / DUE-05**: "neutral colour" has no token. The tests pin `bg-muted`. Carried over from iteration 1.
2. **QUICK-09**: hover can only be proved through CSS classes in jsdom. Carried over.
3. **GRP-11**: the spec still states no observable value per surface. The new tests pick reasonable ones: a focus session `kind: 'task'`, the Agenda `timed` entry, a plan candidate, report `task_seconds`.
4. **CAP-04 with the shortcut rebound** (new, minor): on desktop with the global shortcut on but bound to another combination, Mod+Shift+Space opens nothing inside the app (`FE/hooks/use-capture-hotkey.ts:17-22`). This matches the literal CAP-04, but the spec does not say whether that was intended.

Iteration-1 precision gaps now resolved by the spec change: PROC-03 (past day → Hoje), ALL-09 vs PROC-07 (discard deletes the draft, INBOX-04), INBOX-03 on commit (now 404), and reminder Prazo/Flag (MODAL-06).

---

## Discrimination Sensor

The scratch was `git worktree add --detach <scratchpad>/mut HEAD`, with `node_modules` symlinked. Each mutation was applied by exact-string replacement (one match required), the listed vitest files were run, and the file was restored with `git checkout` inside the scratch. The scratch was then removed with `git worktree remove --force` and `git worktree prune`. The real tree's `git status --porcelain` was empty before and after: the baseline matches.

| # | File (mutated) | Mutation | Tests run | Outcome |
| --- | --- | --- | --- | --- |
| M4 (re-run) | `BE/src/services/inbox.ts:149` | `takeItem` without `if (!taken) throw conflict(...)` | inbox-send, inbox-commit | ✅ Killed (EDGE-01 interleaved test) |
| M2b (re-run) | `BE/src/services/inbox.ts:22` | `TRASH_DAYS` 30 → 29.5 | inbox | ✅ Killed (fixed-clock 30-day test) |
| M2c | `BE/src/services/inbox.ts:22` | `TRASH_DAYS` 30 → 30.5 | inbox | ✅ Killed |
| N1 | `BE/src/services/inbox.ts:301` | commit ownership: `if (foreign) throw notFound()` removed | inbox-commit, inbox-send | ✅ Killed (INBOX-03 commit test) |
| N2 | `BE/src/services/inbox.ts:110` | `discardItem` keeps the draft (`draft: null` removed) | inbox, inbox-commit, inbox-send | ✅ Killed (2 tests) |
| N3a | `BE/src/services/tasks.ts:97` | `reminder_field` guard → `if (false)` | tasks-fields, task-fields-tools | ✅ Killed (3 tests) |
| N3b | `BE/src/services/tasks.ts:97` | `groupId !== null` dropped from the guard | tasks-fields, task-fields-tools | ✅ Killed (2 tests) |
| N3c | `BE/src/services/decision.ts:46` | reminder decision accepts `due_on` | inbox-send, decision | ✅ Killed |
| N4 | `FE/pages/list-board.tsx:146` | optimistic `estimateOf` counts waiting tasks | list-board | ✅ Killed (WAIT-04) |
| N5 | `FE/components/board/board-column.tsx:112` | `Focar agora` disabled on `empty` instead of `nothingToFocus` | board-column, list-board | ✅ Killed (2 tests) |
| N6a | `FE/hooks/use-capture-hotkey.ts:21` | desktop opens the overlay whatever the setting | capture-overlay, command-palette | ✅ Killed (CAP-06) |
| N6b | `FE/hooks/use-capture-hotkey.ts:17` | no desktop check: the overlay always opens | capture-overlay, command-palette | ✅ Killed |
| N7 | `BE/src/services/decision.ts:77` | past day no longer → Hoje (`<=` → `===`) | decision, inbox-send | ✅ Killed |

**Sensor depth**: P0-full manual, with 13 mutations on the fix commits and the two iteration-1 survivors. **Killed: 13/13, survived: 0.**

**Probe (not a mutation):** a throwaway test in the scratch moved a reminder into a group with `POST /api/tasks/:id/move { group_id }`. It answered `200` with `group_id` set, and a later `PATCH { title }` answered `422 reminder_field`. The probe file was deleted before the scratch was removed. This is the evidence for the MODAL-06 ❌.

---

## First-iteration gaps: status

| # | Iteration-1 gap | Status | Evidence |
| --- | --- | --- | --- |
| 1 | WAIT-04 optimistic sums count waiting tasks | ✅ Closed | `FE/pages/list-board.tsx:146`; test `FE/pages/list-board.test.tsx:852-855`; N4 killed |
| 2 | EDGE-01 survivor M4 | ✅ Closed | `BE/test/routes/inbox-send.test.ts:303-316`; M4 killed |
| 3 | INBOX-03 commit answers 409 | ✅ Closed | `BE/src/services/inbox.ts:297-303`; `BE/test/routes/inbox-commit.test.ts:133-141`; N1 killed |
| 4 | INBOX-06 survivor M2b | ✅ Closed | `BE/test/routes/inbox.test.ts:171-182`; M2b and M2c killed |
| 5 | REM-05 UI and `Focar agora` with only reminders | ✅ Closed | `FE/components/board/board-column.tsx:86,112,124`; tests `board-column.test.tsx:110,116`, `list-board.test.tsx:828,832`; N5 killed |
| 6 | PROC-05 / PROC-06 removal and end of column | ✅ Closed | `BE/test/routes/inbox-send.test.ts:106-109,205-207` |
| 7 | REM-01 schedule column / REM-03 day variant | ✅ Closed | `BE/test/routes/inbox-send.test.ts:125,129,133`; `FE/components/board/task-card.test.tsx:647,651` |
| 8 | CAP-04 palette focus / desktop hotkey conflict | ✅ Closed | `FE/components/command-palette.test.tsx:104-105`; `FE/hooks/use-capture-hotkey.ts:17-22`; N6a and N6b killed |
| 9 | FIELDS-06 container / PRI-04 group priority | ✅ Closed | `FE/components/board/group-container.test.tsx:81-93`; `FE/components/inbox/process-dialog.test.tsx:289` |
| 10 | Spec decisions (PROC-03, discard draft, reminder fields) | ✅ Closed by the spec change. MODAL-06 is implemented on create, update and send, but **not on move** (new gap 1) | see MODAL-06 |
| (13) | GRP-11 had no tests for focus, Agenda, planning or reports | ✅ Closed | `BE/test/routes/group-tasks.test.ts:51-88` |

**Closed 10 of 10** ranked gaps, and the 13 iteration-1 partials are all resolved. One new gap was found in the fix itself: the move path of MODAL-06, which T36 put out of scope.

---

## Code Quality (spot-check of the fix diff)

| Check | Status |
| --- | --- |
| Surgical changes | ✅ 6 source files, each tied to a T34–T39 criterion |
| Spec-anchored outcome check | ❌ 102/103 (MODAL-06 move path) |
| Per-layer coverage: routes cover 404, 409 and 422, with an L-048 contrast | ✅ for commit, discard and fields; ❌ no move test for a reminder |
| Every new test maps to an ID | ✅ The test names carry the IDs |
| Guidelines | `CONTRIBUTING.md`, vitest configs, lessons L-048, L-069 to L-072 (applied: interleaved race, minute-boundary trash, optimistic rule, commit owner check) |

---

## Ranked gap list (fix tasks)

1. **MODAL-06 (Major, code defect).** The API accepts a group on a reminder through the move route.
   - **Where:** `backend-node/src/services/tasks.ts:278-299`. `moveTask` resolves `groupId` without checking `current.kind`. The frontend drop (`frontend/src/components/board/drop-target.ts`, `frontend/src/pages/list-board.tsx`) lets a reminder card into a container.
   - **Consequence:** once a reminder is in a group, every later `PATCH`, even a rename, answers 422 `reminder_field` (`tasks.ts:93-99`). The modal hides Grupo for reminders, so the user can only recover by dragging the reminder out.
   - **Fix:**
     - In `moveTask`, answer 422 `reminder_field` when `current.kind === 'reminder'` and the resolved `groupId !== null`. Moving a reminder with `group_id: null`, or with the field left out, stays accepted.
     - Optionally, keep reminders out of container drops in the frontend.
     - Add a test: a reminder moved with `group_id` → 422 with `group_id` still null; the same move for a task → 200 (L-048).

No other gaps remain. The spec-precision notes above are informational and need no code change.

---

## Requirement Traceability Update (proposed)

- ✅ Verified: 102 IDs (every ID except MODAL-06).
- ❌ Needs fix: MODAL-06 (move path).

## Summary

**Overall**: ❌ Not ready (1 gap).
**Spec-anchored check**: 102/103 IDs matched the spec outcome; 4 spec-precision notes.
**Sensor**: 13 mutations, 13 killed, 0 survived (M4 and M2b now killed).
**Gate**:
- backend: 1244 passed, 9 skipped.
- frontend: 2214 passed.
- desktop: 281 passed, 4 skipped.
- lint, typecheck and build: ok.
- The focus-widget test is flaky and pre-existing.

**Next step**: a fix task for MODAL-06's move path, then iteration 3.

**validate_state.py**: exit 1 (`validation.md verdict is FAIL`), as expected for a FAIL report.
