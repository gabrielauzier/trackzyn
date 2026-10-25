# Widget de foco no desktop: validação (iteração 1)

**Data**: 2026-10-25
**Spec**: `.specs/features/widget-desktop/spec.md`
**Intervalo do diff**: `6c52002..HEAD` (HEAD = `a77ee5a`, 15 commits, 50 arquivos, +3124/−154)
**Verificador**: sub-agente independente (autor ≠ verificador)

## Veredito: PASS ✅ (com ressalvas)

Os gates do macOS estão verdes: lint, typecheck e testes do desktop e do frontend, o build do frontend e o `test:e2e` completo. A suíte do frontend rodou 3 vezes, com 882 de 882 em cada. Os 24 ACs têm prova `arquivo:linha` com o valor da spec: **24/24 ✅**. O sensor rodou **36 mutações**: 35 morreram e 1 é equivalente com o renderer atual (E03, justificada abaixo). Nenhuma sobreviveu.

Ressalvas, que não reprovam mas precisam de decisão:
1. **O CI Linux (`xvfb-run`) não rodou**, nem pelo autor nem aqui. A T12 marca esse Done when como feito. No Linux, o e2e prova WIDGET-19 só até "o ouvinte `restore` está ligado".
2. **Edge Case do título em até 1 s**: no único caminho possível com o widget aberto (outro dispositivo), a atualização vem do polling de 15 s (AD-003). Isso é uma lacuna de precisão da spec, não um defeito do código.
3. **E03**: a guarda `fromMain` de `focus:state` em `index.ts:271` não tem teste próprio. Hoje ela é equivalente, porque o widget nunca informa o foco.

---

## Conclusão das tasks

| Task | Status | Notas |
| ---- | ------ | ----- |
| T1 Ponte do widget | ✅ Done | 22 membros em `TrackzynApi`; `e2e/security.spec.ts` fixa a lista |
| T2 Janela do widget | ✅ Done | - |
| T3 Posição do widget | ✅ Done | - |
| T4 Controle do widget | ✅ Done | - |
| T5 Atalho do widget | ✅ Done | - |
| T6 Ganchos do desktop | ✅ Done | - |
| T7 Sons só numa janela | ✅ Done | - |
| T8 Controles do widget | ✅ Done | - |
| T9 Anotações no widget | ✅ Done | - |
| T10 Página do widget | ✅ Done | - |
| T11 Recolher pela tela de foco e pelo quadro | ✅ Done | FOCUS-01 de `foco-e-sons` ajustada no mesmo intervalo (linha de Assumptions "Ícone de recolher") |
| T12 Montagem e e2e | ⚠️ Done com ressalva | O Done when pede o spec "no macOS local e no CI Linux com `xvfb-run`"; a Nota diz que o CI Linux não foi conferido. Este Verificador também não rodou o Linux (veja Gate) |

---

## Gate

Todos os comandos rodados em sequência, sem nada em paralelo, no checkout real (macOS, Darwin 25.5.0).

| Comando | Exit | Resultado |
| ------- | ---- | --------- |
| `npm --prefix desktop run lint` | 0 | - |
| `npm --prefix desktop run typecheck` | 0 | - |
| `npm --prefix desktop test` (sozinho) | 0 | 35 arquivos; **248 passaram, 3 pulados** (251) |
| `npm --prefix frontend run lint` | 0 | - |
| `npm --prefix frontend run typecheck` | 0 | - |
| `npm --prefix frontend test` (1ª) | 0 | 110 arquivos; **882 de 882** |
| `npm --prefix frontend test` (2ª) | 0 | 882 de 882 |
| `npm --prefix frontend test` (3ª) | 0 | 882 de 882 |
| `npm --prefix frontend run build` | 0 | - |
| `npm --prefix desktop run test:e2e` (macOS) | 0 | **52 passaram, 2 pulados**, 2,0 min; `widget.spec.ts:46` passou em 16,0 s |

**Pulados (todos anteriores à feature, nenhum arquivo do diff)**:
- desktop unit: `src/main/backup.test.ts:178` (`it.skipIf(... getuid() === 0)` / win32), `scripts/packaged-local.test.ts:16` e `scripts/fuses.test.ts:27` (`context.skip()` sem pacote gerado). `scripts/import-crash.test.ts` passou rodado sozinho.
- e2e: `real-server.spec.ts:77` e `:84` (`test.skip(!SERVER_URL)`, precisam de `TRACKZYN_E2E_SERVER_URL`).

**Contagem de testes**: desktop 248 passaram + 3 pulados (o diff adiciona 54 testes `it(` e troca 1 título, então antes eram 194, o mesmo número da validação de `foco-e-sons`). Frontend 882 (o diff adiciona 62 `it(`/`it.each` e não remove nenhum). e2e: 1 teste novo (`widget.spec.ts:46`, com 7 passos).

