# Caixa de entrada: validation report

## Validation: caixa-de-entrada - FAIL

**Iteration**: 3 (of at most 3, so this goes to the user)
**Date**: 2026-11-13
**Spec**: `.specs/features/caixa-de-entrada/spec.md` (103 requirement IDs; includes the user's decisions of 2026-11-13 on PROC-03, MODAL-06, CAP-04/CAP-06 and INBOX-04)
**Diff ranges**: feature `7ad8c99..356c342` (45 commits, 153 files, +14 939 / −526); fix of this iteration `HEAD~1..HEAD` = `356c342` (T41, 6 files, +85 / −4)
**Verifier**: independent sub-agent (author ≠ verifier). It ran read-only on the real tree. The mutations and the probe ran in a scratch `git worktree`.

**Why FAIL:** T41 closes the move gap of iteration 2. Every write path now refuses a group, due day, flag or Aguardando on a reminder: create, PATCH, move, group block, inbox send and commit, the three MCP tools, duplicate and the board drop. All 10 new mutants were killed.

One part of MODAL-06 is still not met: **Subtarefas**. The spec says "a API SHALL recusar com 422 esses campos num lembrete". The fields it lists are Estimativa, Grupo, Subtarefas, Prazo, Flag and Aguardando. The assumptions table repeats it: "Campos do lembrete … sem … grupo e subtarefas".

No code refuses a subtask on a reminder. A scratch probe confirmed it:
- create with `subtasks` → 201;
- `POST /api/tasks/:id/subtasks` → 201;
- `PATCH { kind: 'reminder' }` on a task that has a subtask → 200.

Iteration 2 missed this: T36 listed only four of the six fields, and the estimate is already covered by REM-02. It is not a regression of T41.

---

## Gate Check

| Package | lint | typecheck | test | build |
| --- | --- | --- | --- | --- |
| backend-node | exit 0 | exit 0 | exit 0: 1246 passed, 9 skipped (96 files passed, 1 skipped) | n/a |
| frontend | exit 0 | exit 0 | exit 0 on rerun: 2215 passed (192 files); see note | exit 0 (`vite build`) |
| desktop | exit 0 | exit 0 | exit 0: 281 passed, 4 skipped (38 files passed, 1 skipped) | n/a |

- **Frontend test note:** the first run executed in parallel with the backend and desktop suites, and it exited 1.
  - Three tests failed: `components/admin-route.test.tsx` "files and components redirect a non-admin home", `pages/agenda.test.tsx` "AGENDA-02 …" and `pages/showcase/showcase.test.tsx` "renders every section of the catalogue".
  - The errors were element-not-found waits and a 5000 ms timeout. That pattern fits CPU load, not an assertion mismatch.
  - The full suite, run alone right after, exited 0 with 2215/2215.
  - Neither `admin-route` nor `showcase` is in the feature diff. `agenda.test.tsx` changed 8 lines in the feature, and it passed on the rerun.
  - Classification: load-induced timing failures, not a feature defect.
  - `focus-widget.test.tsx`, the known flaky test, passed in both runs.
- Test integrity: backend went from 1244 to 1246 (+2: T41's two move tests), frontend from 2214 to 2215 (+1: T41's drop test), and desktop is unchanged. No test was deleted or weakened.
- Skipped tests (9 backend, 4 desktop) are in suites outside the diff, as in iterations 1 and 2.

---

## Task Completion

T1–T41 are all `[x]` in tasks.md. T41's Done-when items are met:
- move 422 with a contrast case: `BE/test/routes/tasks-group-move.test.ts:207-222`;
- a reminder without a group still moves: `:224-230`;
- `dropTarget` keeps a reminder out of groups: `FE/components/board/drop-target.test.ts:130-143`.

---

## MODAL-06 write-path table

Fields: G = group, D = due day, F = flag, W = Aguardando, S = subtasks (E = estimate is REM-02, guarded by `BE/src/services/tasks.ts:91`).

| Path | Entry | Guard | G/D/F/W refused? | Evidence |
| --- | --- | --- | --- | --- |
| Create | `POST /api/tasks` → `createTask` (`BE/src/services/tasks.ts:162`) | `resolveFields` `BE/src/services/tasks.ts:93-99` | ✅ 422 `reminder_field` | test `BE/test/routes/tasks-fields.test.ts:209-211`; probe: create with each of `due_on`, `flagged`, `waiting`, `group_id` → `[422, reminder_field]` |
| PATCH | `PATCH /api/tasks/:id` → `updateTaskAndSchedule` → `updateTask` (`BE/src/services/tasks.ts:236-244`) | `resolveFields` (also catches `kind: 'reminder'` on a task that has G/D/F/W, since the current values are checked) | ✅ | `BE/test/routes/tasks-fields.test.ts:192-203`; mutants A4–A6 and iteration-2 N3a/N3b killed |
| Move | `POST /api/tasks/:id/move` (`BE/src/routes/tasks.ts:344-348`) → `moveTask` | **new** `BE/src/services/tasks.ts:300-302` `groupId !== null && current.kind === 'reminder'` → 422; the move cannot set D/F/W, and entering done only clears the flag | ✅ | `BE/test/routes/tasks-group-move.test.ts:214-221` (422, still `backlog` and `group_id: null`, task → 200), `:224-230`; mutants A1–A3 killed |
| Group block | `POST /api/groups/:id/move` → `moveGroupBlock` (`BE/src/services/groups.ts:84`) | selects only `tasks.groupId = group.id` (`:98`) and calls `moveTask` with no `group` (`:103-104`), so the group is kept, and a reminder never has one; the `moveTask` guard applies anyway | ✅ by construction | probe: a reminder in the source column stayed `this_week`, `group_id: null` after the block move (200) |
| Inbox send | `POST /api/inbox/:id/send` → `applyDecision` (`BE/src/services/inbox.ts:173-221`) | the reminder schema allows no group, flag or Aguardando keys (`BE/src/services/decision.ts:39-47`), and `due_on` must be null (`:46`); `createTask` → `resolveFields` is the backstop | ✅ | `BE/test/routes/inbox-send.test.ts:151-153` (`due_on` → 422); iteration-2 N3c killed |
| Inbox commit | `POST /api/inbox/commit` → `commitDrafts` (`BE/src/services/inbox.ts:287`) → `applyDecision` | drafts are parsed by the same `decisionSchema` on save (`BE/src/routes/inbox.ts:126`), and the same `applyDecision` runs | ✅ | same as send |
| MCP `create_task` | `createTaskFromToken` → `createTask` (`BE/src/services/task-intake.ts:79`) | `resolveFields` | ✅ | `BE/test/mcp/task-fields-tools.test.ts:63-64` |
| MCP `update_task` | `updateTaskAndSchedule` (`BE/src/mcp/tools.ts:169`) | `resolveFields` | ✅ | `BE/test/mcp/task-fields-tools.test.ts:63-64` |
| MCP `move_task` | `BE/src/mcp/tools.ts:176-183`: `moveTaskBody` has no `group_id`, and `moveTask` is called without `group` | keeps the current group (null for a reminder); the `moveTask` guard applies anyway | ✅ by construction | code reading |
| `duplicateTask` | `POST /api/tasks/:id/duplicate` (`BE/src/services/tasks.ts:351-403`) | copies the source's G/D/W and clears F; a reminder source has none of them, because every other path refuses them | ✅ by invariant | probe: duplicating a reminder → `[201, 'reminder', group_id null, due_on null, flagged false, waiting false]` |
| Move to another list | `moveTaskToList` (`BE/src/services/tasks.ts:411`) | sets `groupId: null` | ✅ | `BE/test/routes/tasks-flag-group.test.ts:76-78` (EDGE-04) |
| Frontend drop | `dropTarget` (`FE/components/board/drop-target.ts:82,91,95`) | `joins()` turns a group into `undefined` for a reminder, on a container and on a group card; a column drop gives `outside`, which is `undefined` for a loose reminder | ✅ | `FE/components/board/drop-target.test.ts:130-143`; mutants B1–B4 killed |
| **Subtasks (S)** | create `subtasks: [...]` (`BE/src/services/tasks.ts:174,229-230`); `POST /api/tasks/:id/subtasks` → `createSubtask` (`BE/src/services/subtasks.ts:27-43`, no `kind` check); MCP `add_subtask` (`BE/src/mcp/tools.ts:186-195`, same service); `PATCH { kind: 'reminder' }` keeps existing subtasks | **none** | ❌ | probe: create → `[201, 1 subtask]`; add subtask → 201; kind change → `[200, 'reminder', 1]`. No test. |

---

## Spec-Anchored Acceptance Criteria

Legend: ✅ the asserted value matches the spec outcome · ❌ the code contradicts the spec · ⚠️ spec-precision note (the spec gives no exact value).
Paths: `BE/` = `backend-node/`, `FE/` = `frontend/src/`, `DT/` = `desktop/src/`. Line numbers are at `356c342`. The fix commit changed only `BE/src/services/tasks.ts` (3 lines added after line 299), `FE/components/board/drop-target.ts`, and appended or inserted new tests, so every iteration-2 citation outside those spots still holds.

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
| GRP-08 | Into the container → joins the group | `BE/test/routes/tasks-group-move.test.ts:105-108`; `FE/pages/list-board.test.tsx:1264`; contrast for a task in the reminder test `BE/test/routes/tasks-group-move.test.ts:219-221` and `FE/components/board/drop-target.test.ts:142` | ✅ (a reminder no longer joins: see MODAL-06) |
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
| MODAL-06 | A reminder hides Estimativa, Grupo, Subtarefas, Prazo, Flag and Aguardando; **the API refuses those fields on a reminder with 422** | UI: `FE/components/board/task-dialog.test.tsx:513-522` all six `not.toBeInTheDocument()`, `:528-533` the task shows them. API, group/due/flag/Aguardando: `BE/test/routes/tasks-fields.test.ts:192-203` PATCH 422 `reminder_field`, nothing stored; `:209-211` create 422; `:217-222` a task accepts them; `BE/test/routes/inbox-send.test.ts:151-153`; `BE/test/mcp/task-fields-tools.test.ts:63-64`; **move (T41)** `BE/test/routes/tasks-group-move.test.ts:214-221` `statusCode).toBe(422)`, `code: 'reminder_field'`, `read('r')).toMatchObject({ column: 'backlog', group_id: null })`, a task → 200 in the group; `:224-230` a reminder still moves with no `group_id` or `null`; drop `FE/components/board/drop-target.test.ts:130-143` `group: undefined` on `group:`, `container:` and a group card. API, **Subtarefas: no guard, no test** | ❌ **Subtasks are not refused on a reminder.** Probe in scratch: `POST /api/tasks {kind:'reminder', subtasks:['s1']}` → **201 with 1 subtask**; `POST /api/tasks/:id/subtasks` on a reminder → **201**; `PATCH {kind:'reminder'}` on a task with a subtask → **200**, kind `reminder`, subtask kept. The group/due/flag/Aguardando part is now closed on every path (see the write-path table). |

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

**Total: 102/103 IDs match the spec outcome.** One is ❌: MODAL-06, now only for Subtarefas (the move path is fixed).
---

## Spec-precision gaps

1. **DUE-02 / DUE-05**: "neutral colour" has no token. The tests pin `bg-muted`. Carried over.
2. **QUICK-09**: hover can only be proved through CSS classes in jsdom. Carried over.
3. **GRP-11**: the spec states no observable value per surface. The tests pick a focus session `kind: 'task'`, the Agenda `timed` entry, a plan candidate and report `task_seconds`. Carried over.
4. **CAP-04 with the shortcut rebound**: on desktop with the global shortcut on but bound to another combination, Mod+Shift+Space opens nothing in the app (`FE/hooks/use-capture-hotkey.ts:17-22`). This matches the literal spec; whether it was intended is not stated. Carried over.

---

## Discrimination Sensor

The scratch was `git worktree add --detach <scratchpad>/mut HEAD`, with `node_modules` symlinked. Each mutation was:
- applied by exact-string replacement, with exactly one match required;
- run against the listed vitest files;
- reverted with `git checkout` inside the scratch.

The scratch was then removed with `git worktree remove --force` and `git worktree prune`. The real tree's `git status --porcelain` was empty before and after: the baseline matches.

| # | File:line (mutated) | Mutation | Tests run | Outcome |
| --- | --- | --- | --- | --- |
| A1 | `BE/src/services/tasks.ts:300` | the move guard removed (`if (false)`) | tasks-group-move, tasks-fields, task-fields-tools | ✅ Killed (1 test) |
| A2 | `BE/src/services/tasks.ts:300` | `kind === 'reminder'` → `kind !== 'reminder'` | tasks-group-move | ✅ Killed (7 tests) |
| A3 | `BE/src/services/tasks.ts:300` | guard on `target.group === null` instead of the resolved `groupId !== null` | tasks-group-move | ✅ Killed (2 tests) |
| A4 | `BE/src/services/tasks.ts:97` | `flagged` dropped from the reminder guard | tasks-fields, task-fields-tools | ✅ Killed (2 tests) |
| A5 | `BE/src/services/tasks.ts:97` | `waiting` dropped from the reminder guard | tasks-fields, task-fields-tools | ✅ Killed (2 tests) |
| A6 | `BE/src/services/tasks.ts:97` | `dueOn !== null` dropped from the reminder guard | tasks-fields, task-fields-tools | ✅ Killed (3 tests) |
| B1 | `FE/components/board/drop-target.ts:82` | `joins` always returns the group | drop-target, list-board | ✅ Killed (1 test) |
| B2 | `FE/components/board/drop-target.ts:82` | `kind === 'reminder'` → `kind !== 'reminder'` | drop-target, list-board | ✅ Killed (11 tests) |
| B3 | `FE/components/board/drop-target.ts:91` | container drop without `joins` | drop-target | ✅ Killed (1 test) |
| B4 | `FE/components/board/drop-target.ts:95` | card drop without `joins` | drop-target | ✅ Killed (1 test) |

**Sensor depth**: P0-full manual on MODAL-06, with 10 mutations covering every branch of the new guards and the reminder clause of `resolveFields`. **Killed: 10/10, survived: 0.** Iteration 2's 13 mutants were all killed, and the code they target did not change.

**Unguarded path, no mutant possible:** the subtask path has no guard to mutate. A probe stands in for it.

**Probe (not a mutation):** a throwaway test in the scratch exercised a reminder through the following, and it was deleted before the scratch was removed:
- create with each field;
- `POST /subtasks`;
- `PATCH kind`;
- `duplicate`;
- `POST /api/groups/:id/move`.

The results are quoted in the write-path table.

---

## Code Quality (fix diff `356c342`)

| Check | Status |
| --- | --- |
| Surgical changes | ✅ 2 source files, 3 + 4 lines, each tied to T41 |
| Matches patterns | ✅ reuses `fieldError(..., 'reminder_field')` and the `outside`/`groupOf` drop logic |
| Spec-anchored outcome check | ✅ for the move path (422 `reminder_field`, state unchanged); ❌ MODAL-06 Subtarefas is still open |
| Per-layer coverage with an L-048 contrast | ✅ a reminder is refused while a task is accepted (backend and drop) |
| Every new test maps to an ID | ✅ named `MODAL-06` |
| Guidelines | `CONTRIBUTING.md`, vitest configs, lessons L-048, L-076 (applied to G/D/F/W, not to subtasks) |

---

## Ranked gap list

1. **MODAL-06, Subtarefas (Minor to Major, code defect; escalated because this is iteration 3 of 3).**
   - **The gap:** the API accepts subtasks on a reminder.
   - **Where:**
     - `backend-node/src/services/tasks.ts:162-233`: `createTask` stores `input.subtasks` for any kind;
     - `backend-node/src/services/subtasks.ts:27-43`: `createSubtask` has no `kind` check, and it serves both `POST /api/tasks/:id/subtasks` and MCP `add_subtask`;
     - `resolveFields`, `BE/src/services/tasks.ts:84-120`: it lets `kind: 'reminder'` through on a task that has subtasks.
   - **Consequence:** the reminder modal hides Subtarefas (`FE/components/board/task-dialog.test.tsx:513-522`), so subtasks created through the API or MCP become invisible data on a reminder.
   - **Proposed fix:**
     - answer 422 `reminder_field` in these three places: `createTask` with `kind: 'reminder'` and a non-empty `subtasks`; `createSubtask` on a reminder; and a kind change to `reminder` on a task that has subtasks;
     - add tests for each, with the L-048 contrast of a task that accepts them.
   - **Alternative:** the user narrows MODAL-06 so it no longer lists Subtarefas for the API.

The spec-precision notes above are informational and need no code change.

---

## Requirement Traceability Update (proposed)

- ✅ Verified: 102 IDs (every ID except MODAL-06).
- ❌ Needs fix: MODAL-06 (Subtarefas through the API). The group, due day, flag and Aguardando part is verified on every write path.

## Summary

**Overall**: ❌ Not ready (1 gap). This is the 3rd iteration, so the gap goes to the user.
**Spec-anchored check**: 102/103 IDs matched the spec outcome; 4 spec-precision notes.
**MODAL-06 write paths**: 12/12 guarded for G/D/F/W; subtasks unguarded on 3 entries.
**Sensor**: 10 mutations this iteration, 10 killed, 0 survived.
**Gate**:
- backend: 1246 passed, 9 skipped.
- frontend: 2215 passed on the standalone rerun; the first, parallel run had 3 timing failures outside the feature.
- desktop: 281 passed, 4 skipped.
- lint, typecheck and build: ok.

**validate_state.py**: exit 1 (`validation.md verdict is FAIL`), as expected for a FAIL report.
