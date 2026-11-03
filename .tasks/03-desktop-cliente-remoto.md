# Desktop com Electron: cliente de um servidor remoto

> Build this with **tlc-implement** (`.claude/skills/tlc-implement`).
> Every criterion below becomes a check with a proof, referenced by its number. Nothing under
> `Unresolved` gets settled while building.
>
> Independente das tasks 1 e 2: o app fala com qualquer servidor launchkit, Python ou Node.

## Intent

O launchkit só roda no navegador: o usuário precisa lembrar a URL do servidor, não há instalador nem ícone no dock ou na barra de tarefas, e a atualização depende de quem opera o servidor (o banner atual só avisa que existe release nova). A fonte não traz números de uso.

Ao fim, existe um aplicativo desktop (macOS, Windows e Linux) que reaproveita o frontend React, pergunta a URL de um servidor launchkit no primeiro uso, entra com e-mail, senha e TOTP, abre links no navegador do sistema, baixa arquivos com o diálogo nativo e se atualiza sozinho a partir do GitHub Releases. Passkeys ficam fora nesta versão. OIDC e o modo local são da task 4.

38 critérios em 7 slices · 5 portas de mão única · 0 abertas, 2 bloqueiam o go-live

## Criteria

### Abrir o app

1. Quando abro o app instalado, então existe 1 janela e a URL dela começa com `app://launchkit/`.
2. Quando recarrego a janela em `app://launchkit/files`, então a página de arquivos renderiza (fallback para `index.html`) e o protocolo responde 200.
3. Quando abro uma segunda instância, então o novo processo encerra com código 0, a janela existente recebe foco e `BrowserWindow.getAllWindows().length` continua 1.

### Conectar a um servidor

4. Dado que não há servidor configurado, quando abro o app, então vejo a tela de conexão (título `Connect to a server` em en, `Conectar a um servidor` em pt-BR) antes de `/setup` e `/login`, e nenhuma chamada a `/api/*` sai.
5. Enquanto o campo de URL está vazio, o botão de confirmar fica desabilitado.
6. Quando confirmo uma URL, então o app chama `GET <url>/api/health` (200 `{"status": "healthy"}`) e `GET <url>/api/info` (200 com `app_name`), mostra o botão desabilitado com o texto `Checking…` (pt-BR: `Verificando…`) durante a chamada, salva a URL e navega para `/setup` quando `GET /api/setup/status` retorna `{"has_users": false}`, ou para `/login` quando retorna `true`.
7. Se a validação falha (sem rede, status diferente de 200, ou corpo sem `"status": "healthy"`), então a tela mostra `Could not reach the server` (pt-BR: `Não foi possível conectar ao servidor`) e nada é salvo.
8. Dado um servidor já configurado, quando abro o app de novo, então não vejo a tela de conexão e chego em `/login` ou no workspace conforme a sessão.
9. Quando informo `https://srv.example.com/`, então salvo `https://srv.example.com`; quando informo `srv.example.com` (sem protocolo), então a tela mostra `Enter a URL starting with http:// or https://` e nada é salvo; quando informo `http://` para host que não é `localhost`, `127.0.0.1` nem `[::1]`, então a tela mostra um aviso e exige um segundo clique para confirmar.
10. Quando escolho `Trocar de servidor` (menu Arquivo), então a tela de conexão abre; ao confirmar uma nova URL, `localStorage` perde `token` e `workspace_id` e nenhuma chamada com o token antigo vai ao novo servidor.

### Entrar e usar

11. Dado um servidor Python e um servidor Node, quando entro com e-mail e senha (e TOTP, se ativo), então chego em `/` e `GET /api/users/me` retorna 200 pelo app, nos dois servidores.
12. Quando uma chamada retorna 401, então o app vai para `app://launchkit/login` e `localStorage.token` fica vazio.
13. Quando troco de workspace, então as chamadas seguintes saem com `X-Workspace-Id: <id>`.
14. Sempre, as chamadas ao servidor saem do processo principal e não carregam `Origin: app://launchkit`, de modo que um servidor sem CORS para essa origem responde 200.
15. Dado `isDesktop`, quando abro `/login` e as configurações da conta, então nenhum controle de passkey aparece.

### Janela segura

16. Quando a janela é criada, então `webPreferences` tem `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false` e `webSecurity: true`.
17. Quando clico em um link `https://example.com`, então `shell.openExternal` é chamado com essa URL e a janela continua em `app://launchkit/…`; com `javascript:`, `file:` ou `launchkit:`, `openExternal` não é chamado.
18. Quando o renderer tenta navegar (`will-navigate` ou `window.open`) para fora de `app://launchkit`, então a navegação é cancelada.
19. Quando um `ipcMain.handle` recebe chamada cujo `senderFrame.url` não começa com `app://launchkit/`, então ele rejeita sem executar.
20. Sempre, `window.launchkit` expõe exatamente `isDesktop`, `platform`, `appVersion`, `getServerUrl`, `setServerUrl`, `openExternal`, `onUpdateAvailable` e `installUpdate`, e `window.require` e `window.process` não existem.
21. Sempre, as respostas de `app://launchkit/` têm `Content-Security-Policy` com `default-src 'self'` e sem `unsafe-eval`.
22. Quando `@electron/fuses read` roda no app empacotado, então `RunAsNode` e `EnableNodeCliInspectArguments` estão desligados e `EnableEmbeddedAsarIntegrityValidation` e `OnlyLoadAppFromAsar` estão ligados.

