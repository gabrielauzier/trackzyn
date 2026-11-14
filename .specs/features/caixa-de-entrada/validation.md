# Caixa de entrada: validation report

## Validation: caixa-de-entrada - FAIL

**Date**: 2026-11-13
**Spec**: `.specs/features/caixa-de-entrada/spec.md` (103 requirement IDs)
**Diff range**: `7ad8c99..2858734` (35 commits; the feature code starts at `98651d6`, and the docs-only commits `0fff1ea` and `3f9a1b2` are included). 149 files changed (+13 501 / −504); 72 of them are test files (+5 340).
**Verifier**: independent sub-agent (author ≠ verifier). It ran read-only on the real tree, and the mutations ran in a scratch `git worktree`.

**Why FAIL:** two mutants survived (EDGE-01's atomic guard and INBOX-06's 30-day boundary). There is also a code defect against WAIT-04 in the frontend's optimistic sums. 13 ACs are only partly evidenced, and INBOX-03 is broken on `POST /api/inbox/commit`, which answers 409 instead of 404. The gates are green, and 20 of the 22 mutations were killed.

---

## Task Completion

Every task from T1 to T33 (T32 and T33 included) is marked `[x]`. tasks.md has 146 checked boxes and 0 open ones. The deviations recorded in tasks.md are listed below with their effect.

| Deviation (tasks.md) | Effect on the spec |
| --- | --- |
| T11 SPEC_DEVIATION: `parseTaskLine` and `targetColumn` live in `services/decision.ts` and are mirrored in `frontend/src/lib/inbox/decision.ts`, because the repo has no `shared/`. | Two copies can drift. Both are covered by tests, and sensor mutants M12 and M13 were killed. |
| T11: `targetColumn` sends a day already past to Hoje (D31). | This contradicts PROC-03 as written: a past day of the current week should go to Esta semana. Asserted at `frontend/src/lib/inbox/decision.test.ts:19`. Spec-precision gap. |
| T23 SPEC_DEVIATION: `Caixa de entrada` sits at the end of the Workspace section of the sidebar. | Only the design is affected; no spec AC fixes the position. |
| T5 note: `readFocusState` shows a reminder as the focus task. | Fixed by T32 (`backend-node/test/routes/reminders.test.ts:36-38`). |
| T8 note: `applyDueSchedules` without `normalizeBlocks`. | Fixed by T33 (`backend-node/test/services/schedule.test.ts:335`). Sensor mutant M6 was killed. |

---

## Gate Check

| Package | lint | typecheck | test | build |
| --- | --- | --- | --- | --- |
| backend-node | exit 0 | exit 0 | exit 0: 1225 passed, 9 skipped (95 files passed, 1 skipped) | n/a |
| frontend | exit 0 | exit 0 | exit 0: 2199 passed, 0 skipped (192 files) | exit 0 (`vite build` ok) |
| desktop | exit 0 | exit 0 | exit 0: 281 passed, 4 skipped (38 files passed, 1 skipped) | n/a |

- The commands are the Build gate from tasks.md. `test:e2e` was not run, as instructed.
- The skipped tests (9 backend, 4 desktop) are in suites outside the diff. None of the feature's test files is skipped.
- Test integrity: the diff only adds tests and extends fixtures. No feature test was deleted, and no assertion was weakened in the files sampled.

---

## Spec-Anchored Acceptance Criteria

Legend: ✅ the asserted value matches the spec outcome · ◐ PARTIAL (conjunction or payload rule: a clause has no evidence) · ❌ GAP (code contradicts the spec, or no evidence) · ⚠️ spec-precision gap (the spec gives no exact value to compare, or the code deviates from a literal reading).
Paths: `BE/` = `backend-node/`, `FE/` = `frontend/src/`, `DT/` = `desktop/src/`.

### P1 Capturar