**Integridade**: nenhum teste removido. O único `it(` retirado do diff é o título `exposes exactly fifteen members…` de `preload/index.test.ts`, trocado pelo da nova contagem (22). Nenhuma asserção existente foi afrouxada: o teste antigo de som da janela principal (`gate.test.ts:35`) ganhou `windowRole` e `onWidgetState` no objeto falso e mantém `toBe(true)`.

### CI Linux (`xvfb-run`): não rodado

O CI Linux não foi rodado nem pelo autor (Nota da T12) nem aqui. Lendo `desktop/e2e/widget.spec.ts`:

- `linux = process.platform === 'linux'` (`:11`) desliga as 3 conferências de `isMinimized` (`:72`, `:113`, `:158`).
- `restoreMainBySystem` (`:38-44`) no Linux não restaura a janela: faz `main.emit('restore')`.

Consequência para cada AC no Linux:
- **WIDGET-19**: no Linux o e2e só prova que o ouvinte `restore` do controlador está ligado no app montado (o evento é emitido à mão). Não prova que uma restauração de verdade pela barra de tarefas gera esse evento, nem que a janela volta. A prova com restauração real (`main.restore()`) existe só no macOS, e mesmo lá é uma restauração programática, não um clique no Dock. No Linux e no Windows, a prova de WIDGET-19 é a de unidade (`widget-controller.test.ts:242-254`, `restore` e `show`) mais esse ouvinte ligado.
- **WIDGET-01 e WIDGET-04** (minimizar a principal): no Linux o e2e não confere a minimização; fica só a prova de unidade (`widget-controller.test.ts:124`).
- **SYNC-08 com o widget aberto** (`:158`): no Linux não se confere que a principal volta antes do diálogo; a mensagem do diálogo (`:154`) é conferida nas duas plataformas.
- Como o spec nunca rodou no Linux, não se sabe se ele passa lá (por exemplo, o `sendInputEvent` do atalho com `control`).

---

## Critérios de aceite (spec-anchored)

Linhas citadas no estado de `a77ee5a`.

### P1: Widget sempre visível