### Instalar e atualizar

23. Quando a tag `desktop-v0.1.0` é enviada, então `desktop-release` publica no GitHub Releases do repositório de releases do desktop (separado do servidor) `.dmg` e `.zip` (macOS), `.exe` (NSIS, Windows), `.AppImage` e `.deb` (Linux) e os arquivos `latest*.yml` do updater.
24. Dado o app macOS publicado, quando `codesign --verify --deep --strict` e `xcrun stapler validate` rodam, então ambos saem com código 0 e `spctl -a -t exec` aceita o app.
25. Dado o instalador Windows publicado, quando `Get-AuthenticodeSignature` roda, então `Status` é `Valid`.
26. Dado o app na versão N aberto e uma release N+1 no canal de pré-lançamento, quando o app verifica atualização, então o banner de atualização aparece; ao clicar em instalar, o app reinicia e `app.getVersion()` retorna N+1.
27. Dado que não há rede, quando o app abre, então abre normalmente e nenhum diálogo de erro de atualização aparece.
28. Dado um build sem assinatura, quando o app inicia, então o `autoUpdater` não é iniciado.
29. Dado `isDesktop`, quando o app roda, então o renderer não faz requisição a `api.github.com`; no build web, `useLatestRelease` continua consultando `api.github.com/repos/<UPDATE_CHECK_REPO>/releases/latest` como hoje.

### Experiência nativa

30. Quando abro o menu, então vejo `File`, `Edit`, `View`, `Window` e `Help` (pt-BR: `Arquivo`, `Editar`, `Exibir`, `Janela`, `Ajuda`), com `Trocar de servidor` em Arquivo, e `Cmd+K` (macOS) ou `Ctrl+K` abre a command palette.
31. Quando fecho e reabro o app, então a janela volta com os mesmos `x`, `y`, `width` e `height`; se o monitor salvo não existe mais, então abre centralizada com 1280×800 e mínimo de 800×600.
32. Dado o macOS, quando a janela abre, então `titleBarStyle` é `hiddenInset`, o cabeçalho tem `-webkit-app-region: drag` e seus botões e campos têm `no-drag`.
33. Quando clico em baixar um arquivo (`GET /api/files/{id}/download`), então `dialog.showSaveDialog` abre com `defaultPath` igual ao nome do arquivo e, ao confirmar, o arquivo gravado tem os mesmos bytes; ao cancelar, nenhum arquivo é gravado.
34. Quando `en.json` e `pt-BR.json` são comparados, então têm as mesmas chaves, incluindo as da tela de conexão, do menu e do banner.

### Verificação no CI

35. Quando o job `desktop-checks` roda, então executa lint, `tsc` e Vitest do main e do preload e o build sem assinatura, e falha se algum falhar.
36. Quando o job `desktop-e2e` roda em `macos-latest`, `windows-latest` e `ubuntu-latest`, então o teste Playwright (`_electron.launch`) abre o app, conecta a um servidor de teste, entra, troca de workspace e envia um arquivo, e passa nos três.
37. Quando um PR altera `desktop/` ou `frontend/`, então `.github/ci/changes.py` marca `run_desktop=true`; quando altera só `backend/`, `charts/` ou `docs/`, marca `false`; `test_changes.py` cobre os dois casos.
38. Quando o build web (`vite build` sem `--mode desktop`) roda, então o bundle não referencia `window.launchkit` além da verificação `window.launchkit?.isDesktop`, e os testes do frontend passam sem alteração de comportamento.

## Out of scope

- OIDC/SSO e o modo local com backend embutido - task 4.
- Passkeys no desktop - o WebAuthn no Electron tem suporte limitado e a origem `app://` não bate com o RP ID do servidor.
- Armazenamento do token no Keychain/DPAPI/libsecret, ícone na bandeja, notificações nativas e abrir ao iniciar - histórias P2 do PRD.
- Sincronização entre o modo local e um servidor.
- Aplicativos móveis.
- Reescrever a interface com visual nativo de cada sistema.

## Observable

| Surface | Decision | Landing |
| --- | --- | --- |
| tela `Conectar a um servidor` | estado vazio | 5 |
| tela `Conectar a um servidor` | estado de carregamento | 6 |
| tela `Conectar a um servidor` | estado de erro | 7, 9 |
| tela `Conectar a um servidor` | estado não autorizado | n/a - a tela roda antes de qualquer sessão |
| tela `Conectar a um servidor` | ação destrutiva confirma antes | 10 (decidido: sem confirmação) |
| tela `Conectar a um servidor` | densidade e ordenação | existing - estrutura de cartão da tela de login (`frontend/src/pages/login.tsx`) |
| banner de atualização | estados | existing - `frontend/src/components/update-available-banner.tsx` (aparece só com release mais nova) e 26 |
| janela e menu | tamanho, posição e atalhos | 30, 31, 32 |
| diálogo de salvar | cancelamento | 33 |
| documento do instalador e da release | estrutura | n/a - notas de release geradas pelo GitHub; sem texto autoral nesta task |