| ID | Spec outcome | Evidence `file:line`: assertion | Status |
| --- | --- | --- | --- |
| CAP-01 | Item with the trimmed text, arrival time, origin `app`; field cleared | `BE/test/routes/inbox.test.ts:40-43` `toMatchObject({ text: 'Ligar', source: 'app' })`, `Date.parse(created_at) >= before-1000`; `FE/pages/inbox.test.tsx:117-120` `toHaveBeenCalledWith({ text: 'Ligar para o contador', source: 'app' })`, `field()).toHaveValue('')` | ✅ |
| CAP-02 | No item; the field keeps focus | `BE/test/routes/inbox.test.ts:53-54` `toBe(422)`, `counted()).toBe(0)`; `FE/pages/inbox.test.tsx:128-129` `capture).not.toHaveBeenCalled()`, `field()).toHaveFocus()` | ✅ |
| CAP-03 | 422; `Até 500 caracteres`; text kept | `BE/test/routes/inbox.test.ts:59-61` 501 chars `toBe(422)`, 500 chars `toBe(201)`; `FE/pages/inbox.test.tsx:140-141,151-152` alert `'Até 500 caracteres'`, `toHaveValue(text)` | ✅ |
| CAP-04 | ⌘⇧Space / Ctrl+Shift+Space, the palette and the sidebar open the overlay with the field focused | `FE/components/capture/capture-overlay.test.tsx:41-42,52-53` dialog `Capturar` + `field()).toHaveFocus()` (both combinations); `FE/components/app-layout.test.tsx:395` sidebar → focus; palette: `FE/components/command-palette.test.tsx:82-83` only `onCapture).toHaveBeenCalledTimes(1)` | ◐ palette → overlay with focus not asserted (`FE/components/app-layout.tsx:442` wiring untested) |
| CAP-05 | Esc closes, no item | `FE/components/capture/capture-overlay.test.tsx:83-84` `queryByRole('dialog')).not...`, `capture).not.toHaveBeenCalled()`; `FE/pages/capture-window.test.tsx:73-74` | ✅ |
| CAP-06 | Global shortcut opens the window above the others; origin `desktop` | `DT/main/capture-shortcut.test.ts:37-39` `onPress).toHaveBeenCalledTimes(1)`; `DT/main/capture-window.test.ts:57,84` `alwaysOnTop: true`, `['setAlwaysOnTop', true, 'floating']`; `FE/pages/capture-window.test.tsx:52` `{ text, source: 'desktop' }` | ✅ (the glue at `DT/main/index.ts:292` is untested) |
| CAP-07 | Turning off or changing the shortcut frees the previous combination at once | `DT/main/capture-shortcut.test.ts:56-57,64` `unregister.mock.calls).toEqual([['CommandOrControl+Shift+Space']])`, `[...registered]).toEqual([])`; `FE/components/capture/capture-shortcut-settings.test.tsx:61,74` | ✅ (M20 killed) |
| CAP-08 | `Esse atalho já está em uso`; the shortcut stays off | `DT/main/capture-shortcut.test.ts:71-72,79-80` `{ ok: false, reason: 'in_use' }`, `saved()).toEqual({ enabled: false, ... })`; `FE/components/capture/capture-shortcut-settings.test.tsx:111-112,124-125` `findByText('Esse atalho já está em uso')`, switch `aria-checked 'false'` | ✅ |
| CAP-09 | Token: item in the owner's inbox and the token's workspace, origin `mcp`/`api` plus the token | `BE/test/routes/inbox-capture-tokens.test.ts:33-35,44-46` `toMatchObject({ source: 'api', created_via: stringMatching(/^token-/) })` and the same with `source: 'mcp'` | ✅ |
| CAP-10 | Without `inbox:create`: 403, no item | `BE/test/routes/inbox-capture-tokens.test.ts:72-74,83-84` `toBe(403)`, `{ detail: 'Missing scope: inbox:create' }`, `inbox()).toEqual([])` | ✅ |

### P1 Ver e manter a caixa

| ID | Spec outcome | Evidence | Status |
| --- | --- | --- | --- |
| INBOX-01 | Sidebar `Caixa de entrada` with the count of the user's Atuais; no number at 0 | `BE/test/routes/inbox.test.ts:79-80,95-98` `counted()).toBe(1)`, trash not counted `toBe(0)`; `FE/components/app-layout.test.tsx:359-361,370-371` `'Caixa de entrada, 6 itens'`, badge `/^6$/`, at zero `toHaveTextContent(/^Caixa de entrada$/)` | ✅ |
| INBOX-02 | Own items only, oldest first, with age and origin | `BE/test/routes/inbox.test.ts:110` `toEqual([first, second, third])`, `:77` `toEqual(['Do dono'])`; `FE/pages/inbox.test.tsx:81-90` `'há 3 dias'`, `'ontem'`, `'hoje, 09:12'`, `'via Trackzyn'` | ✅ |
| INBOX-03 | Another user's item is never shown, counted or processed; asking for it through the API gives 404 | `BE/test/routes/inbox.test.ts:77-80` exclusion and count; `:87-90` PATCH, discard and restore `toBe(404)` with the editor's item unchanged; `BE/test/routes/inbox-send.test.ts:242-244` send `toBe(404)` | ◐ `POST /api/inbox/commit` with another user's id answers **409 `already_processed`** (`BE/src/services/inbox.ts:297-299`), not 404, and no test covers it |
| INBOX-04 | Discard: out of Atuais, in the Lixeira with the discard date | `BE/test/routes/inbox.test.ts:120-124` `list()).toEqual([])`, trash `[id]`, `discarded_at >= before`; `FE/pages/inbox.test.tsx:162-169` `'Descartado em 13 nov'` | ✅ |
| INBOX-05 | Restore puts the item back at its arrival position | `BE/test/routes/inbox.test.ts:137-140` order `toEqual([old, newer])` | ✅ |
| INBOX-06 | Reading the inbox deletes items discarded **more than** 30 days ago | `BE/test/routes/inbox.test.ts:153-154` 29 days kept `toEqual([kept])`, 31 days deleted `toEqual([])` | ◐ boundary: mutant M2b (`TRASH_DAYS = 29.5`) **survived**; nothing is tested between 29 and 31 days |
| INBOX-07 | `Nada na caixa. Capture o que estiver na cabeça.` | `FE/pages/inbox.test.tsx:190-191` `findByText('Nada na caixa. Capture o que estiver na cabeça.')` | ✅ |

### P1 Enviar rápido