| Critério | Resultado definido na spec | `arquivo:linha` + asserção | Resultado |
| -------- | -------------------------- | -------------------------- | --------- |
| WIDGET-01 `Focar agora` no desktop abre o widget e minimiza a principal | widget aberto **e** principal minimizada | `frontend/src/pages/list-board.test.tsx:377-394` - `findByText('Focus page {"collapse":true}')`; `frontend/src/pages/focus.test.tsx:294-304` - `expect(bridge.collapseFocus).not.toHaveBeenCalled()` antes da resposta do `start` e `toHaveBeenCalledTimes(1)` depois; `desktop/src/main/widget-controller.test.ts:121,123,124` - `createWindow.mock.calls toEqual [[CORNER]]`, `isOpen() toBe(true)`, `mainWindow.isMinimized() toBe(true)`; e2e `desktop/e2e/widget.spec.ts:68-72` - clique em `Focus now`, widget com o título e `mainMinimized(app) toBe(true)` (só macOS) | ✅ |
| WIDGET-02 Ícone de recolher abre o widget e minimiza | `collapseFocus` → `open()` + minimizar | `focus.test.tsx:286-292` - clique em `Collapse`, `bridge.collapseFocus toHaveBeenCalledTimes(1)`; `widget-controller.test.ts:120-124` (mesmo `open()`); `desktop/src/main/index.ts:276-278` liga `focus:collapse` a `widget.open()` só para a principal (o e2e passa pelo mesmo canal em `widget.spec.ts:68`) | ✅ |
| WIDGET-03 Minimizar com tarefa em foco (contando ou pausada) abre o widget | abre com `active` e `running` true ou false | `widget-controller.test.ts:159-170` - para `{active:true,running:true}` e `{active:true,running:false}`, `createWindow toHaveBeenCalledTimes(1)` e `isOpen() toBe(true)`; `frontend/src/components/app-layout.test.tsx:310-316` - tela de foco com tarefa pausada informa `{ active: true, running: false }`; `app-layout.test.tsx:224` - tarefa contando informa `{ active: true, running: true }` | ✅ |
| WIDGET-04 `Ctrl+Shift+F` / `⌘+Shift+F` com a principal ativa e foco abre o widget e minimiza | combinação por plataforma; abre; `preventDefault` | `desktop/src/main/widget-shortcut.test.ts:44-58` - win32/linux com `control`, darwin com `meta`: `controller.open toHaveBeenCalledTimes(1)`, `preventDefault toHaveBeenCalledTimes(1)`; `:84-89` sem foco ativo não abre e não chama `preventDefault`; e2e `widget.spec.ts:110-113` - atalho na principal, `widgetCount toBe(1)` e principal minimizada (macOS) | ✅ |
| WIDGET-05 Com outro app ativo, as teclas chegam a ele | nenhum `globalShortcut`; só a entrada da janela | `widget-shortcut.test.ts:113-120` - `webContents.on` só com `['before-input-event']` e nenhum arquivo de `desktop/src/main` (sem comentários) contém `globalShortcut`; `:91-111` 11 combinações vizinhas passam sem `preventDefault` | ✅ |
| WIDGET-06 Janela sem moldura, acima de todas, arrastável | `frame:false`, `alwaysOnTop` (`floating`), 300×64, arrastável | `desktop/src/main/widget-window.test.ts:61-71` - `options toEqual {x:40,y:50,width:300,height:64,frame:false,alwaysOnTop:true,resizable:false,skipTaskbar:true,fullscreenable:false}`; `:93-105` - `['setAlwaysOnTop', true, 'floating']` (e `setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true})` no macOS); `frontend/src/components/focus/widget-controls.test.tsx:202-205` - fundo com `[-webkit-app-region:drag]` e cada botão dentro de `no-drag`; e2e `widget.spec.ts:80-82` - `isAlwaysOnTop() toBe(true)`, `isResizable() toBe(false)`, `{width:300,height:64}` | ✅ |
| WIDGET-07 Sem o mouse, só título (com reticências) e cronômetro | título `truncate`, cronômetro, 0 botões | `widget-controls.test.tsx:46-49` - `toHaveClass('truncate')`, `timer toHaveTextContent('00:25:07')`, `queryAllByRole('button') toEqual([])`; `:57-59` volta a 0 botões quando o mouse sai | ✅ |
| WIDGET-08 Com o mouse, os 6 controles | `Intervalo`, `Anotações`, `Pausar`/`Retomar`, `Pular`, `Concluir`, `Expandir` | `widget-controls.test.tsx:77` - `buttonNames() toEqual(['Break','Notes','Pause','Skip','Complete','Expand'])`; `:85` - `['Break','Notes','Resume','Skip','Complete','Expand']` | ✅ |
| WIDGET-09 Primeira abertura no canto superior direito da tela da principal, com margem | x = direita − 300 − 16, y = topo + 16, na tela da principal | `desktop/src/main/widget-bounds.test.ts:14-16` - `{x:1920-300-16,y:16}` e, na 2ª tela, `{x:1920+1440-300-16,y:25+16}`; `widget-controller.test.ts:128-133` - tela escolhida pela janela principal; e2e `widget.spec.ts:83-84` - `bounds.x toBe(area.x+area.width-300-16)`, `bounds.y toBe(area.y+16)` | ✅ |
| WIDGET-10 Última posição, inclusive depois de reiniciar | posição salva e reaberta; sobrevive a recriar o store | `widget-bounds.test.ts:61-72` - `createConfigStore(file)` novo devolve `{x:1500,y:40,width:300,height:64}`; `widget-controller.test.ts:316-328` - salva 500 ms depois do `move` e reabre em `{x:500,y:600}`; `:330-338` salva ao fechar antes do prazo; e2e `widget.spec.ts:122-125` (config em disco `toMatchObject({x:120,y:140})`) e `:138-141` (reabre em `{x:120,y:140}`) | ✅ |
| WIDGET-11 Posição fora de todas as telas → posição inicial | volta ao canto | `widget-bounds.test.ts:38-40` - tela desconectada → `{x:1604,y:16,width:300,height:64}`; `:32-35` as bordas exatas (`x=1920`, `x=-300`, `y=1080`, `y=-64` → canto; `1919`, `-299`, `1079`, `-63` ficam) | ✅ |

### P1: Ações pelo widget