## Swept

- validation: 6, 7, 9
- failure modes: 7, 12, 27
- idempotency and retry: 3, 8
- authorization: 12, 19
- concurrency and ordering: 3
- data lifecycle: 10, 31
- external-dependency failure: 7, 27
- state transitions: 6, 10
- observability: n/a - o cliente remoto usa o console padrão do Electron; o modo local grava logs (task 4)

## Impact

| Front | What changes |
|---|---|
| domain | new term: `isDesktop` - verdadeiro quando `window.launchkit?.isDesktop`; lives in `frontend/src/lib/platform.ts` |
| domain | new term: `serverUrl` - URL do servidor a que o app está conectado; lives no processo principal e na config do app |
| domain | existing term: `useLatestRelease` e o banner de atualização (`update-available-banner.tsx`, `update-available-dialog.tsx`) eram só web e usavam `api.github.com` do navegador; no desktop passam a ser alimentados pelo electron-updater |
| domain | existing term: `releases/latest` do repositório em `UPDATE_CHECK_REPO` continua devolvendo só releases do servidor, porque o desktop publica em repositório separado; o banner web não muda |
| domain | existing: o interceptor de 401 em `frontend/src/lib/api.ts` faz `window.location.href = '/login'` e continua válido em `app://launchkit` |
| stored data | nada a migrar; o `localStorage` do app é separado do navegador, e a config do app é nova |
| CI | novos jobs `desktop-checks`, `desktop-e2e` e `desktop-release`; `.github/ci/changes.py` ganha `run_desktop` |

## Decided

| Decision | Shape | Alternative rejected |
|---|---|---|
| Servir o frontend por protocolo próprio | esquema `app://launchkit` privilegiado (`standard`, `secure`, `supportFetchAPI`) servindo o `dist/` com fallback para `index.html`; `app://launchkit/api/*` é encaminhado pelo processo principal para `serverUrl` | `file://`: `BrowserRouter` e `baseURL: '/api'` não funcionam. `http://localhost` com servidor embutido: abre uma porta local para qualquer processo da máquina. |
| API exposta ao renderer | `window.launchkit` com `isDesktop`, `platform`, `appVersion`, `getServerUrl`, `setServerUrl`, `openExternal`, `onUpdateAvailable`, `installUpdate` | Expor `ipcRenderer` inteiro: derruba o isolamento de contexto. |
| Identidade do app e canal de atualização | `appId` `com.launchkit.desktop`, atualização por GitHub Releases, em repositório separado do servidor, com tags `desktop-v*` | Outro canal (S3, servidor próprio): mais infraestrutura sem ganho; o `appId` não muda depois da primeira release sem quebrar a atualização automática e a identidade de assinatura. |
| Dependências do pacote `desktop/` | `electron`, `electron-vite`, `electron-builder`, `electron-updater`, `@electron/fuses`, `@playwright/test` | Electron Forge: o updater com GitHub Releases e a assinatura exigem mais montagem. |
| Configuração persistida do app | `userData/config.json` com `{"serverUrl": "<url>"}`, mais `bounds` da janela | Guardar a URL no `localStorage` do renderer: ficaria apagável por qualquer script do renderer e fora do alcance do processo principal. |

## Sources

- `docs/prds/prd-feature-2-electron-desktop.md` - histórias 1 a 6, requisitos FR-001 a FR-009
- `docs/plans/feature-2-electron-desktop.md` - decisões D1 a D6 e D8, fases 0 a 2
- `frontend/src/lib/api.ts`, `frontend/src/App.tsx`, `frontend/src/hooks/use-latest-release.ts`, `frontend/src/components/update-available-banner.tsx` - o que o desktop reaproveita
- Não há design da tela de conexão; a tela reutiliza `Card`, `Input` e `Button` do kit de UI, na estrutura da tela de login.

This task is the record of decision. If a linked document diverges, ask before building.

## Unresolved

| # | Kind | Question | Until answered |
|---|---|---|---|
| 1 | blocks go-live | Quem fornece a conta Apple Developer (Developer ID e notarização) e o certificado de assinatura do Windows? Hoje ninguém. | Os critérios 24 e 25 não podem passar; todo o resto fica verde e builds sem assinatura circulam só para uso interno, com a atualização desligada (critério 28). |
| 2 | blocks go-live | Qual é o repositório de releases do desktop (`owner/repo` do `publish` do electron-builder)? | Os critérios 23 e 26 passam contra um repositório de teste; o app só atualiza de verdade quando esse repositório existir. |