| ID | Spec outcome | Evidence | Status |
| --- | --- | --- | --- |
| QUICK-01 | List select (writable, unarchived), `HH:MM` estimate, discard | `FE/components/inbox/inbox-row.test.tsx:105-111,120-121` `lists.list).toHaveBeenCalledWith({ archived: false })`, options `['Work (ADSET)','Work (FRETE)']`, viewer gets 0 options | ✅ |
| QUICK-02 | Value stored, survives a reload | `BE/test/routes/inbox.test.ts:163-165` `toMatchObject({ list_id, estimate_minutes: 90 })` after a new GET; `FE/components/inbox/inbox-row.test.tsx:136,147-148` | ✅ |
| QUICK-03 | `Enviar` hidden without a list | `FE/components/inbox/inbox-row.test.tsx:127` `queryByRole('button', { name: /Enviar/ })).not...` | ✅ |
| QUICK-04 | Task with title and estimate at the end of Backlog; item removed; one transaction | `BE/test/routes/inbox-send.test.ts:47-51` `title: 'DEV-1701', estimate_minutes: 90, column: 'backlog'`, order `['Antes','DEV-1701']`, `inbox()).toEqual([])` | ✅ |
| QUICK-05 | Not `HH:MM` 00:01–24:00 → field invalid, value not stored | `FE/components/inbox/inbox-row.test.tsx:158-161` `aria-invalid 'true'`, `update).not.toHaveBeenCalled()`; `BE/test/routes/inbox.test.ts:172-174` 0 and 1441 `toBe(422)` | ✅ |
| QUICK-06 | 409, item kept, its list cleared | `BE/test/routes/inbox-send.test.ts:169-171,178-181` `toBe(409)`, `reason: 'list_archived'` / `'list_read_only'`, inbox `objectContaining({ id, list_id: null })` | ✅ |
| QUICK-07 | Text over 255: no `Enviar`; sending needs Processar | `FE/components/inbox/inbox-row.test.tsx:168,174` (256 → no Enviar, 255 → Enviar); `BE/test/routes/inbox-send.test.ts:197-201` without a name `toBe(422)` | ✅ |
| QUICK-08 | A row click opens Processar; the controls do not | `FE/components/inbox/inbox-row.test.tsx:210,224-226` `'?process=item-1'`, controls → `toBeEmptyDOMElement()` | ✅ |
| QUICK-09 | Hover highlights the border and underlines the title | `FE/components/inbox/inbox-row.test.tsx:236-237` `toHaveClass('hover:border-primary', ...)`, `group-hover/row:underline` | ✅ ⚠️ only the CSS classes are checked |

### P1 Processar como tarefa

| ID | Spec outcome | Evidence | Status |
| --- | --- | --- | --- |
| PROC-01 | Text with origin and age, `Tarefa`, name = text (≤255), the row's list and estimate | `FE/components/inbox/process-dialog.test.tsx:94-100,107` `'Capturado há 3 dias via desktop:'`, `aria-pressed 'true'`, `'01:30'`, 300 chars → `'a'.repeat(255)` | ✅ |
| PROC-02 | Empty name or no list → `Salvar e próximo` disabled and the field marked | `FE/components/inbox/process-dialog.test.tsx:113-116,125-128` `saveButton()).toBeDisabled()`, `aria-invalid 'true'` | ✅ |
| PROC-03 | No day → Backlog; today → Hoje; another day of the week (Mon–Sun, workspace timezone) → Esta semana; later → Backlog; `Vai para <lista> › <coluna>` | `BE/test/services/decision.test.ts:11-25`; `FE/lib/inbox/decision.test.ts:10-32`; `FE/components/inbox/process-dialog.test.tsx:134-151` `'Vai para Work (ADSET) › Hoje'` | ⚠️ the code sends a **past** day of the current week to Hoje (`FE/lib/inbox/decision.ts:13`, asserted at `decision.test.ts:19`; D31), while the literal spec says Esta semana. No test has a UTC date that differs from the workspace date |
| PROC-04 | The column chosen in `Vai para` is used | `BE/test/routes/inbox-send.test.ts:88-90` `column: 'backlog', scheduled_on: today`; `FE/components/inbox/process-dialog.test.tsx:159,162` `column: 'this_week'` | ✅ |
| PROC-05 | Task at the end of the destination with every field; item removed; one transaction | `BE/test/routes/inbox-send.test.ts:70-81` `toMatchObject({ title, column: 'today', priority: 'high', due_on, estimate_minutes: 30, scheduled_on, scheduled_time, notes })`; `FE/components/inbox/process-dialog.test.tsx:180-190` full payload | ◐ end of column and item removal not asserted on this path |
| PROC-06 | Task in Concluídas, done now by the user; item removed | `BE/test/routes/inbox-send.test.ts:145-146` `column: 'done', completed_at: any`, `completedBy).toBe(owner.id)`; `FE/components/inbox/process-dialog.test.tsx:199-205` | ◐ item removal not asserted |
| PROC-07 | `Descartar` sends the item to the Lixeira | `BE/test/routes/inbox-send.test.ts:155-159` trash `[id]`; `FE/components/inbox/process-dialog.test.tsx:214-215` | ✅ |
| PROC-08 | Failure keeps the item and its values; error shown in the form | `BE/test/routes/inbox-send.test.ts:232-233` inbox `objectContaining({ id, text, estimate_minutes: 45 })`; `FE/components/inbox/process-dialog.test.tsx:285-287,297-299` alert, `nameField()).toHaveValue('Nome novo')` | ✅ |

### P1 Processar tudo