| Critério | Resultado definido na spec | `arquivo:linha` + asserção | Resultado |
| -------- | -------------------------- | -------------------------- | --------- |
| WIDGET-12 `Pausar`, `Retomar`, `Pular`, `Concluir`, `Intervalo` seguem as regras da tela de foco | mesmas ações de `useFocus` | `widget-controls.test.tsx:108-117` - `pause toHaveBeenCalledTimes(1)`, `skip/complete toHaveBeenCalledWith(TASK.id)`; `:125` `start toHaveBeenCalledWith(TASK.id)` (Retomar); `:132` Pular desabilitado com 1 pendente (FOCUS-07); `:145` `takeBreak toHaveBeenCalledWith(10)`; `:155-157` intervalo com `['End break','Expand']` (BREAK-04); `frontend/src/pages/focus-widget.test.tsx:132-133` - `sent() toEqual([objectContaining({type:'pause',list_id:LIST})])` e o botão vira `Resume`; e2e `widget.spec.ts:94-96` - `Resume` no widget e `GET /api/focus` com `session toBeNull()` | ✅ |
| WIDGET-13 Em `00:00:00`, com o mouse, `Estender` e `Concluir` com os outros | só com o mouse; `Estender` + `Concluir` | `widget-controls.test.tsx:165-167` - sem mouse, `00:00:00` e 0 botões; `:174-178` - `['Extend','Complete','Break','Notes','Skip','Expand']`, `extend/complete toHaveBeenCalledWith(TASK.id)`. Sem `Pausar`/`Retomar` nesse estado (Nota da T8: não há sessão para pausar) | ✅ |
| WIDGET-14 `Anotações` aumenta o widget e mostra o campo com as anotações | `resizeWidget('notes')` → 300×240; campo com o texto atual | `frontend/src/components/focus/widget-notes.test.tsx:51-54` - `toHaveValue('Ask Ana for the numbers')`, `resizeWidget.mock.calls toEqual([['notes']])`, campo com foco; `widget-controller.test.ts:342-348` - `notes` → `{...CORNER,height:240}`, `compact` → `CORNER` | ✅ |
| WIDGET-15 Perder o foco salva; o texto aparece igual no diálogo da tarefa | `PATCH` só no `blur`; mesma consulta do diálogo invalidada | `widget-notes.test.tsx:62-68` - depois de digitar e sair, `tasks.update.mock.calls toEqual([['task-a',{notes:'Numbers from Ana arrived'}]])` (uma chamada só) e `resizeWidget toEqual([['notes'],['compact']])`; `:78` - `invalidateQueries({queryKey:['lists']})`, prefixo de `taskKey = ['lists','tasks',id]` (`frontend/src/components/board/use-task.ts:8`) que o diálogo lê; `focus-widget.test.tsx:201-203` avisa a principal; `frontend/src/lib/api.test.ts:105` prova o HTTP de `tasks.update` | ✅ |
| WIDGET-16 Concluir a última tarefa de Hoje deixa o widget aberto com `Tudo limpo` e `Expandir` | widget aberto; `Tudo limpo`; `Expandir` | `focus-widget.test.tsx:177-179` - `findByText('All clear')`, botão `Expand`, `expandFocus not.toHaveBeenCalled()`; `widget-controls.test.tsx:186-190` (com e sem mouse, `['Expand']`) | ✅ |
| WIDGET-17 Tarefa excluída, fora de Hoje ou lista arquivada → fecha o widget e mostra o quadro | `expandFocus('task_left')` → principal restaurada em `/lists/<id>` | `focus-widget.test.tsx:166` - `expandFocus.mock.calls toEqual([['task_left']])`; `widget-controller.test.ts:228-232` - widget destruído, principal não minimizada, focada e `loaded toEqual(['app://trackzyn/lists/list-1'])`; `:235-239` sem lista conhecida → `app://trackzyn/`. Os três casos chegam ao widget como a tarefa sumindo de Hoje sem conclusão (`frontend/src/lib/focus/task-left.ts:7-11`, a mesma regra da FOCUS-15) | ✅ |

### P1: Voltar ao app e sincronia