| ID | Spec outcome | Evidence | Status |
| --- | --- | --- | --- |
| ALL-01 | First item without a decision; `Processar · <n> de <total>` and a progress bar | `FE/components/inbox/review-step.test.tsx:114-116,124` `'Processar · 1 de 3'`, `getByRole('progressbar')`, `'Processar · 2 de 3'` | ✅ |
| ALL-02 | Draft saved, nothing on the board, next item opened | `FE/components/inbox/review-step.test.tsx:134-139` `update).toHaveBeenCalledWith('i1', { draft: {...} })`, `send`/`commit` not called | ✅ |
| ALL-03 | `Pular` goes on without saving | `FE/components/inbox/review-step.test.tsx:147-148` `update).not.toHaveBeenCalled()` | ✅ |
| ALL-04 | Review: type, name, priority, destination or `Lixeira`; per list, count and sum per column | `FE/components/inbox/review-step.test.tsx:164-172,186-189` `'Work (ADSET) › Backlog'`, `'Lixeira'`, `/Backlog\s*\+2 itens\s*1h 30min/`, `'Confirmar e enviar 2 itens'` | ✅ |
| ALL-05 | A review item opens its form; saving returns to the review | `FE/components/inbox/review-step.test.tsx:198-207` `'Nome guardado'`, back to `'Processar · Revisão'` | ✅ |
| ALL-06 | Everything created and discards trashed in one transaction; skipped items stay | `BE/test/routes/inbox-commit.test.ts:45-50,58-65` `discarded).toEqual([discarded])`, backlog `['DEV-1701 deploy']`, Atuais `[skipped]`, groups `[{ name: 'Pipeline' }]` | ✅ |
| ALL-07 | One item blocked → nothing sent, 409, each item marked with its reason | `BE/test/routes/inbox-commit.test.ts:80-84` `toBe(409)`, `items).toEqual([{ item_id: blocked, reason: 'list_archived' }])`, `backlog()).toEqual([])`, Atuais `[fine, blocked, trashed]`, trash `[]`; `:96-99` `already_processed`; `:106-107` `list_read_only`; `FE/components/inbox/review-step.test.tsx:247-251` `'Lista arquivada'`, `'Nenhum item foi enviado...'` | ✅ (M3 killed) |
| ALL-08 | Drafts kept; the next run opens at the first item without a decision | `FE/components/inbox/review-step.test.tsx:264-267` `commit).not.toHaveBeenCalled()`, reopen at `'Processar · 2 de 3'` | ✅ |
| ALL-09 | Sending by row or alone deletes the draft | `BE/test/routes/inbox-commit.test.ts:117-120` commit after a standalone send `toEqual({ tasks: [], groups: [], discarded: [] })` | ✅ (the standalone **discard** keeps the draft, `BE/src/services/inbox.ts:234-237`; see gaps) |

### P1 Lembrete

| ID | Spec outcome | Evidence | Status |
| --- | --- | --- | --- |
| REM-01 | Reminder without estimate, with optional day and time, and the PROC-03 column rules | `BE/test/routes/inbox-send.test.ts:99-101` `kind: 'reminder', estimate_minutes: null, column: 'backlog'`; `FE/components/inbox/process-dialog.test.tsx:229-236` | ◐ no reminder sent through the inbox with `scheduled_on`, so its column rule is not asserted |
| REM-02 | Field hidden; 422 for an estimate through the API | `BE/test/routes/tasks-fields.test.ts:174-178` `toBe(422)`, `code: 'reminder_estimate'`; `FE/components/inbox/process-dialog.test.tsx:224` | ✅ |
| REM-03 | Compact card: bell, title, priority, day or time; no checkbox, estimate or time spent | `FE/components/board/task-card.test.tsx:623-639` `toHaveClass('lucide-bell')`, `'10:00'`, no checkbox, estimate or time spent | ◐ the "day" variant (no time) is untested |
| REM-04 | Moving it to Concluídas completes it | `BE/test/routes/reminders.test.ts:97-99` `column: 'done', completed_at: any` | ✅ |
| REM-05 | No `Iniciar foco`; 422 through the API | `BE/test/routes/reminders.test.ts:36-38` `toBe(422)`, `'Reminders have no focus'` | ◐ the UI clause has no test (it holds by construction); `Focar agora` stays enabled in a Today with only reminders (`FE/components/board/board-column.tsx:84`) |
| REM-06 | Marker in the Agenda at that time, with no duration block | `FE/components/agenda/scheduled-block.test.tsx:151-156` `'Pagar o DAS, Lembrete · 10:00'`, `[top,height]).toEqual(['1200px','1px'])`; `BE/test/routes/reminders.test.ts:111-114` | ✅ |

### P1 Grupo de tarefas

| ID | Spec outcome | Evidence | Status |
| --- | --- | --- | --- |
| GRP-01 | Group with tasks in typed order, in the destination column | `BE/test/routes/inbox-send.test.ts:126-134` `priority: 'high'`, this_week `[[Mapear,30,g],[Escrever,null,g],...]` | ✅ |
| GRP-02 | Without tasks: disabled, `Adicione a primeira tarefa` | `FE/components/inbox/process-dialog.test.tsx:245-246` | ✅ |
| GRP-03 | `HH:MM` at the end → estimate | `FE/lib/inbox/decision.test.ts:43-56` `{ title: 'Validar', estimate_minutes: 30 }`; `BE/test/services/decision.test.ts` | ✅ (`H:MM` is also accepted) |
| GRP-04 | Container with name and `<n> tarefas`, cards in group order | `FE/components/board/group-container.test.tsx:27-28` `/^Pipeline de scripts3 tarefasDEV-1DEV-2DEV-3$/`; `BE/test/routes/tasks-group-move.test.ts:166` | ✅ |
| GRP-05 | No container in a column without tasks of the group | `FE/components/board/board-column.test.tsx:370` `queryByRole('group', { name: 'Group Pipeline' })).not...`; `FE/lib/board/blocks.test.ts:52` | ✅ (a pure derivation from the board) |
| GRP-06 | Reorder within the group, change column, stay in the group | `BE/test/routes/tasks-group-move.test.ts:57-61,71-74` `['a','g1','g2','b']`; `FE/components/board/drop-target.test.ts:100,104` | ✅ (M7 killed) |
| GRP-07 | Dropped outside the container: leaves the group, at that position | `BE/test/routes/tasks-group-move.test.ts:88-90` `group_id: null`, `['g1','a','g2','b']`; `FE/pages/list-board.test.tsx:1211` | ✅ |
| GRP-08 | Loose task into the container: enters the group at that position | `BE/test/routes/tasks-group-move.test.ts:105-108` `['a','g1','x','g2','b']`; `FE/pages/list-board.test.tsx:1224` | ✅ |
| GRP-09 | The column's tasks of the group move, in the same order | `BE/test/routes/groups.test.ts:108-116` `[['g1','today'],['g2','today'],['g3','today']]`, today `['a','g1','g2','g3','b']`; `FE/pages/list-board.test.tsx:1238-1239` | ✅ (M9 killed) |
| GRP-10 | Toast `<grupo> está sem próxima ação` + `Adicionar tarefa`; nothing blocked | `FE/pages/list-board.test.tsx:1263,1265,1289` `toBe('Pipeline está sem próxima ação')`, `toBe('Adicionar tarefa')`; `BE/test/routes/tasks-group-move.test.ts:134` | ✅ |
| GRP-11 | Group tasks behave like normal tasks in focus, Agenda, scheduling, planning and reports | `BE/test/services/schedule.test.ts:335` (scheduling only) | ◐ ⚠️ no precise outcome, and no test for focus, Agenda, planning or reports |

### P1 Prioridade / Prazo / Aguardando / Flag

| ID | Spec outcome | Evidence | Status |
| --- | --- | --- | --- |
| PRI-01 | `none\|low\|medium\|high\|ultra`, default `none`, 422 otherwise | `BE/test/routes/tasks-fields.test.ts:63-74,80-82` default `'none'`, `urgent` → `toBe(422)`; `BE/test/db/caixa-de-entrada-schema.test.ts:78` | ✅ |
| PRI-02 | Icon without text, tooltip and label `Prioridade alta`, the four colours and shapes | `FE/components/board/priority.test.tsx:15-26` `text-blue-500 lucide-chevron-down` … `text-rose-500 lucide-chevrons-up`; `FE/components/board/task-card.test.tsx:495` | ✅ |
| PRI-03 | No icon for `none` | `FE/components/board/priority.test.tsx:32` `toBeEmptyDOMElement()` | ✅ |
| PRI-04 | Same select in Processar, the modal and the group | `FE/components/board/priority.test.tsx:44-53` `['Nenhuma','Baixa','Média','Alta','Ultra']`; `FE/components/board/task-dialog.test.tsx:373`; `FE/components/inbox/process-dialog.test.tsx:171` | ◐ no test picks a priority for a group |
| DUE-01 | Day-only due date, independent of the schedule, for tasks and groups | `BE/test/routes/tasks-fields.test.ts:59-60` `due_on: '2026-11-20'`; `BE/test/routes/inbox-send.test.ts:126` | ✅ |
| DUE-02 | Hourglass + `Prazo <dia>`, neutral colour | `FE/components/board/task-card.test.tsx:554,562-564` `'Prazo 20 nov','bg-muted'`, `svg.lucide-hourglass` | ✅ ⚠️ "neutral" read as `bg-muted` |
| DUE-03 | Yellow `Prazo amanhã` / `Prazo hoje` (workspace timezone) | `FE/components/board/task-card.test.tsx:555-556` `'text-amber-700'`; `FE/lib/board/due.test.ts:39-43` | ✅ |
| DUE-04 | Red `Atrasada · <dia>` | `FE/components/board/task-card.test.tsx:557` `'Atrasada · 10 nov','text-rose-700'` | ✅ |
| DUE-05 | Neutral in Concluídas | `FE/components/board/task-card.test.tsx:558` `'done','Prazo 10 nov','bg-muted'`; `FE/lib/board/due.test.ts:23` | ✅ ⚠️ same "neutral" reading (M19 killed) |
| WAIT-01 | Mark + "de quem" ≤100 | `BE/test/routes/tasks-fields.test.ts:59,88-90` 100 ok, 101 → `toBe(422)` | ✅ |
| WAIT-02 | Person icon + `Aguardando · <de quem>` or `Aguardando` | `FE/components/board/task-card.test.tsx:537,541` `svg.lucide-user-round`, `/^Aguardando$/` | ✅ |
| WAIT-03 | Column kept | `BE/test/routes/tasks-fields.test.ts:116-119` `column: 'this_week', position: 0` | ✅ |
| WAIT-04 | Waiting estimate left out of the column header and of Hoje's pending estimate | `BE/test/routes/board-fields.test.ts:107-108,126-127` `today.estimate_minutes).toBe(60)`, `pending.estimate_minutes).toBe(60)` | ❌ the server is right (M11 killed), but the frontend's optimistic `withEstimate`/`estimateOf` (`FE/pages/list-board.tsx:145,157-161`) adds waiting tasks back into every sum after an inline estimate edit, until the refetch. No test covers it |
| WAIT-05 | Unmarking clears "de quem" | `BE/test/routes/tasks-fields.test.ts:132-133` `waiting: false, waiting_for: null` | ✅ |
| FLAG-01 | Flag + reason ≤200 | `BE/test/routes/tasks-fields.test.ts:59,96-98` | ✅ |
| FLAG-02 | Red border, red flag under the title, reason or `Flag sem motivo` | `FE/components/board/task-card.test.tsx:507-511,517-518` `border-rose-600`, `svg.lucide-flag` `text-rose-500`, `'Flag sem motivo'` | ✅ (a flagged **reminder** never shows it: `FE/components/board/reminder-card.tsx:51`) |
| FLAG-03 | Red border only for flagged tasks | `FE/components/board/task-card.test.tsx:531` `not.toHaveClass('border-rose-600')` | ✅ |
| FLAG-04 | Removing the flag clears the reason | `BE/test/routes/tasks-fields.test.ts:140` `flagged: false, flag_reason: null` | ✅ |
| FLAG-05 | Done → flag and reason cleared; reopening doesn't restore them | `BE/test/routes/tasks-flag-group.test.ts:43-46,61-62`; `BE/test/routes/groups.test.ts:129`; `BE/test/routes/tasks-fields.test.ts:164-165` `flag_on_done` | ✅ (M10 killed) |
| FLAG-06 | Column, priority and Aguardando kept | `BE/test/routes/tasks-fields.test.ts:155,157` | ✅ |