| Critério | Resultado definido na spec | `arquivo:linha` + asserção | Resultado |
| -------- | -------------------------- | -------------------------- | --------- |
| WIDGET-18 `Expandir` fecha o widget e restaura a principal em primeiro plano na tela de foco | widget fechado; principal restaurada, mostrada, focada, em `/focus/<id>` | `widget-controller.test.ts:197-204` - `isDestroyed() toBe(true)`, `isMinimized() toBe(false)`, `shown toBe(1)`, `focused toBe(1)`, `widget:state {open:false}`; `:213` - `loaded toEqual(['app://trackzyn/focus/list-1'])` quando a principal estava em outra tela; `focus-widget.test.tsx:188` - `expandFocus.mock.calls toEqual([[undefined]])`; e2e `widget.spec.ts:103-105` - 0 widgets, principal não minimizada, `toHaveURL('app://trackzyn/focus/<id>')` | ✅ |
| WIDGET-19 Restaurar a principal pela barra de tarefas/Dock fecha o widget | widget fechado; nada mais (sem navegar nem focar) | `widget-controller.test.ts:242-254` - para `restore` e `show`: `isDestroyed() toBe(true)`, `isOpen() toBe(false)`, `focused toBe(0)`, `loaded toEqual([])`, `widget:state {open:false}`; e2e `widget.spec.ts:115-116` - `widgetCount toBe(0)` (macOS com `main.restore()`; Linux só com `emit('restore')`, veja "CI Linux") | ✅ (macOS + unidade; Linux só o ouvinte) |
| WIDGET-20 O atalho com o widget ativo faz o mesmo que `Expandir` | `close('expand')` | `widget-shortcut.test.ts:66-73` - linux e darwin, `close.mock.calls toEqual([['expand']])`, `open not.toHaveBeenCalled()`; e2e `widget.spec.ts:131-134` - atalho no widget, 0 widgets, principal não minimizada, URL da tela de foco | ✅ |
| WIDGET-21 Fechar pelo sistema (`⌘W`, `Alt+F4`) = `Expandir`, sem encerrar a sessão | principal restaurada e focada; nada pede pausa | `widget-controller.test.ts:265-277` - `widget().close()` → `isMinimized() toBe(false)`, `focused toBe(1)`, `sent toEqual([['widget:state',{open:true}],['widget:state',{open:false}]])` (nenhum pedido de pausa); `:280-288` `render-process-gone` faz o mesmo | ✅ |
| WIDGET-22 Uma ação numa janela aparece na outra em até 1 s, sem recarregar | só a outra janela recebe; ≤ 1 s | `widget-controller.test.ts:361-372` - `focus:changed` da principal só no widget e vice-versa; `focus-widget.test.tsx:131` e `focus.test.tsx:330-337` - `notifyFocusChanged toHaveBeenCalledTimes(1)` depois da resposta; `focus-widget.test.tsx:153-156` e `app-layout.test.tsx:342-356` - o evento refaz o `GET` (`calls.length toBe(reads+1)` / `toHaveBeenCalledTimes(2)`) sem recarregar; e2e `widget.spec.ts:90-93` - pausar no widget mostra `Resume` na principal com `timeout: 1000` e `Date.now()-clicked toBeLessThanOrEqual(1000)` | ✅ |
| WIDGET-23 Com o widget aberto, cada som toca só no widget, uma vez | widget `true`, principal `false`; volta com o widget fechado | `frontend/src/lib/sounds/gate.test.ts:43-53` - widget `toBe(true)`, principal `toBe(false)`; `:55-63` - fechado → principal `toBe(true)`; `:65-71` - a principal ouve o `widget:state` antes do primeiro som; `focus-widget.test.tsx:142` - concluir no widget `play.mock.calls toEqual([['complete']])` | ✅ |
| WIDGET-24 No navegador: sem ícone de recolher, sem atalho, sem `window.trackzyn` | ícone ausente; nada quebra | `focus.test.tsx:126` - `queryByRole('button',{name:'Collapse'}) not.toBeInTheDocument()` sem ponte; `focus.test.tsx:348-355` - `Focar agora` no navegador começa a tarefa e `window.trackzyn toBeUndefined()`; `frontend/src/lib/desktop/focus-window.test.tsx:28-38` - `isDesktop() false`, `windowRole() 'main'`, `collapseFocus/expandFocus` resolvem `undefined`, `useWidgetOpen() false`; `gate.test.ts:29-33` toca no navegador. O atalho só existe no processo principal do Electron (`before-input-event`), que não roda no navegador | ✅ |

**Status**: 24/24 ✅. Ressalva de plataforma em WIDGET-19 (e na minimização de WIDGET-01/-04) no Linux, registrada acima.

### Regra payload/conjunção

- Os ACs com "e" (WIDGET-01, -02, -04, -18, -21) têm as duas metades afirmadas: abrir **e** minimizar; fechar **e** restaurar, focar e navegar.
- As cargas são afirmadas por valor: `widget:state {open}`, `close('expand')`, `expandFocus('task_left')`, `tasks.update('task-a', {notes})`, `focus.send` com `type` e `list_id`, as opções da `BrowserWindow`, os bounds.

---

## Edge Cases

- [x] **Minimizar sem tarefa em foco não abre o widget**: `widget-controller.test.ts:172-181` (para `undefined`, `{active:false}`, `null`, `'x'`, `{active:'yes'}`: `createWindow not.toHaveBeenCalled()` e a janela minimizada) e `:183-189`; na página, `app-layout.test.tsx:296-307` (quadro sem sessão: todas as chamadas `{active:false,running:false}`) e `:317-329` (sessão de outro dispositivo). No main, `index.ts:270-274` só aceita `focus:state` da principal.
- [x] **Servidor sem resposta a uma ação no widget**: `focus-widget.test.tsx:206-220` (recusa 409 aparece no widget com `Try again`, o widget cresce `[['notes']]` e volta `[['notes'],['compact']]`) e `:222-236` (ação de mais de 24h descartada, aviso no widget, nada enviado).
- [ ] ⚠️ **Título muda com o widget aberto → novo título em até 1 s**: `focus-widget.test.tsx:147-156` prova que um `focus:changed` refaz a leitura e mostra `DEV-1725 renamed`. Mas nenhuma tela que renomeia a tarefa chama `notifyFocusChanged` (só `pages/focus.tsx:59`, `pages/focus-widget.tsx:79,119`). E com o widget aberto a principal fica minimizada: restaurá-la fecha o widget (WIDGET-19). Então o título só pode mudar por outro dispositivo, e aí vale o polling de 15 s (`frontend/src/lib/focus/use-focus.tsx:13`, `POLL_MS = 15_000`; AD-003). O 1 s do Edge Case não é cumprido nesse caminho e a spec não diz de onde vem a mudança. **Lacuna de precisão da spec**, em conflito com AD-003 (veja Lacunas).
- [x] **Fechar o app com o widget aberto e a tarefa contando mostra o diálogo de SYNC-08**: e2e `widget.spec.ts:144-159` - `electronApp.quit()` com o widget aberto e a tarefa contando dá `messages toEqual(['A task is running.'])`, e a principal volta (macOS, `mainMinimized toBe(false)`). `index.ts:247-251` restaura a principal antes da pergunta; isso também fecha o widget pelo evento `restore`. Só a principal informa o foco: `focus-widget.test.tsx:238-244` (`reportFocusState` e `onPauseRequest` nunca chamados no widget) e `index.ts:271` (`if (!fromMain(event)) return`).
- [x] **Sessão parada (SYNC-11) continua**: o widget não monta o `FocusGuard` (`pages/focus-widget.tsx:28-30`); `App.test.tsx:82-107` prova `/widget` sem o menu lateral; o diálogo de sessão parada continua no guarda do app, coberto por `App.test.tsx` "Reopening the app (SYNC-12)" e pela suíte de `foco-e-sons`, que segue verde.