### P1 Campos do card (AD-011) and Modal

| ID | Spec outcome | Evidence | Status |
| --- | --- | --- | --- |
| FIELDS-01 | Name, estimate and time always shown | `FE/components/board/task-card.test.tsx:488-490` `loaded.innerHTML).toBe(plain.innerHTML)` | ✅ |
| FIELDS-02 | Gear → `Campos do card`, 4 switches, the note | `FE/components/board/card-fields-settings.test.tsx:29-35` heading, `toHaveLength(4)`, `'Nome, estimativa e tempo registrado aparecem sempre.'`; `FE/pages/list-board.test.tsx:1106` | ✅ |
| FIELDS-03 | Per user and per list on the server; all on by default | `BE/test/routes/card-fields.test.ts:33,40-41,59-61` `{ hidden: [] }` → `['due','waiting']`, another list and another user `[]` | ✅ |
| FIELDS-04 | Turned off → hidden on that list, for that user, data kept | `FE/pages/list-board.test.tsx:1111-1115,1132`; `BE/test/routes/card-fields.test.ts:59-61` | ✅ |
| FIELDS-05 | Flag off also removes the red border | `FE/components/board/task-card.test.tsx:524-525` | ✅ (M15 killed) |
| FIELDS-06 | Reminder card and group container with any combination | `FE/components/board/task-card.test.tsx:616-640` reminder with ALL and NONE | ◐ the group container has no fields test |
| MODAL-01 | Order: Título, Flag, Prioridade+Estimativa, Prazo+Grupo, Aguardando, Anotações, footer, Agendamento, Subtarefas | `FE/components/board/task-dialog.test.tsx:370-383` `follows(order[index], element)).toBe(true)` | ✅ |
| MODAL-02 | `+ Flag` with its hint; click shows the reason field and `Tirar flag` | `FE/components/board/task-dialog.test.tsx:389-406` | ✅ |
| MODAL-03 | Aguardando switch shows `De quem` | `FE/components/board/task-dialog.test.tsx:413-416` | ✅ |
| MODAL-04 | List groups + `Sem grupo`; the change acts like a drag and puts the task at the end of the group | `FE/components/board/task-dialog.test.tsx:425,450,481` `['Sem grupo','Pipeline','Portal']`; `BE/test/routes/tasks-group-move.test.ts:189-190,201-202` `['g1','b','a']` | ✅ |
| MODAL-05 | Save writes priority, due, group, waiting and flag | `FE/components/board/task-dialog.test.tsx:446-455` `tasks.update(TASK, { priority: 'medium', due_on, group_id, waiting: true, waiting_for, flagged: true, flag_reason })` | ✅ |
| MODAL-06 | A reminder hides Estimativa, Grupo and Subtarefas | `FE/components/board/task-dialog.test.tsx:513-516` | ✅ |

**AD-011 on/off matrix** (`FE/components/board/task-card.test.tsx`). Each field-ignore mutant (M15–M18) was killed.

| Field | ON | OFF |
| --- | --- | --- |
| Prioridade | :495 | :501 |
| Prazo | :559-564 | :569 |
| Flag + red border | :507-509, :517-518 | :524-525 |
| Aguardando | :537, :541 | :545 |

### P2 API e MCP, and Edge cases

| ID | Spec outcome | Evidence | Status |
| --- | --- | --- | --- |
| API-01 | The 8 fields in `get_board`, `get_task` and REST reads | `BE/test/routes/tasks-fields.test.ts:59-60`; `BE/test/routes/board-fields.test.ts:59-78`; `BE/test/mcp/task-fields-tools.test.ts:41-50` | ✅ |
| API-02 | `create_task`/`update_task` store them with the same validations | `BE/test/mcp/task-fields-tools.test.ts:38-40,57-59` | ✅ |
| API-03 | Invalid value → 422, nothing stored | `BE/test/routes/tasks-fields.test.ts:80-110` `toBe(422)` with the state unchanged; `BE/test/mcp/task-fields-tools.test.ts:66-86` | ✅ |
| EDGE-01 | Two concurrent sends → one task, 409 to the second | `BE/test/routes/inbox-send.test.ts:209-212` `Promise.all`, `toSorted()).toEqual([200, 409])`, backlog `['DEV-1701']` | ◐ mutant M4 (the `DELETE … RETURNING` guard in `takeItem`, `BE/src/services/inbox.ts:149`, removed) **survived**: PGlite serialises the two requests, and the pre-check `findSendable` answers the 409, so the real race is never exercised |
| EDGE-02 | Archived list → `Lista arquivada`, ALL-07 | `BE/test/routes/inbox-commit.test.ts:81`; `FE/components/inbox/review-step.test.tsx:247` | ✅ |
| EDGE-03 | Restore brings back the list and the estimate | `BE/test/routes/inbox.test.ts:138` `toMatchObject({ list_id: listId, estimate_minutes: 90, discarded_at: null })` | ✅ |
| EDGE-04 | A list change takes the task out of its group | `BE/test/routes/tasks-flag-group.test.ts:76-78` `group_id: null` | ✅ |
| EDGE-05 | Container in Concluídas and in the open columns, per-column count | `FE/components/board/board-column.test.tsx:392-396` `'2 tasks'` / `'1 task'` | ✅ |
| EDGE-06 | Schedule badge and due chip both shown, separately | `FE/components/board/task-card.test.tsx:579-583` `schedule.contains(due)).toBe(false)` | ✅ |
| EDGE-07 | Inbox and count per workspace | `BE/test/routes/inbox.test.ts:197-200` A `['Do A']`, B `['Do B']`, each count 1 | ✅ |
| EDGE-08 | Leaving the workspace deletes the user's items | `BE/test/routes/inbox-capture-tokens.test.ts:107-113` | ✅ |