---

## Sensor de discriminação

Worktree descartável `…/scratchpad/verify-wd` em `HEAD` (`a77ee5a`), com `node_modules` ligados por symlink e os artefatos de build (`desktop/out`, `frontend/dist-desktop`) copiados. Linha de base na worktree, sem mutação: 4 arquivos de teste do widget 48/48, frontend 882/882, `widget.spec.ts` 1/1. Cada mutante foi aplicado, testado e revertido pelo script (`write_text` do original). As mutações em `index.ts` foram testadas com `electron-vite build` + `playwright test e2e/widget.spec.ts`.

| # | Arquivo:linha | Mutação | Morto? | Teste que pegou |
| - | ------------- | ------- | ------ | --------------- |
| M01 | `desktop/src/main/widget-window.ts:20` | `alwaysOnTop: true` → `false` | ✅ | `widget-window.test.ts:61` |
| M02 | `widget-window.ts:33` | remove `setAlwaysOnTop(true, 'floating')` | ✅ | `widget-window.test.ts:93,101` |
| M03 | `desktop/src/main/widget-bounds.ts:25` | canto direito → esquerdo (`x = workArea.x + margem`) | ✅ | `widget-bounds.test.ts:14`, `widget-controller.test.ts:121,346` |
| M04 | `widget-bounds.ts:26` | topo → base (`y = altura − 64 − margem`) | ✅ | idem |
| M05 | `widget-bounds.ts:11` | margem 16 → 15 | ✅ | idem |
| M06 | `widget-bounds.ts:21` | interseção desligada por 1 px (largura + 1 na checagem) | ✅ | `widget-bounds.test.ts:33` (`x = -300` ficou em vez de voltar ao canto) |
| M07 | `desktop/src/main/widget-controller.ts:113` | `restore` da principal não fecha o widget | ✅ | `widget-controller.test.ts:248` (caso `restore`) |
| M08 | `widget-controller.ts:110` | minimizar ignora `focusActive` | ✅ | `widget-controller.test.ts:177,188` |
| M09 | `widget-controller.ts:92` | fechar pelo sistema tratado como `restore` | ✅ | `widget-controller.test.ts:270` |
| M10 | `widget-controller.ts:62` | `restore` também traz a principal de volta | ✅ | `widget-controller.test.ts:250` (`focused` 1 ≠ 0) |
| M11 | `widget-controller.ts:134` | `focus:changed` do widget volta ao widget | ✅ | `widget-controller.test.ts:370` |
| M12 | `widget-controller.ts:100` | `open()` não minimiza a principal | ✅ | `widget-controller.test.ts:124` |
| M13 | `widget-controller.ts:70` | `Expandir` não volta à última tela de foco | ✅ | `widget-controller.test.ts:213` |
| M14 | `desktop/src/main/widget-shortcut.ts:34` | atalho sem Shift | ✅ | `widget-shortcut.test.ts:107` (`{control, shift:false}`) |
| M15 | `widget-shortcut.ts:35` | atalho aceita Alt | ✅ | `widget-shortcut.test.ts:107` (`{control, alt:true}`) |
| M16 | `widget-shortcut.ts:40` | abre sem foco ativo | ✅ | `widget-shortcut.test.ts:87` |
| M17 | `widget-shortcut.ts:36` | ignora o modificador da plataforma (`meta === mac`) | ✅ | `widget-shortcut.test.ts:107` (`{control, meta:true}`) |
| F01 | `frontend/src/lib/sounds/gate.ts:9` | toca nas duas janelas (`return true`) | ✅ | `gate.test.ts:52,59,70` |
| F02 | `frontend/src/lib/desktop/focus-window.ts:11` | `windowRole()` sempre `main` | ✅ | `focus-window.test.tsx:45`, `gate.test.ts:47` |
| F03 | `frontend/src/components/focus/widget-notes.tsx:73` | salva a cada tecla em vez de no `blur` | ✅ | `widget-notes.test.tsx` (`update.mock.calls` com 1 chamada; bloqueio de 10 001 caracteres) |
| F04 | `widget-notes.tsx:57-58` | `blur` nunca salva | ✅ | `widget-notes.test.tsx:67` |
| F05 | `frontend/src/pages/focus.tsx` (ícone de recolher) | ícone visível sem a ponte | ✅ | `focus.test.tsx:126` |
| F06 | `frontend/src/components/focus/focus-guard.tsx:30` | qualquer tela com tarefa conta como foco | ✅ | `app-layout.test.tsx:303,327` |
| F07 | `focus-guard.tsx:29` | sessão de outro dispositivo conta como foco aqui | ✅ | `app-layout.test.tsx:327` |
| F08 | `frontend/src/pages/focus-widget.tsx:40` | o widget informa `focus:state` (`useDesktopFocusBridge`) | ✅ | `focus-widget.test.tsx:242` |
| F09 | `focus-widget.tsx:79` | ação no widget não avisa a principal | ✅ | `focus-widget.test.tsx:131,144` |
| F10 | `focus-widget.tsx:63` | tarefa sumida expande sem `task_left` | ✅ | `focus-widget.test.tsx:166` |
| F11 | `frontend/src/components/focus/widget-controls.tsx:52` | controles sempre visíveis | ✅ | `widget-controls.test.tsx:49,58,167` |
| F12 | `widget-controls.tsx:99` | sem o ramo `awaiting_extend` | ✅ | `widget-controls.test.tsx:174` |
| F13 | `widget-controls.tsx:180` | botões dentro da área de arrastar | ✅ | `widget-controls.test.tsx:204` |
| F14 | `focus-widget.tsx:51` | `focus:changed` não refaz a leitura no widget | ✅ | `focus-widget.test.tsx:155,166` |
| F15 | `focus.tsx` (`Focar agora`) | recolhe antes de o `start` responder | ✅ | `focus.test.tsx:300` e o teste do navegador `:352` |
| E01 | `desktop/src/main/index.ts:262` | atalho não ligado na janela do widget | ✅ | e2e `widget.spec.ts:132` |
| E02 | `index.ts:273` | `focus:state` não chega ao controlador | ✅ | e2e `widget.spec.ts:111` (o atalho não abre) |
| E03 | `index.ts:271` | `focus:state` aceito também do widget (sem `fromMain`) | ⚪ Equivalente | Nenhum. Veja abaixo |
| E04 | `index.ts:249` | o diálogo de SYNC-08 não restaura a principal minimizada | ✅ | e2e `widget.spec.ts:158` |