**Total: 89/103 ACs matched the spec outcome.** 12 are PARTIAL (CAP-04, INBOX-03, INBOX-06, PROC-05, PROC-06, REM-01, REM-03, REM-05, GRP-11, PRI-04, FIELDS-06, EDGE-01), 1 is a GAP (WAIT-04), and 1 is a spec deviation (PROC-03).

---

## Spec-precision gaps

1. **PROC-03**: the literal text sends "another day of the current week (Mon–Sun)" to Esta semana. The code sends a past day to Hoje (D31, AD-009 settling). The spec should state the past-day rule.
2. **DUE-02 / DUE-05**: "neutral colour" has no token. The tests pin `bg-muted`.
3. **QUICK-09**: hover is only provable through CSS classes.
4. **GRP-11**: "tarefas comuns em foco, Agenda, …, relatórios" has no observable outcome per surface.
5. **ALL-09 vs PROC-07**: the spec doesn't say whether a standalone **discard** deletes the draft. The code keeps it (`BE/src/services/inbox.ts:234-237`), so a restored item is picked up again by the next commit.
6. **INBOX-03 on commit**: the spec says 404 for another user's item. The commit route answers 409 `already_processed` (`BE/src/services/inbox.ts:297-299`). It also gives the same misleading reason for your own item that has no draft.
7. **DUE-01 / FLAG-02 vs reminders**: the task modal offers Prazo, Flag and Aguardando on a reminder (`FE/components/board/task-dialog.test.tsx:517-520`), but the reminder card never shows them, and DUE-01 limits Prazo to tasks and groups.

---

## Discrimination Sensor

Scratch: `git worktree add <scratchpad>/mut HEAD`, with `node_modules` symlinked. Each mutation was applied, the relevant vitest files were run, and the file was restored with `git checkout` inside the scratch. The scratch was then removed with `git worktree remove --force`. The real tree's `git status --porcelain` was empty before and after (baseline match confirmed). The unmutated scratch suites passed (for example, 55/55 for the AD-013 set).

| # | File (mutated) | Mutation | Tests run | Outcome |
| --- | --- | --- | --- | --- |
| M1 | `BE/src/services/inbox.ts:26` | `ofOwner` drops the `userId` filter (workspace only) | inbox, inbox-send | ✅ Killed (3 failed) |
| M2 | `BE/src/services/inbox.ts:22` | `TRASH_DAYS` 30 → 32 | inbox | ✅ Killed |
| M2b | `BE/src/services/inbox.ts:22` | `TRASH_DAYS` 30 → 29.5 (deletes items discarded under 30 days ago) | inbox | ❌ **Survived** |
| M3 | `BE/src/services/inbox.ts` commitDrafts | `refusals.length > 0` → `> 999` (never refuses the batch) | inbox-commit | ✅ Killed (3 failed) |
| M4 | `BE/src/services/inbox.ts:149` | `takeItem` without the `already_processed` guard | inbox-send, inbox-commit | ❌ **Survived** |
| M5 | `BE/src/services/groups.ts:38` | `normalizeBlocks` returns ids unchanged | AD-013 set | ✅ Killed (5 failed, for example `expected ['a','g1','b','g2'] to equal ['a','g1','g2','b']`) |
| M6 | `BE/src/services/schedule.ts:162` | `applyDueSchedules` without `normalizeBlocks` | AD-013 set | ✅ Killed |
| M7 | `BE/src/services/tasks.ts:318` | `moveTask` writes the order without `normalizeBlocks` | AD-013 set | ✅ Killed |
| M8 | `BE/src/services/tasks.ts:388` | `duplicateTask` without `placeAtEndOfGroup` | AD-013 set | ✅ Killed |
| M9 | `BE/src/services/groups.ts` moveGroupBlock | block iterated in reverse | AD-013 set | ✅ Killed |
| M10 | `BE/src/services/tasks.ts:312` | the flag is not cleared on done | tasks-flag-group, tasks-fields, groups | ✅ Killed (3 failed) |
| M11 | `BE/src/services/board.ts:119` | waiting tasks counted in the sums | board-fields, board (route and service) | ✅ Killed (3 failed) |
| M12 | `BE/src/services/decision.ts:76` | week end exclusive (`<=` → `<`) | decision, inbox-send | ✅ Killed |
| M13 | `FE/lib/inbox/decision.ts:15` | week end `7 - weekday` → `6 - weekday` | decision, process-dialog | ✅ Killed |
| M15 | `FE/components/board/task-card.tsx:75` | the Flag toggle is ignored | task-card, list-board | ✅ Killed (FIELDS-01, FIELDS-05) |
| M16 | `FE/components/board/task-card.tsx:165` | the Prioridade toggle is ignored | task-card, list-board | ✅ Killed |
| M17 | `FE/components/board/task-card.tsx:76` | the Prazo toggle is ignored | task-card, list-board | ✅ Killed |
| M18 | `FE/components/board/task-card.tsx:77` | the Aguardando toggle is ignored | task-card, list-board | ✅ Killed |
| M19 | `FE/lib/board/due.ts:12` | `done` no longer neutral | due, task-card | ✅ Killed (3 failed) |
| M20 | `DT/main/capture-shortcut.ts:29` | the previous accelerator is not unregistered | capture-shortcut | ✅ Killed (4 failed) |
| M21 | `DT/main/index.ts:1` | adds a `'globalShortcut'` mention (AD-012 exception) | widget-shortcut | ✅ Killed (WIDGET-05 test) |
| M22 | new `DT/main/sneaky.ts` | `import { globalShortcut } from 'electron'` | widget-shortcut | ✅ Killed (WIDGET-05 test) |