**E03, por que é equivalente**: o `focus:state` só sai de `useDesktopFocusBridge`, que só o `FocusGuard` monta. O `FocusGuard` não existe em `/widget` (`App.test.tsx:83-94`), e a página do widget nunca chama `reportFocusState` (`focus-widget.test.tsx:242`, que matou F08). Com o renderer atual, nenhuma mensagem `focus:state` sai do widget, então tirar a guarda não muda nada observável. A guarda é uma segunda defesa sem teste próprio (lacuna 3).

**Instabilidade observada**: na primeira passada do sensor, E03 e E04 caíram em `widget.spec.ts:132` (o atalho no widget não fechou o widget), num ponto que essas mutações não tocam. Rodadas de novo, E03 passou e E04 caiu no ponto certo (`:158`). O spec sem mutação passou 9 de 9 vezes (1 no gate, 1 na linha de base, 2 + 5 repetições na worktree). Fica registrado como possível corrida no passo de WIDGET-20 sob carga, que não se reproduziu.

**Profundidade**: expandida (36 mutações, todos os arquivos pedidos). **Resultado**: 35/35 mortas + 1 equivalente justificada. Isolamento: `git worktree remove --force` feito. `git status --porcelain` do checkout real estava vazio antes e, depois, só tem `?? .specs/features/widget-desktop/validation.md`. Nenhum `git stash` foi usado.

---

## Qualidade do código