**Sensor depth**: P0-full manual, with 22 mutations. **Killed: 20/22, survived: 2.**

WIDGET-05 guard (`DT/main/widget-shortcut.test.ts:117-123`): it lists `readdirSync(__dirname)` at runtime, takes every `.ts` file that is not a test, and exempts only `capture-shortcut.ts`. Any mention outside comments fails it. Proven by M21 and M22. Its residual blind spots are subdirectories of `src/main`, non-`.ts` extensions, `preload/` and `shared/`, and computed property access.

---

## Code Quality (spot-check)

| Check | Status |
| --- | --- |
| Surgical changes and existing patterns | ✅ The "Also touched" notes explain every extra file |
| Spec-anchored outcome check | ⚠️ 89/103 |
| Per-layer coverage: routes cover 404 (another user), 403, 409 and 422 | ⚠️ commit with another user's id is untested and answers 409 |
| Every test maps to an AC | ✅ The test names carry the IDs |
| Guidelines | `CONTRIBUTING.md`, the vitest configs, lessons L-044 and L-048 (followed: another user's item and another list are tested) |

---

## Edge Cases

- [x] EDGE-02 to EDGE-08 are handled and evidenced.
- [ ] EDGE-01: the behaviour is right in PGlite, but the test can't tell the atomic guard from a pre-check (M4 survived).

---

## Ranked gap list (fix tasks)

1. **WAIT-04 (Major, code defect).** `FE/pages/list-board.tsx:145,157-161`: `estimateOf` counts waiting tasks in the optimistic column and pending sums. Fix: skip `task.waiting`, as the server does at `BE/src/services/board.ts:119`, and add a test that edits an estimate inline with a waiting task in the column.
2. **EDGE-01 (Major, surviving mutant M4).** The concurrency test doesn't reach `takeItem`'s guard. Fix: add a test that calls the send service twice with the pre-check bypassed, or that interleaves the two transactions, so that removing the `if (!taken)` guard fails it.
3. **INBOX-03 (Major).** `POST /api/inbox/commit` with another user's `item_id` answers 409 `already_processed` (`BE/src/services/inbox.ts:297-299`); the spec says 404. Fix: answer 404, or define the commit's contract in the spec, and add a test with another user's item.
4. **INBOX-06 (Minor, surviving mutant M2b).** There is no item between 29 and 31 days. Fix: add items at 30 days minus 1 minute (kept) and 30 days plus 1 minute (deleted).
5. **REM-05 UI (Minor).** No test proves a reminder card offers no `Iniciar foco`. `Focar agora` stays enabled when Today has only reminders (`FE/components/board/board-column.tsx:84`).
6. **PROC-05 / PROC-06 (Minor).** Assert that the item leaves the inbox and that the task lands at the end of its column on these paths.
7. **REM-01 / REM-03 (Minor).** No reminder is sent with a schedule (column rule), and the reminder card's "day" variant is untested.
8. **CAP-04 (Minor).** Palette → overlay opens with the field focused is not asserted. Possible desktop conflict, not verified at runtime: the global `CommandOrControl+Shift+Space` is the same combination as the in-app overlay hotkey, so in the desktop main window it may open the capture window instead of the overlay.
9. **FIELDS-06 / PRI-04 (Minor).** No fields test for the group container, and no group priority selection in Processar.
10. **Spec decisions needed:** PROC-03 past days, the ALL-09 discard draft, and reminder Prazo/Flag (see Spec-precision gaps).

---

## Requirement Traceability Update (proposed)

- ✅ Verified: the 89 IDs marked ✅ above.
- ❌ Needs fix: WAIT-04, EDGE-01, INBOX-03, INBOX-06, REM-05, PROC-05, PROC-06, REM-01, REM-03, CAP-04, FIELDS-06, PRI-04, GRP-11.
- ⚠️ Spec decision: PROC-03.

## Summary

**Overall**: ❌ Not ready.
**Spec-anchored check**: 89/103 ACs matched the spec outcome; 7 spec-precision gaps flagged.
**Sensor**: 22 mutations, 20 killed, 2 survived.
**Gate**: backend 1225 passed / frontend 2199 passed / desktop 281 passed; lint, typecheck and build ok.