| Princípio | Status |
| --------- | ------ |
| Código mínimo | ✅ O controlador é uma função com estado local; nenhuma abstração para uso único além da que a task pede |
| Mudanças cirúrgicas | ✅ As mudanças fora dos arquivos novos são as previstas: `index.ts`, ponte, `config-store`, `focus.tsx`, `focus-guard.tsx`, `break-picker` (`iconOnly`, `onOpenChange`) e fakes de testes que passaram a precisar dos membros novos |
| Sem escopo extra | ⚠️ Pequenos acréscimos documentados nas Notas: avisos da fila dentro do widget, controles de teclado, atraso de 150 ms ao esconder, só `Expandir` para quem não escreve. Todos coerentes com a spec |
| Segue os padrões | ✅ `trustedHandle`, `trackWindowState`, `hardenWebContents`, fakes de `BrowserWindow` como nos testes existentes |
| Spec-anchored | ✅ (com o ⚠️ do Edge Case de título) |
| Cobertura por camada | ✅ main e preload com unidade; montagem com e2e (só macOS conferido); frontend com Testing Library por AC |
| Todo teste mapeia um requisito | ✅ Os `describe` citam o AC; os demais cobrem Edge Cases ou Done when |
| Guias seguidos | `CONTRIBUTING.md`, `.github/workflows/ci.yml`, `desktop/playwright.config.mts` |

Observação menor: `focus:expand` e `widget:resize` (`index.ts:279-281`) aceitam pedido de qualquer frame confiável, inclusive da principal. Não muda comportamento visível (a principal não chama esses membros) e o `trustedHandle` já barra origens fora de `app://`.

---

## Lacunas, em ordem

1. **CI Linux não rodado (T12, WIDGET-19)**: o Done when da T12 está marcado `[x]`, mas o spec nunca rodou com `xvfb-run`. No Linux, o e2e não confere `isMinimized` (`widget.spec.ts:72,113,158`) e troca a restauração pelo sistema por `main.emit('restore')` (`:41`). **Correção**: rodar o job `desktop` do CI (ou `xvfb-run -a npm --prefix desktop run test:e2e` num Linux) antes do merge e corrigir a marcação da T12 até lá. Se quiser prova real no Linux, rodar o e2e com um gerenciador de janelas leve no CI (por exemplo `openbox` sob o xvfb), para `minimize()` e `restore()` mudarem estado e o ramo `linux` poder sair.
2. **Edge Case "título muda → até 1 s" (⚠️ precisão da spec)**: com o widget aberto, a principal fica minimizada e restaurá-la fecha o widget. Então o título só muda por outro dispositivo, e aí vale o polling de 15 s (`use-focus.tsx:13`, AD-003). **Correção** (o usuário decide uma): (a) mudar o Edge Case para "na próxima leitura (até 15 s, ou ao ganhar foco)", em linha com AD-003; ou (b) um `refetchInterval` menor só em `/widget`.
3. **Guarda `fromMain` de `focus:state` sem teste (E03, equivalente hoje)**: **Correção**: no e2e, chamar `window.trackzyn.reportFocusState({ active: false, running: false })` pela página do widget e conferir que o atalho na principal ainda abre e que sair ainda pergunta (SYNC-08). Ou extrair o handler para uma função testável com um `sender` falso.
4. **Possível corrida no passo de WIDGET-20 do e2e** (`widget.spec.ts:131-132`): caiu 2 vezes sob carga e passou nas 9 execuções sem mutação. **Correção**: antes de `pressShortcut(app, 'widget')`, esperar o widget ter o foco de entrada, ou repetir o `sendInputEvent` dentro de um `expect.poll`.

---

## Rastreabilidade

| Requisito | Antes | Agora |
| --------- | ----- | ----- |
| WIDGET-01 a WIDGET-18, WIDGET-20 a WIDGET-24 | Implementing | ✅ Verified |
| WIDGET-19 | Implementing | ✅ Verified (macOS + unidade; Linux pendente da lacuna 1) |

(Este Verificador não edita `spec.md`; o orquestrador atualiza a tabela.)

---

## Resumo

**Geral**: ✅ Pronto, com ressalvas.

**Spec-anchored**: 24/24 ACs com o valor da spec; 1 Edge Case com lacuna de precisão (título em 1 s).
**Sensor**: 35/35 mortas + 1 equivalente (E03).
**Gate**: todos os comandos com exit 0 no macOS. Desktop 248 + 3 pulados, frontend 882 ×3, e2e 52 + 2 pulados. CI Linux não rodado.

**O que funciona**: abrir por `Focar agora`, pelo ícone, ao minimizar e pelo atalho; janela 300×64 sem moldura, sempre acima e arrastável; posição no canto com 16 px, lembrada e validada contra as telas; os 6 controles com o mouse e `Estender`/`Concluir` em `00:00:00`; anotações salvas no `blur`; `Tudo limpo`; `Expandir`, restaurar, atalho e fechar pelo sistema; sincronia ≤ 1 s entre as janelas; som só no widget; navegador sem ícone nem ponte; diálogo de SYNC-08 com o widget aberto; só a principal informa o foco.

**Próximos passos**: rodar o CI Linux (lacuna 1); o usuário decide o texto do Edge Case do título (lacuna 2); as lacunas 3 e 4 são reforços de teste opcionais.
