# Desktop com Electron: cliente de um servidor remoto

Profile: `light` · handoff `on` · budget 150k · sem design binding (a tela de conexão reusa o cartão de `frontend/src/pages/login.tsx`; perfil `ui` não se aplica).

Sources:

- `.tasks/03-desktop-cliente-remoto.md` - record of decision: 38 critérios em 7 slices, `Decided`, `Unresolved`. Os números `C<n>` abaixo são os números dos critérios; um critério com "e" vira `C<n>a`, `C<n>b`…
- `docs/prds/prd-feature-2-electron-desktop.md` - histórias 1 a 6, FR-001 a FR-009, NFR-001 a NFR-006.
- `docs/plans/feature-2-electron-desktop.md` - D1 a D6 e D8, fases 0 a 2.
- Decisões do usuário confirmadas fora da task: electron-builder; `appId` `com.launchkit.desktop`; releases do desktop em repositório separado do servidor (valor de teste configurável, go-live registrado); URL sem protocolo é recusada; trocar de servidor apaga a sessão sem confirmação; sem logs próprios no cliente remoto.

## Out of scope

- OIDC/SSO e modo local com backend embutido - task 4.
- Passkeys no desktop - WebAuthn limitado no Electron e a origem `app://` não bate com o RP ID.
- Token em Keychain/DPAPI/libsecret, bandeja, notificações nativas, abrir ao iniciar - P2 do PRD.
- Sincronização local/servidor, apps móveis, visual nativo por sistema.
- Segredos e certificados de assinatura (Apple e Windows) - não existem; ver `Local proof limits`.

## Landing

Toca: pacote novo `desktop/` (main, preload, shared, e2e); `frontend/` ganha `src/lib/platform.ts`, `src/pages/connect-server.tsx`, `src/components/desktop-gate.tsx`, ajustes pontuais atrás de `isDesktop()` e uma alteração aditiva em `vite.config.ts`; `.github/ci/*` e `ci.yml` só com edições aditivas (batch 3). Reaproveita `Card`/`Input`/`Button`, `api.ts` (`baseURL: '/api'` intacto), `use-feature-flags`, i18n.

| One-way door | Literal shape | Alternative rejected |
| --- | --- | --- |
| Protocolo `app://launchkit` (Decided) | `protocol.registerSchemesAsPrivileged([{scheme:'app', privileges:{standard:true, secure:true, supportFetchAPI:true}}])` antes de `ready`; `protocol.handle('app', handler)`; `handler` é uma função pura `(Request)=>Promise<Response>` criada por `createAppHandler({distDir, getServerUrl, fetchFn})` | `file://` (`BrowserRouter`/`baseURL` quebram); `http://localhost` embutido (porta aberta a qualquer processo) |
| Encaminhamento de `/api/*` | `app://launchkit/api/<p>` -> `fetchFn(<serverUrl>/api/<p>, {method, headers sem origin/referer/host, body, duplex:'half', redirect:'manual'})`; sem `serverUrl` responde 503 sem sair da máquina | repassar `Origin: app://launchkit` e exigir CORS no servidor (viola C14) |
| Contrato `window.launchkit` (Decided, 8 membros) | `isDesktop: true`, `platform: NodeJS.Platform`, `appVersion: string`, `getServerUrl(): Promise<string\|null>`, `setServerUrl(url, opts?: {allowInsecure?: boolean}): Promise<{ok:true,url:string}\|{ok:false,reason:'invalid-url'\|'insecure'\|'unreachable'}>`, `openExternal(url): Promise<void>`, `onUpdateAvailable(cb): () => void`, `installUpdate(): Promise<void>` | validar a URL no renderer (CSP `connect-src 'self'` e falta de CORS impedem); expor `ipcRenderer` |
| Dono das regras de URL | só o processo principal: normaliza (tira `/` final), exige `http://`/`https://`, avisa `http` fora de `localhost`/`127.0.0.1`/`[::1]`, valida por `/api/health` + `/api/info`, grava; o renderer só mostra o `reason` | regras duplicadas no renderer (diverge) |
| `userData/config.json` (Decided) | `{"serverUrl": "https://host", "bounds": {"x":0,"y":0,"width":0,"height":0}}`, gravação atômica (arquivo temporário + rename); `serverUrl` ausente = não configurado | `localStorage` do renderer (apagável por script do renderer) |
| Flag de compilação `__DESKTOP_BUILD__` | `define` do Vite: `true` só com `vite build --mode desktop`; o único texto `window.launchkit` fora de `?.isDesktop` vive em `getDesktopApi()` de `platform.ts` atrás de `__DESKTOP_BUILD__ ? … : null`; `App.tsx` só importa a tela de conexão nesse ramo. Vitest define `true` | checar `window.launchkit` em runtime nas páginas (o bundle web passaria a referenciá-lo; viola C38) |
| Saída do build desktop do frontend | `frontend/dist-desktop/` (`build.outDir` por modo; `dist/` do web não muda) | sobrescrever `dist/` (corrompe o build web local) |
| Renderer não é construído pelo electron-vite | `desktop/electron.vite.config.ts` só com `main` e `preload`; o renderer é `frontend/dist-desktop/` | `renderer` do electron-vite apontando para `frontend/` (duplica aliases/tailwind e deriva do build web) |
| `appVersion` no preload | passado por `webPreferences.additionalArguments: ['--launchkit-app-version=<v>']`, lido de `process.argv` no preload (`sandbox: true`) | `ipcRenderer.sendSync` (bloqueia o renderer e abre mais um canal de IPC) |
| Pacote `desktop/` | `package.json` próprio com `package-lock.json`, fora de workspaces; `npm ci` em `desktop/` e em `frontend/` | monorepo com workspaces (muda o lock e o CI do frontend) |
| Repositório de releases | `publish: {provider: github, owner/repo de ${env.LAUNCHKIT_DESKTOP_RELEASE_REPO}}`; go-live em `Unresolved` 2 (batch 3) | valor fixo (o repositório não existe) |
| Redirects do encaminhamento de `/api/*` (corrige a forma `redirect:'manual'` da linha do encaminhamento) | `redirect: 'follow'` (padrão do `fetch`) no processo principal | `redirect: 'manual'` - o FastAPI responde `307` com `Location` absoluto `http://servidor/...` e o renderer sairia de `app://launchkit` |
| Formato dos bundles do main e do preload | CJS: `out/main/index.js` e `out/preload/index.js` (sem `"type": "module"` em `desktop/package.json`); o preload com `sandbox: true` só carrega CJS | main em ESM (`.mjs`) - o preload sandboxed precisaria de outro formato e o electron-builder de outro `main` |
| Canais de IPC do cliente remoto | `server:get-url`, `server:set-url` (batch 1); `shell:open-external` (S4); `updater:install` e o evento `updater:update-available` (S5); todo handler registrado por `trustedHandle(channel, fn)`, que rejeita `senderFrame.url` fora de `app://launchkit/` | `ipcMain.handle` direto em cada módulo (a validação de C19 ficaria por handler) |
| `Trocar de servidor` | o item do menu carrega `app://launchkit/connect` e mantém a URL salva até uma nova validar; o `DesktopGate` intercepta `/connect` (não é um `<Route>`) e, ao conectar, faz `queryClient.clear()` e navegação SPA | limpar `serverUrl` ao clicar - fechar o app na tela de conexão deixaria o usuário sem servidor; recarregar a página inteira após conectar - não é testável em jsdom e não traz ganho |
| Menu no batch 1 | `File > Switch server` (id `switch-server`) mais o `editMenu` por papéis (sem ele Cmd+V não cola no campo de URL do macOS); rótulos e demais menus em S6 (C30) | menu vazio até S6 - a tela de conexão ficaria sem colar |
| Textos do desktop | chaves `desktop.*` em `frontend/src/locales/en.json` e `pt-BR.json`; o main importa os mesmos JSON | cópia dos textos no pacote `desktop/` (diverge; C34 exige as mesmas chaves) |
| Script do frontend | `build:desktop` em `frontend/package.json` = `npm run typecheck && vite build --mode desktop` | alterar `build` (muda o build web) |
| Fonte Geist | `index.css` importa `fonts.googleapis.com` e conflita com a CSP de C21; decisão (remover o `@import` no modo desktop ou empacotar a fonte) fica no batch 2 junto com a CSP | decidir agora sem a CSP para provar |
| Fonte Geist (decisão do batch 2) | no modo desktop, um plugin do Vite remove o `@import url('https://fonts.googleapis.com/...')` de `index.css` e os três `<link>` de `fonts.googleapis.com`/`fonts.gstatic.com` de `index.html`; a pilha `font-family` já cai em `Inter, system-ui`. O build web fica idêntico | empacotar Geist (`@fontsource`: dependência nova, mexe no bundle web e pesa o instalador); liberar `fonts.googleapis.com` na CSP (quebra `default-src 'self'` de C21 e faz o app depender de rede para renderizar) |
| CSP de `app://launchkit/` | cabeçalho em toda resposta própria do handler (estáticos, 404, 500, 503): `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`. Respostas repassadas de `/api/*` não recebem (são JSON/arquivos do servidor) | `<meta http-equiv>` no `index.html` (não cobre erro 404/500 e fica no bundle web); `style-src` com nonce (os `style=` do React não aceitam nonce) |
| Esquemas de `openExternal` | allowlist `http:`, `https:`, `mailto:` em `isAllowedExternalUrl(url)` (URL inválida = não); `shell:open-external` registrado por `trustedHandle`; `setWindowOpenHandler` abre os permitidos fora e sempre responde `{action:'deny'}`; `will-navigate`/`will-redirect`/`will-frame-navigate` fora de `app://launchkit` só cancelam (nunca abrem: um `location.href` de script abriria o navegador sem clique) | só `https:` (links `http://` locais do servidor não abririam); deixar `will-navigate` abrir externamente (script do renderer abriria o navegador sem clique) |
| Módulo de segurança da janela | `src/main/security.ts`: `isAllowedExternalUrl`, `isAppUrl`, `hardenWebContents(webContents, {openExternal})` (navegação, `window.open`, `will-attach-webview`) e `denyAllPermissions(session)`; `window.ts` o chama ao criar a janela | espalhar handlers em `window.ts`/`index.ts` (cada um testado no Electron real, sem teste de unidade) |
| Fuses | `electronFuses` em `desktop/electron-builder.yml` (`runAsNode: false`, `enableNodeCliInspectArguments: false`, `enableEmbeddedAsarIntegrityValidation: true`, `onlyLoadAppFromAsar: true`, `enableCookieEncryption: true`, `enableNodeOptionsEnvironmentVariable: false`, `grantFileProtocolExtraPrivileges: false`); `package:dir` = `electron-builder --dir`; o arquivo nasce aqui só com o que C22 exige e S5 o completa (alvos, publish) | `afterPack` com `@electron/fuses` `flipFuses` (um script a mais para manter; o builder já aplica e reassina) |
| Servidor real dos proofs de S3 | `e2e/real-server.spec.ts` lê `LAUNCHKIT_E2E_SERVER_URL` (sem ela, `test.skip`); cria o admin por `POST /api/setup/create-admin` direto do teste (Node, sem `Origin`) e habilita TOTP por `/api/auth/2fa/*` com um gerador RFC 6238 em `e2e/support/totp.ts`; o servidor sobe de `backend/Dockerfile` em containers `t03-*` | dependência `otpauth`/`pyotp` (pacote a mais só para um código de 6 dígitos) |
| Repositório de releases no builder e no workflow (batch 3; detalha a linha "Repositório de releases") | `electron-builder.yml`: `publish: {provider: github, owner: ${env.LAUNCHKIT_DESKTOP_RELEASE_OWNER}, repo: ${env.LAUNCHKIT_DESKTOP_RELEASE_REPO_NAME}}`; o workflow lê a variável de repositório `vars.LAUNCHKIT_DESKTOP_RELEASE_REPO` (`owner/repo`) e a divide em duas variáveis de ambiente antes de `electron-builder --publish always` | uma só variável `owner/repo` no YAML (o electron-builder não divide texto); valor fixo (o repositório não existe) |
| Build assinado x sem assinatura (C28) | `__SIGNED_BUILD__`: `define` do `electron.vite.config.mts` no `main`, `true` só quando `LAUNCHKIT_DESKTOP_SIGNED=true` no build (o workflow o define quando os segredos existem); `createUpdater({autoUpdater, signed, packaged, send})` só inicia com `signed && packaged`; o módulo recebe os valores por parâmetro, `index.ts` os lê | detectar assinatura em runtime (`codesign` no macOS, `Get-AuthenticodeSignature` no Windows: processo filho por plataforma e falha em Linux); `autoUpdater.forceDevUpdateConfig` |
| Atualizador no main | `desktop/src/main/updater.ts`: `autoUpdater.autoDownload = true`; `update-downloaded` envia `updater:update-available` `{version}` ao renderer (e reenvia em `did-finish-load` se a página recarregar); `error` e a rejeição de `checkForUpdates()` são engolidos sem diálogo (C27); `updater:install` chama `quitAndInstall`; verifica na abertura e a cada 6 h | `checkForUpdatesAndNotify` (a notificação nativa e os erros ficam fora do banner de C26a) |
| Banner no desktop (C26a, C29) | `UpdateAvailableBanner` escolhe por `isDesktop()` entre `DesktopUpdateBanner` (assina `getDesktopApi().onUpdateAvailable`, clique chama `installUpdate`) e o banner web existente; no desktop `useLatestRelease` fica `enabled: false`, e `app-layout.tsx` renderiza o banner também sem `updateCheckRepo` | um só componente com hooks condicionais (viola as regras de hooks); manter a consulta ao `api.github.com` no desktop (o CSP `connect-src 'self'` já a bloquearia, mas a requisição sairia do código) |
| Caminho do frontend no app empacotado | `extraResources: [{from: ../frontend/dist-desktop, to: frontend}]`; `index.ts`: `app.isPackaged ? path.join(process.resourcesPath, 'frontend') : <caminho relativo atual>`; `package:dir` roda `build:all` (frontend antes do builder) | incluir `dist-desktop` dentro do asar (o `app://` lê arquivos com `fs`; funcionaria, mas o frontend dobra o tamanho do asar verificado pelo fuse e `extraResources` não passa pela integridade) |
| Metadados de pacote Linux | `author` e `homepage` em `desktop/package.json`, com e-mail de espaço reservado `noreply@launchkit.invalid`; `linux.maintainer` herdado daí; troca no go-live (Unresolved 2) | e-mail inventado de domínio real |
| Estado da janela (C31, C32) | `src/main/window-state.ts`: `resolveWindowBounds(saved, displays)` (puro: usa os bounds salvos se o retângulo cruzar a `workArea` de algum monitor; senão `{width:1280,height:800}` sem `x`/`y`, `center: true`), `windowOptions({platform, bounds})` (`titleBarStyle: 'hiddenInset'` só em `darwin`; `minWidth: 800`, `minHeight: 600`), `trackWindowState(win, store)` grava `bounds` em `config.json` ao fechar e, com atraso de 500 ms, ao mover ou redimensionar; o `config-store` ganha `getBounds`/`setBounds` | gravar só no `close` (um crash perde o último layout); `electron-window-state` (dependência a mais para ~60 linhas) |
| Cabeçalho arrastável no macOS (C32) | `AppLayout` aplica `style={{WebkitAppRegion:'drag'}}` ao cabeçalho do logotipo (sidebar) e `WebkitAppRegion:'no-drag'` a cada `button`/`a` dentro dele, só quando `isDesktop() && window.launchkit.platform === 'darwin'`; ganha `pt-7`/recuo do semáforo | classe global `[-webkit-app-region:drag]` em todo o app (arrasta sobre botões em Windows/Linux, onde a barra é nativa) |
| Downloads (C33) | `src/main/downloads.ts`: `will-download` define um caminho temporário em `os.tmpdir()` de forma síncrona, abre `dialog.showSaveDialog(win, {defaultPath: item.getFilename()})`; ao confirmar, copia o temporário para o escolhido quando o download termina (`done` com `completed`); ao cancelar, `item.cancel()` e apaga o temporário; nada é gravado no destino sem confirmação | `event.preventDefault()` e refazer o download com `net.fetch` (perde a sessão/cabeçalhos do blob); `item.setSaveDialogOptions` (o diálogo nativo do Electron não chama `dialog.showSaveDialog`, e não é testável) |
| Menu completo (C30) | `File` (`Switch server`, `close`/`quit` por papel), `Edit` (`editMenu`), `View` (`viewMenu`), `Window` (`windowMenu`), `Help` (um item que chama `openExternal` com a URL da documentação do projeto); rótulos vêm de `desktop.menu.*`; os papéis recebem `label` traduzido; Cmd/Ctrl+K continua do listener do renderer (o menu não usa esse atalho) | acelerador `CmdOrCtrl+K` no menu (ativaria a palette fora do foco do app e duplicaria o listener) |
| Seleção de CI do desktop (C37) | `changes.py` ganha o quarto retorno e a quarta linha `run_desktop`: `true` para `desktop/` ou `frontend/` (e para tudo que já roda tudo); `false` para só backend/charts/docs; `test_changes.py` passa a comparar a quarta linha, derivada da segunda nos casos antigos | reutilizar `run_frontend` para o desktop (o job do desktop rodaria em mudanças só de `desktop/` sem rodar o frontend, e o contrário não é separável) |
| Verificação do bundle web (C38a) | `desktop/scripts/check-web-bundle.mjs <dir>`: lê todo `.js` do diretório, falha (exit 1) em qualquer `window.launchkit` que não seja seguido de `?.isDesktop`, e imprime o arquivo e o trecho | grep no CI (sem teste e sem tratar o minificado) |
| Jobs de CI do desktop | `ci.yml` ganha ao final `desktop-checks` (Ubuntu) e `desktop-e2e` (matriz `macos-latest`/`windows-latest`/`ubuntu-latest`, `fail-fast: false`), ambos condicionados a `run_desktop`; `desktop-release.yml` à parte, em `tags: desktop-v*` | adicionar o desktop ao job `frontend-checks` (mistura lock e Node) |
| Cabeçalho arrastável no macOS: forma literal (batch 3; corrige a linha anterior, que citava `style={{WebkitAppRegion}}`) | classes `[-webkit-app-region:drag]` no cabeçalho móvel (`<header>`), no cabeçalho do logotipo da sidebar e num espaçador `h-7` no topo da sidebar, e `[-webkit-app-region:no-drag]` em cada `button`/`a` dentro deles, só com `isDesktop() && platform === 'darwin'`; o teste lê `className` | `style={{WebkitAppRegion}}` (o jsdom descarta propriedades CSS que desconhece e o teste não veria nada) |
| Linux e o updater (C28; decisão do usuário, corrige a leitura do batch 3 de que Linux contava como assinado) | `LAUNCHKIT_DESKTOP_SIGNED` só vira `true` em macOS e Windows com certificado; em Linux é sempre `false` (updater desligado), porque não há assinatura real a verificar e o critério 28 vale como escrito. A regra do valor vive em `desktop/src/main/signed-build.ts` (`isSignedBuild(env)`), usada pelo `electron.vite.config.mts`; o proof roda o passo do `desktop-release.yml` por sistema e passa o valor resultante ao `createUpdater` | Linux sempre assinado (o `autoUpdater` rodaria em build sem assinatura, contra o C28) |
| Release macOS sem segredos (decisão do usuário) | o passo de resolução do `desktop-release.yml` falha no macOS (`::error::` com a lista dos segredos que faltam: `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`) antes do build, e nada é publicado; o release nunca usa `-c.mac.identity=-`; `package:dir` e `package:unsigned` locais seguem com a assinatura ad hoc. Windows sem certificado continua publicando sem assinatura, com `signed=false` | publicar dmg/zip sem assinatura nem notarização (o Gatekeeper recusa e o updater não roda); assinar ad hoc no release |
| Proof de C27 (updater sem rede) | o proof é o teste de unidade de `updater.test.ts`; o e2e roda o app desempacotado, onde `updater.start()` retorna na hora, então não exerce o updater e deixa de ser citado como proof; sem gancho de teste no código de produção | espião de `dialog` no e2e (passa mesmo com o updater quebrado) |
| Guarda do bundle no CI (C38a, corrige a linha anterior) | `desktop/package.json` ganha `check:web-bundle` (build web em diretório temporário e `check-web-bundle.mjs`) e o job `desktop-checks` o roda depois do build web, em edição aditiva do `ci.yml`; o script casa `window.launchkit`, `window['launchkit']`, `window["launchkit"]` e `globalThis.launchkit` fora de `?.isDesktop`, com testes positivo e negativo | script sem chamada (a guarda não rodava em lugar nenhum) |
| Segredos de assinatura por sistema (correção pós-verificação, rodada 2) | no passo de publicação do `desktop-release.yml`, `CSC_LINK`, `CSC_KEY_PASSWORD` e `APPLE_*` só chegam ao macOS (`runner.os == 'macOS'`), e `WIN_CSC_LINK`/`WIN_CSC_KEY_PASSWORD` só ao Windows, porque o electron-builder usa `CSC_LINK` no Windows quando `WIN_CSC_LINK` não existe; o passo de resolução exige `WIN_CSC_LINK` e `WIN_CSC_KEY_PASSWORD` para `signed=true` no Windows. Provas: `release-signing.test.ts` e `release-workflow.test.ts` | passar `CSC_*` a todos os sistemas (o Windows assinaria com o certificado do macOS enquanto o passo decidiu `signed=false`) |
| Pacote não publicado sem variáveis de release (primeira execução do CI) | `electron-builder.yml` deixa de ter `publish` (o `${env.LAUNCHKIT_DESKTOP_RELEASE_*}` quebrava `package:dir`/`package:unsigned` no `desktop-checks`, onde as variáveis não existem); o passo de publicação do `desktop-release.yml` passa `-c.publish.provider=github -c.publish.owner=... -c.publish.repo=...` a partir das variáveis que o passo de resolução exporta. Proof: `package-env.test.ts` empacota com `--dir` num ambiente sem as variáveis; `builder-config.test.ts`/`release-workflow.test.ts` leem a configuração de publicação do comando do workflow | variáveis de fallback no yml (o builder não tem valor padrão para `${env.X}`) |
| Janela do e2e (primeira execução do CI) | `launchApp` leva a janela a conteúdo de 1280×800 quando o runner a abriu menor (o Windows do CI abriu com layout estreito: sidebar fora da viewport); o teste de C31a escolhe `x/y/width/height` dentro da `workArea` do monitor (o macOS do CI limitou 1000×700 a 1000×677), sem mudar a asserção de igualdade | afrouxar a igualdade do teste de bounds |

- Linhas adicionais de `Landing` descobertas durante o build entram aqui, antes do código que as fecha.

## Checks

Tamanho de cada slice: piso de leitura = `wc -c` dos arquivos existentes que a slice lê ÷ 4. Estimativa de trabalho = 3 × piso (iteração, saída de teste) + código novo (linhas × 12) + custo fixo de execução dos proofs; fórmula declarada em `## Handoff`.

### S1 - Abrir o app · C1-C3 · 4 arquivos existentes · 8 KB · piso ~2k · estimativa ~34k

**C1** - Ao abrir o app há 1 janela e a URL dela começa com `app://launchkit/`
Proof: `cd desktop && npx playwright test e2e/launch.spec.ts -g "opens exactly one window at app://launchkit/"`

**C2a** - O handler do protocolo responde 200 com `index.html` para uma rota desconhecida (`/files`) e 200 com o arquivo para um asset existente
Proof: `cd desktop && npx vitest run src/main/app-protocol.test.ts -t "serves index.html with 200 for unknown routes"`
Proof: `cd desktop && npx vitest run src/main/app-protocol.test.ts -t "serves an existing asset with its content type"`

**C2b** - Recarregar a janela em `app://launchkit/files` renderiza a página de arquivos
Proof: `cd desktop && npx playwright test e2e/launch.spec.ts -g "reloading /files keeps the files page"`

**C3a** - Abrir uma segunda instância encerra o novo processo com código 0 e `BrowserWindow.getAllWindows().length` continua 1
Proof: `cd desktop && npx playwright test e2e/launch.spec.ts -g "second instance exits 0 and leaves one window"`

**C3b** - O evento `second-instance` restaura a janela minimizada e dá foco a ela
Proof: `cd desktop && npx vitest run src/main/single-instance.test.ts -t "restores a minimized window and focuses it"`

### S2 - Conectar a um servidor · C4-C10 · 11 arquivos existentes · 88 KB · piso ~22k · estimativa ~81k

**C4a** - Sem servidor configurado, a tela de conexão (título `Connect to a server` em en, `Conectar a um servidor` em pt-BR) aparece no lugar de `/setup` e de `/login`
Proof: `cd frontend && npx vitest run src/components/desktop-gate.test.tsx -t "shows the connect screen instead of setup and login"`

**C4b** - Sem servidor configurado, nenhuma chamada a `/api/*` sai do renderer
Proof: `cd desktop && npx playwright test e2e/connect.spec.ts -g "first run shows the connect screen and makes no api calls"`

**C5** - Com o campo de URL vazio, o botão de confirmar fica desabilitado
Proof: `cd frontend && npx vitest run src/pages/connect-server.test.tsx -t "confirm is disabled while the url is empty"`

**C6a** - Confirmar uma URL faz `GET <url>/api/health` (200 `{"status":"healthy"}`) e `GET <url>/api/info` (200 com `app_name`)
Proof: `cd desktop && npx vitest run src/main/server-connection.test.ts -t "calls health then info on the server"`

**C6b** - Durante a chamada o botão fica desabilitado com `Checking…` (pt-BR `Verificando…`)
Proof: `cd frontend && npx vitest run src/pages/connect-server.test.tsx -t "shows a disabled Checking button while connecting"`

**C6c** - Validado o servidor, a URL é salva
Proof: `cd desktop && npx vitest run src/main/server-connection.test.ts -t "saves the normalized url after a healthy server"`
Proof: `cd desktop && npx playwright test e2e/connect.spec.ts -g "connecting saves the url in config.json"`

**C6d** - Com `GET /api/setup/status` = `{"has_users": false}` navega para `/setup`
Proof: `cd frontend && npx vitest run src/pages/connect-server.test.tsx -t "goes to /setup when the server has no users"`
Proof: `cd desktop && npx playwright test e2e/connect.spec.ts -g "fresh server lands on /setup"`

**C6e** - Com `{"has_users": true}` navega para `/login`
Proof: `cd frontend && npx vitest run src/pages/connect-server.test.tsx -t "goes to /login when the server has users"`
Proof: `cd desktop && npx playwright test e2e/connect.spec.ts -g "server with users lands on /login"`

**C7a** - Sem rede, health com status ≠ 200, health sem `"status":"healthy"` e info ≠ 200 ou sem `app_name` falham a validação e não salvam nada
Proof: `cd desktop && npx vitest run src/main/server-connection.test.ts -t "rejects an unusable server and saves nothing"` (tabela com os 4 casos)

**C7b** - A tela mostra `Could not reach the server` (pt-BR `Não foi possível conectar ao servidor`) quando o motivo é `unreachable`
Proof: `cd frontend && npx vitest run src/pages/connect-server.test.tsx -t "shows the unreachable message in en and pt-BR"`

**C7c** - Servidor inalcançável de verdade: mensagem na tela e `config.json` sem `serverUrl`
Proof: `cd desktop && npx playwright test e2e/connect.spec.ts -g "unreachable server shows the error and saves nothing"`

**C8a** - Com servidor configurado, o portão renderiza o app sem mostrar a tela de conexão
Proof: `cd frontend && npx vitest run src/components/desktop-gate.test.tsx -t "renders the app when a server is configured"`

**C8b** - Reabrir o app com `config.json` existente chega em `/login` sem a tela de conexão
Proof: `cd desktop && npx playwright test e2e/connect.spec.ts -g "reopening with a saved server skips the connect screen"`

**C9a** - `https://srv.example.com/` é salvo como `https://srv.example.com`
Proof: `cd desktop && npx vitest run src/shared/server-url.test.ts -t "strips the trailing slash"`
Proof: `cd desktop && npx vitest run src/main/server-connection.test.ts -t "saves the normalized url after a healthy server"`

**C9b** - `srv.example.com` (e qualquer esquema que não seja http/https) é recusado com `Enter a URL starting with http:// or https://` e nada é salvo
Proof: `cd desktop && npx vitest run src/shared/server-url.test.ts -t "rejects urls without an http or https scheme"`
Proof: `cd desktop && npx vitest run src/main/server-connection.test.ts -t "refuses a url without protocol and saves nothing"`
Proof: `cd frontend && npx vitest run src/pages/connect-server.test.tsx -t "shows the protocol hint for invalid-url"`

**C9c** - `http://` fora de `localhost`, `127.0.0.1` e `[::1]` mostra um aviso e exige um segundo clique; nos 3 hosts locais não há aviso
Proof: `cd desktop && npx vitest run src/shared/server-url.test.ts -t "classifies http urls by host"`
Proof: `cd desktop && npx vitest run src/main/server-connection.test.ts -t "asks for confirmation on http to a remote host"`
Proof: `cd frontend && npx vitest run src/pages/connect-server.test.tsx -t "warns on insecure http and confirms on the second click"`

**C10a** - `Trocar de servidor` (menu Arquivo) abre a tela de conexão
Proof: `cd desktop && npx vitest run src/main/menu.test.ts -t "File menu has Switch server"`
Proof: `cd desktop && npx playwright test e2e/connect.spec.ts -g "switch server opens the connect screen"`

**C10b** - Ao confirmar uma nova URL, `localStorage` perde `token` e `workspace_id` apenas depois da validação, e nenhuma chamada com o token antigo vai ao novo servidor
Proof: `cd frontend && npx vitest run src/pages/connect-server.test.tsx -t "wipes the session only after the new server validates"`
Proof: `cd desktop && npx playwright test e2e/connect.spec.ts -g "switching servers drops the session and never leaks the old token"`

### S3 - Entrar e usar · C11-C15 · 9 arquivos existentes · 89 KB · piso ~22k · estimativa ~89k

**C11a** - Contra o servidor Python (Docker), e-mail e senha levam a `/` e `GET /api/users/me` retorna 200 pelo app
Proof: `cd desktop && LAUNCHKIT_E2E_SERVER_URL=<python> npx playwright test e2e/real-server.spec.ts -g "logs in with password$"`

**C11b** - Contra o servidor Python, e-mail, senha e TOTP levam a `/` e `GET /api/users/me` retorna 200 pelo app
Proof: `cd desktop && LAUNCHKIT_E2E_SERVER_URL=<python> npx playwright test e2e/real-server.spec.ts -g "logs in with password and TOTP$"`

**C11c** - Contra o servidor Node, os mesmos dois fluxos passam (depende da task 1, ausente desta base: proof pendente)
Proof: `cd desktop && LAUNCHKIT_E2E_SERVER_URL=<node> npx playwright test e2e/real-server.spec.ts` (pendente até a task 1 chegar na base)

**C12** - Uma resposta 401 leva a `app://launchkit/login` e `localStorage.token` fica vazio
Proof: `cd desktop && npx playwright test e2e/session.spec.ts -g "a 401 sends the app to /login and clears the token"`

**C13** - Depois de trocar de workspace, as chamadas saem com `X-Workspace-Id: <id>`
Proof: `cd desktop && npx playwright test e2e/session.spec.ts -g "switching workspace sends X-Workspace-Id"`

**C14a** - As chamadas ao servidor não levam `Origin` nem `Referer` de `app://launchkit`
Proof: `cd desktop && npx vitest run src/main/app-protocol.test.ts -t "drops origin and referer when proxying"`

**C14b** - Um servidor sem CORS para `app://launchkit` (rejeita qualquer `Origin` com 403) responde 200 ao login e a `/users/me`
Proof: `cd desktop && npx playwright test e2e/session.spec.ts -g "a server without CORS answers 200"`

**C15a** - Com `isDesktop`, `/login` não mostra nenhum controle de passkey
Proof: `cd frontend && npx vitest run src/pages/login.test.tsx -t "hides passkey controls when running on desktop"`

**C15b** - Com `isDesktop`, o menu da conta e as configurações da conta não oferecem passkeys
Proof: `cd frontend && npx vitest run src/components/workspace-switcher.test.tsx -t "hides the passkeys entry when running on desktop"`

### S4 - Janela segura · C16-C22 · 0 arquivos existentes (código novo no main) · piso ~0k · estimativa ~30k

**C16** - `webPreferences` da janela tem `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `webSecurity: true`
Proof: `cd desktop && npx playwright test e2e/security.spec.ts -g "window web preferences are locked down"`

**C17a** - Clique em `https://example.com` chama `shell.openExternal` com a URL e a janela continua em `app://launchkit/…`
Proof: `cd desktop && npx vitest run src/main/security.test.ts -t "opens https links externally"`
Proof: `cd desktop && npx playwright test e2e/security.spec.ts -g "external link opens in the system browser"`

**C17b** - `javascript:`, `file:` e `launchkit:` não chamam `openExternal`
Proof: `cd desktop && npx vitest run src/main/security.test.ts -t "never opens javascript, file or launchkit urls"`

**C18** - `will-navigate` e `window.open` para fora de `app://launchkit` são cancelados
Proof: `cd desktop && npx vitest run src/main/security.test.ts -t "blocks navigation away from app://launchkit"`
Proof: `cd desktop && npx playwright test e2e/security.spec.ts -g "renderer cannot navigate away"`

**C19** - `ipcMain.handle` com `senderFrame.url` fora de `app://launchkit/` rejeita sem executar
Proof: `cd desktop && npx vitest run src/main/ipc.test.ts -t "rejects calls from untrusted frames without running the handler"`

**C20a** - `window.launchkit` expõe exatamente os 8 membros
Proof: `cd desktop && npx playwright test e2e/security.spec.ts -g "window.launchkit exposes exactly the eight members"`

**C20b** - `window.require` e `window.process` não existem
Proof: `cd desktop && npx playwright test e2e/security.spec.ts -g "window.require and window.process do not exist"`

**C21** - Respostas de `app://launchkit/` têm `Content-Security-Policy` com `default-src 'self'` e sem `unsafe-eval`
Proof: `cd desktop && npx vitest run src/main/app-protocol.test.ts -t "sends a strict content security policy"`
Proof: `cd desktop && npx playwright test e2e/security.spec.ts -g "app responses carry the content security policy"`

**C22** - `@electron/fuses read` no app empacotado: `RunAsNode` e `EnableNodeCliInspectArguments` desligados; `EnableEmbeddedAsarIntegrityValidation` e `OnlyLoadAppFromAsar` ligados
Proof: `cd desktop && npm run package:dir && npx vitest run scripts/fuses.test.ts -t "packaged app fuses"` (build com assinatura ad hoc, macOS local; o `desktop-checks` repete `package:dir` e `fuses.test.ts` em `ubuntu-latest`; Windows não roda nenhum dos dois em lugar nenhum e não foi verificado)

### S5 - Instalar e atualizar · C23-C29 · 6 arquivos existentes · 36 KB · piso ~9k · estimativa ~45k

**C23a** - `desktop-release.yml` dispara por tag `desktop-v*`, usa matriz `macos-latest`/`windows-latest`/`ubuntu-latest` e publica no repositório de releases configurável
Proof: `cd desktop && npx vitest run scripts/release-workflow.test.ts -t "release workflow shape"`

**C23b** - A configuração do electron-builder declara os alvos `dmg` e `zip` (mac), `nsis` (win), `AppImage` e `deb` (linux), `appId` `com.launchkit.desktop` e `publish` github
Proof: `cd desktop && npx vitest run scripts/builder-config.test.ts -t "builder targets and app id"`

**C23c** - Build real da tag e publicação no GitHub Releases (3 sistemas, repositório de releases real)
Proof: pendente - job `desktop-release` no CI com a tag `desktop-v0.1.0`; ver `Local proof limits`

**C24** - `codesign --verify --deep --strict`, `xcrun stapler validate` e `spctl -a -t exec` aceitam o app macOS publicado
Proof: pendente - exige Developer ID e notarização (Unresolved 1); ver `Local proof limits`

**C25** - `Get-AuthenticodeSignature` do instalador Windows com `Status` `Valid`
Proof: pendente - exige certificado Windows (Unresolved 1); ver `Local proof limits`

**C26a** - Dado um evento de atualização disponível do updater, o banner aparece; ao clicar em instalar chama `installUpdate`
Proof: `cd frontend && npx vitest run src/components/update-available-banner.test.tsx -t "shows the desktop update banner and installs on click"`
Proof: `cd desktop && npx vitest run src/main/updater.test.ts -t "forwards update-downloaded to the renderer"`

**C26b** - Com release N+1 em canal de pré-lançamento, o app reinicia e `app.getVersion()` retorna N+1
Proof: pendente - exige app assinado e repositório de releases de teste; ver `Local proof limits`

**C27** - Sem rede, o app abre normalmente e nenhum diálogo de erro de atualização aparece
Proof: `cd desktop && npx vitest run src/main/updater.test.ts -t "swallows update check errors without dialogs"` e `-t "attaches a handler to the rejected check"` (o segundo mata o mutante sem `.catch`; o primeiro sozinho não)

**C28** - Em build sem assinatura, o `autoUpdater` não é iniciado
Proof: `cd desktop && npx vitest run src/main/updater.test.ts -t "does not start the autoUpdater for unsigned builds"`
Proof: `cd desktop && npx vitest run scripts/release-signing.test.ts` (roda o passo do `desktop-release.yml` por sistema e passa o valor padrão ao `createUpdater`: Linux e Windows sem certificado ficam sem updater; macOS sem segredos falha o release)

**C29a** - Com `isDesktop`, o renderer não faz requisição a `api.github.com`
Proof: `cd frontend && npx vitest run src/hooks/use-latest-release.test.tsx -t "does not call api.github.com on desktop"`
Proof: `cd desktop && npx playwright test e2e/session.spec.ts -g "renderer never calls api.github.com"`

**C29b** - No web, `useLatestRelease` continua consultando `api.github.com/repos/<UPDATE_CHECK_REPO>/releases/latest`
Proof: `cd frontend && npx vitest run src/hooks/use-latest-release.test.tsx -t "still queries api.github.com on the web"`

### S6 - Experiência nativa · C30-C34 · 6 arquivos existentes · 72 KB · piso ~18k · estimativa ~71k

**C30a** - O menu tem `File`, `Edit`, `View`, `Window`, `Help` (pt-BR `Arquivo`, `Editar`, `Exibir`, `Janela`, `Ajuda`) com `Trocar de servidor` em Arquivo
Proof: `cd desktop && npx vitest run src/main/menu.test.ts -t "menu top level labels in en and pt-BR"`

**C30b** - `Cmd+K` (macOS) ou `Ctrl+K` abre a command palette na janela do app
Proof: `cd desktop && npx playwright test e2e/native.spec.ts -g "Cmd or Ctrl\+K opens the command palette"`

**C31a** - Fechar e reabrir devolve `x`, `y`, `width`, `height` salvos
Proof: `cd desktop && npx vitest run src/main/window-state.test.ts -t "restores saved bounds"`
Proof: `cd desktop && npx playwright test e2e/native.spec.ts -g "window bounds survive a restart"`

**C31b** - Se o monitor salvo não existe mais, abre centralizada com 1280×800 e mínimo 800×600
Proof: `cd desktop && npx vitest run src/main/window-state.test.ts -t "falls back to centered 1280x800 when the display is gone"`

**C32** - No macOS, `titleBarStyle` é `hiddenInset`, o cabeçalho tem `-webkit-app-region: drag` e seus botões e campos têm `no-drag`
Proof: `cd desktop && npx vitest run src/main/window-state.test.ts -t "uses hiddenInset on macOS only"`
Proof: `cd frontend && npx vitest run src/components/app-layout.test.tsx -t "drag region on the header and no-drag on controls"`

**C33a** - Baixar um arquivo abre `dialog.showSaveDialog` com `defaultPath` igual ao nome do arquivo e, ao confirmar, grava os mesmos bytes
Proof: `cd desktop && npx vitest run src/main/downloads.test.ts -t "saves the same bytes at the chosen path"`
Proof: `cd desktop && npx playwright test e2e/native.spec.ts -g "download opens the save dialog and writes the same bytes"`

**C33b** - Ao cancelar o diálogo, nenhum arquivo é gravado
Proof: `cd desktop && npx vitest run src/main/downloads.test.ts -t "writes nothing when the dialog is cancelled"`

**C34** - `en.json` e `pt-BR.json` têm as mesmas chaves, incluindo as da tela de conexão, do menu e do banner
Proof: `cd frontend && npx vitest run src/locales/desktop-keys.test.ts -t "en and pt-BR have identical keys"`

### S7 - Verificação no CI · C35-C38 · 4 arquivos existentes · 20 KB · piso ~5k · estimativa ~29k

**C35** - O job `desktop-checks` executa lint, `tsc`, Vitest do main e do preload e o build sem assinatura, e falha se algum falhar
Proof: `cd desktop && npx vitest run scripts/ci-workflow.test.ts -t "desktop-checks runs lint typecheck vitest and unsigned build"`
Proof: `cd desktop && npm run lint && npm run typecheck && npm test && npm run build` (os mesmos passos, localmente)

**C36a** - O teste Playwright `smoke` abre o app, conecta a um servidor de teste, entra, troca de workspace e envia um arquivo (macOS, local)
Proof: `cd desktop && npx playwright test e2e/smoke.spec.ts -g "connects, signs in, switches workspace and uploads a file"`

**C36b** - O job `desktop-e2e` usa a matriz `macos-latest`/`windows-latest`/`ubuntu-latest`
Proof: `cd desktop && npx vitest run scripts/ci-workflow.test.ts -t "desktop-e2e matrix covers the three systems"`

**C36c** - O teste passa em Windows e Linux
Proof: pendente - job `desktop-e2e` no CI; ver `Local proof limits`

**C37** - `changes.py` marca `run_desktop=true` para `desktop/` ou `frontend/` e `false` para só `backend/`, `charts/` ou `docs/`; `test_changes.py` cobre os dois casos
Proof: `python3 .github/ci/test_changes.py CIChangesTest.test_run_desktop_selection`

**C38a** - O bundle do build web não referencia `window.launchkit` além de `window.launchkit?.isDesktop`
Proof: `cd desktop && npx vitest run scripts/check-web-bundle.test.ts` (positivo e negativo, inclusive `globalThis.launchkit` e `window['launchkit']`)
Proof: `cd desktop && npm run check:web-bundle` (constrói o web num diretório temporário e roda a guarda; o job `desktop-checks` a executa)

**C38b** - Os testes do frontend passam sem alteração de comportamento
Proof: `cd frontend && npm test`

## Swept

- validation: C6, C7, C9
- failure modes: C7, C12, C27
- idempotency and retry: C3, C8
- authorization: C12, C19
- concurrency and ordering: C3 (segunda instância); C10b (a sessão só cai depois da validação)
- data lifecycle: C10, C31
- external-dependency failure: C7, C27
- state transitions: C6, C10
- observability: not in scope - o cliente remoto usa o console padrão do Electron; o modo local grava logs (task 4)

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| validation failures of a server (4) | fetch throws · health ≠ 200 · health sem `healthy` · info ≠ 200 ou sem `app_name` - tabela em C7a; inalcançável real em C7c | - |
| URL inputs (7) | `https://srv.example.com/` C9a · `srv.example.com` C9b · `ftp://x` C9b · `http://remote.example` C9c · `http://localhost` C9c · `http://127.0.0.1` C9c · `http://[::1]` C9c | - |
| connect-screen locales (2) | en · pt-BR - título C4a, `Checking…` C6b, erro C7b | texto do aviso `http` e dica de protocolo em pt-BR: só paridade de chaves em C34 (batch 3) |
| screens that must not run before a server exists (2) | `/setup` · `/login` - C4a | - |
| reasons returned by `setServerUrl` (3) | `invalid-url` C9b · `insecure` C9c · `unreachable` C7a/C7b | - |
| renderer-visible `window.launchkit` members (8) | todos em C20a (S4); S2 usa `getServerUrl` e `setServerUrl` em C4b, C6c, C8b | `openExternal`, `onUpdateAvailable`, `installUpdate` até S4/S5 |
| privileged-scheme registration (1 assembly) | `main/index.ts` - C1 e C2b usam a montagem real; C2a usa a fábrica sobre a mesma função | - |
| `-webkit-app-region` header elements (header + 2 botões/campos) | C32 | S6 |
| CI jobs (3: `desktop-checks`, `desktop-e2e`, `desktop-release`) | C35, C36b, C23a | - |
| build targets (5: dmg, zip, nsis, AppImage, deb) | C23b | build real no CI (C23c) |
| OS for E2E (3) | macOS C36a | Windows, Linux C36c |
| passkey surfaces on desktop (3: botão em `/login`, método passkey no 2º fator, menu e diálogo de passkeys) | `/login` C15a · 2º fator C15a · menu C15b | - |

- Claims naming a status code, route or response shape: C2a (200), C6a, C7a, C14b (200, 403), C11a/b (200) - cada um tem proof que cruza a fronteira (Playwright ou servidor real); C2a e C6a/C7a têm também o proof de unidade e C2b/C6c/C7c no nível do app.
- No other check claims more than the single case its proof exercises.

## Local proof limits

Ambiente: macOS arm64, Node 22, Docker. Linux só no CI (`ubuntu-latest`); Windows só roda o `desktop-e2e`, sem `package:dir` nem leitura de fuses. **Não existem** conta Apple Developer, certificado Windows, nem repositório de releases do desktop (Unresolved 1 e 2). Não declaro proof verde onde ele não roda:

- C24, C25 - sem certificados. Entrega: configuração de assinatura e notarização no `electron-builder.yml` e no `desktop-release.yml`, lidos de segredos; builds sem assinatura circulam só para uso interno, com atualização desligada (C28).
- C23c - tag real e GitHub Releases. Entrega: workflow com parse do YAML validado (C23a) e build local sem assinatura (`electron-builder --dir`).
- C26b - o `autoUpdater` do macOS (Squirrel.Mac) exige app assinado e uma release N+1 num repositório de teste. Entrega: C26a prova o caminho do evento até o banner e `installUpdate`.
- C36c - Windows e Linux só no job de CI.
- C11c - servidor Node é da task 1, fora desta base. C11a e C11b passam contra o backend Python em Docker (`t03-*`).
- C11a e C11b só rodam com `LAUNCHKIT_E2E_SERVER_URL` definida; sem ela (o caso do `desktop-e2e` no CI) ficam `skipped`. A prova deles é manual, contra o servidor Python em Docker, e o CI não os cobre.
- C27 - o app roda desempacotado no Playwright e `updater.start()` retorna na hora (`packaged` falso), então nenhum e2e exerce o updater sem rede. O proof de C27 é só o teste de unidade `swallows update check errors without dialogs`; o teste de `launch.spec.ts` (`opens with an unreachable server and shows one window`) cobre apenas abrir com o servidor inalcançável e não é proof de C27. Sem gancho de teste no código de produção.
- C1, C22, C23 no nível "app empacotado/instalado": o spec aceita `LAUNCHKIT_E2E_EXECUTABLE` para rodar o mesmo teste contra o `.app` gerado por `package:dir` (batch 3); no batch 1 o proof roda no app não empacotado (`out/`), e essa diferença está registrada aqui.
- Batch 3, app empacotado: o fuse `enableNodeCliInspectArguments: false` impede o Playwright de se anexar ao `.app` (`Process failed to launch`), então `LAUNCHKIT_E2E_EXECUTABLE` não roda o Playwright contra o empacotado. Evidência no lugar: `package:dir` gera o app (assinatura ad hoc com `-c.mac.identity=-`, porque o arm64 mata um binário com fuses trocados e sem assinatura); executei o binário com `--remote-debugging-port` e ele serviu `app://launchkit/` com o título `launchkit`, lendo o frontend de `Resources/frontend`; `scripts/fuses.test.ts` lê os fuses do pacote. Isso é manual e não é um proof nomeado.
- Batch 3, C23b: o proof prova a configuração (parse do YAML). Os cinco artefatos (`dmg`, `zip`, `nsis`, `AppImage`, `deb`) não foram construídos aqui; só `--dir` no macOS arm64.
- Batch 3, C36c e CI de Linux: o `launchArgs` acrescenta `--no-sandbox` só em Linux com `CI` e o job usa `xvfb-run`; nenhum dos dois pôde ser executado localmente. Windows: sem execução.
- Batch 3, C30b: o proof como está escrito (`-g "Cmd or Ctrl+K opens the command palette"`) não encontra o teste, porque `-g` é uma expressão regular e `Ctrl+K` pede um ou mais `l` seguidos de `K`. O teste existe com esse título e passa com `-g "Cmd or Ctrl\+K opens the command palette"`.
- Batch 3, C37 e C38a: provados localmente; o `desktop-checks` e o `desktop-e2e` em si só rodam no GitHub Actions (YAML validado só por parse com `yaml` e pelos testes de forma).
- Updater e assinatura (correção pós-verificação, decisão do usuário): `LAUNCHKIT_DESKTOP_SIGNED` é `false` em Linux sempre (não há assinatura real), e `true` só em macOS e Windows com certificado; o release de macOS falha sem os cinco segredos de assinatura e notarização (Windows sem certificado publica sem assinatura e sem updater). `release-signing.test.ts` executa o passo do workflow por sistema; o build real e a publicação seguem pendentes (C23c).
- C22 (fuses): lidos localmente no macOS e no CI em Linux (`desktop-checks`); Windows não verificado (o `desktop-release` empacota no Windows, mas nenhum teste lê os fuses lá).
- Primeira execução do CI (correções): `package-env.test.ts` reproduz a falha de `package:dir` sem as variáveis de release com `--linux --dir` (o macOS `--dir` não expande `publish`; a falha só aparecia em Linux). O e2e do Windows falhou porque a janela abriu mais estreita que 1024px (layout móvel, sidebar fora da viewport); reproduzi o sintoma no macOS com uma janela de 900px (os dois testes falham sem o ajuste de `launchApp`, passam com ele), mas o tamanho real do monitor do runner do Windows e se `setContentSize` acima da tela vale lá só o CI prova. O teste de bounds (C31a) mantém a igualdade exata; o macOS do CI tem tela menor que 1000×700 + posição e o SO limitava a janela, então o retângulo agora cabe na `workArea` (não reproduzível sem uma tela menor; o CI prova).
- Linux no CI: `package:dir` gera `release/linux-unpacked/launchkit-desktop` (nome do pacote npm), não `launchkit`; `fuses.test.ts` não achava o app e falhava como "no packaged app". A busca virou `scripts/packaged-app.ts`, com teste (`packaged-app.test.ts`); o `package-env.test.ts` já empacota num diretório próprio e nunca toca `release/`. Só o CI em Linux prova a leitura dos fuses lá.
- `scripts/fuses.test.ts` pula sem `release/` fora do CI; com `CI` definida a ausência do app falha. No `desktop-checks` o `package:dir` roda antes de `npm test`.

## Handoff

Fórmula: estimativa = 3 × piso (iteração e saída de teste) + código novo (linhas × 12 tokens) + custo fixo dos proofs (10k, mais 10k quando há servidor real em Docker). O piso é `wc -c` ÷ 4 dos arquivos existentes que a slice lê; arquivos lidos por duas slices contam duas vezes na soma ingênua e uma só quando elas ficam no mesmo batch.

| Slice | Piso | Código novo | Fixo | Estimativa | Acumulado |
| --- | --- | --- | --- | --- | --- |
| S1 | 2k | ~700 linhas, 8k (inclui `package.json`, electron-vite, vitest, playwright) | 10k + 10k de instalação | ~34k | 34k |
| S2 | 22k | ~450 linhas, 5k | 10k | ~81k | 115k |
| S3 | 22k | ~250 linhas, 3k | 20k (Docker + Python) | ~89k | 204k |
| S4 | 0k | ~500 linhas, 6k | 10k | ~30k | - |
| S5 | 9k | ~700 linhas, 8k | 10k | ~45k | - |
| S6 | 18k | ~600 linhas, 7k | 10k | ~71k | - |
| S7 | 5k | ~300 linhas, 4k | 10k | ~29k | - |

Corte (slices inteiras, nunca no meio):

- **Batch 1 = S1 + S2 = ~115k.** Superfície única: processo principal (protocolo, configuração, validação de servidor, menu) e a tela de conexão. S3 elevaria o acumulado a 204k (ou ~178k descontando a leitura repetida de `login.tsx`, `api.ts` e `auth-provider.tsx`), acima de 150k; então o batch para depois de S2.
- **Batch 2 = S3 + S4 = ~119k.** S3 muda a superfície (login, passkeys, workspace, servidor real em Docker); S4 volta ao main para endurecer a janela. S5 elevaria a 164k.
- **Batch 3 = S5 + S6 + S7 = ~145k.** Empacotamento, updater, experiência nativa e CI; a leitura de `app-layout.tsx` é compartilhada entre S5 e S6.

### Fechamento do batch 1 (S1 + S2)

- **Onde o limite caiu:** C1, C2a, C2b, C3a, C3b, C4a, C4b, C5, C6a-C6e, C7a-C7c, C8a, C8b, C9a-C9c, C10a e C10b fechados (34 proofs verdes, cada um rodado pelo nome); C19 fechou antecipado, porque `trustedHandle` nasceu junto com os primeiros handlers (`desktop/src/main/ipc.test.ts`). Último commit de código: `fb5dd71`. Estado da base: `desktop/` com main, preload, shared e e2e; `frontend/` com `platform.ts`, `connect-server.tsx`, `desktop-gate.tsx`, build `--mode desktop`. O preload já expõe os 8 membros, mas `openExternal` (S4), `installUpdate` e `onUpdateAvailable` (S5) ainda não têm handler no main. Próximo batch: S3 + S4.
- **O que o usuário já decidiu (sem decisão nova no batch):** electron-builder; `appId` `com.launchkit.desktop`; releases em repositório separado, valor de teste configurável; URL sem protocolo recusada; trocar de servidor apaga a sessão sem confirmação; sem logs próprios; sem certificados de assinatura (C24, C25, C26b e C23c ficam pendentes). Leituras minhas, registradas aqui por não virarem linha de `Landing`: info sem `app_name` conta como servidor inválido (C6/C7); o idioma do menu vem de `app.getLocale()` e o do renderer segue o i18n do frontend; o campo de URL não vem preenchido com o servidor atual na troca de servidor.
- **O que foi abandonado:** `npm install` com todas as dependências de uma vez cai no bug `edgesOut` do arborist do npm 10.9.4 (peer opcional de `jsdom`/`canvas`); instalei uma a uma, e `npm ci` reproduz o `package-lock.json`. `app.getAppPath()` para achar o `dist-desktop` (aponta para `out/main` quando o Playwright inicia pelo arquivo); troquei por caminho relativo a `__dirname`, que o batch de empacotamento (S5) substitui pelo caminho empacotado. Configs `.ts` do vitest, electron-vite e playwright viraram `.mts`/`.mjs` (pacote sem `"type": "module"`, para manter main e preload em CJS). `platform.test.ts` virou `.tsx` porque `src/lib/*.test.ts` roda no ambiente node do vitest.

### Fechamento do batch 2 (S3 + S4)

- **Onde o limite caiu:** C11a, C11b, C12, C13, C14a, C14b, C15a, C15b (S3) e C16, C17a, C17b, C18, C19, C20a, C20b, C21, C22 (S4) fechados, cada proof rodado pelo nome e verde; C11a/C11b contra o backend Python construído de `backend/Dockerfile` em containers `t03-*` (derrubados ao fim). **C11c segue pendente** (servidor Node é da task 1, ausente da base; o spec `e2e/real-server.spec.ts` já roda com `LAUNCHKIT_E2E_SERVER_URL=<node>`). Suítes completas: `desktop` 37 testes de unidade e 22 de Playwright, `frontend` 461 testes (C38b). Último commit de código: `1aa5462` (as linhas de `Landing` do batch entraram em `d284f7f`, antes do código). Estado da base: `desktop/src/main/security.ts` (allowlist, navegação, permissões), CSP em `app-protocol.ts`, `desktop/electron-builder.yml` mínimo (appId, fuses, `identity: null`) com `package:dir`, `scripts/fuses.test.ts`; `frontend/` esconde passkeys atrás de `isDesktop()` e o build `--mode desktop` remove a fonte do Google. Próximo batch: S5 + S6 + S7.
- **O que o usuário já decidiu (sem decisão nova no batch):** nenhuma pergunta ao usuário. Decisões minhas, todas em `Landing` antes do código: fonte Geist removida no modo desktop (não empacotada), CSP literal, `openExternal` com `http:`/`https:`/`mailto:`, `will-navigate` só cancela, fuses via `electronFuses` do builder. Leituras sem linha de `Landing`: o `Retry-After`/limites do servidor Python (registro: 3 por hora por endereço; login: 5 por minuto) obrigam a zerar o Redis do servidor de teste entre execuções do `real-server.spec.ts` (cabeçalho do arquivo); `scripts/fuses.test.ts` usa `it.skipIf` quando não há `release/` (sem `package:dir` não há app para ler), então `npm test` do CI não o executa até o batch 3 rodar `package:dir` no job; `index.ts` ainda procura `frontend/dist-desktop` por caminho relativo (o app empacotado não abre a interface até S5 incluir o build do frontend em `extraResources`).
- **O que foi abandonado:** abrir links externos também em `will-navigate` (um `location.href` de script abriria o navegador sem clique; só `window.open`/`target=_blank` abre); `<meta http-equiv>` para a CSP; criar o administrador e usar sempre a mesma conta nos dois proofs do servidor real (`/api/setup/create-admin` só funciona com a base vazia, então os testes registram contas novas com e-mail aleatório e pulam o onboarding por `PATCH /api/users/me`); plugin do Vite depois do Tailwind (o `@import` remoto sobrevivia, o plugin tem de vir antes).

### Fechamento do batch 3 (S5 + S6 + S7)

- **Onde o limite caiu:** C23a, C23b, C26a, C27, C28, C29a, C29b (S5); C30a, C30b, C31a, C31b, C32, C33a, C33b, C34 (S6); C35, C36a, C36b, C37, C38a, C38b (S7) fechados, cada proof rodado pelo nome e verde (o de C30b só com `Ctrl\+K` escapado, ver `Local proof limits`). Sem proof local: C23c, C24, C25, C26b, C36c (sem certificados, sem repositório de releases e sem Windows/Linux) e C11c (task 1). Último commit de código: `f5e3f44` (S5 `552f990`, S6 `ffdb348`, S7 `f5e3f44`; as linhas de `Landing` do batch entraram em `0d00e88`, a de correção do arrasto no macOS junto do fechamento). Suítes: `desktop` 64 testes de unidade e 26 de Playwright (2 pulados do servidor real), `frontend` 469 testes, `test_changes.py` 8 testes. Próximo passo: o Verifier sobre `91cc000..HEAD`.
- **O que o usuário já decidiu (sem decisão nova no batch):** nenhuma pergunta ao usuário. Decisões minhas, em `Landing` antes do código: divisão do repositório de releases em duas variáveis de ambiente, `__SIGNED_BUILD__`, banner separado por plataforma, `extraResources`, `author` com e-mail `noreply@launchkit.invalid` (trocar no go-live), estado da janela, classes de arrasto, downloads por arquivo temporário, menu, `run_desktop` e jobs de CI. Leituras sem linha de `Landing`: `--no-sandbox` e `xvfb-run` para o job Linux; o item de Ajuda abre `https://github.com/gabrielauzier/launchkit`; `package:dir` e `package:unsigned` usam `-c.mac.identity=-`.
- **O que foi abandonado:** `-c.mac.identity=null` (o arm64 mata o app com fuses trocados e sem assinatura; `-` assina ad hoc); Playwright contra o `.app` empacotado (o fuse de inspeção impede); `style={{WebkitAppRegion}}` (o jsdom descarta a propriedade; viraram classes); provar `api.github.com` só pela lista de requisições do Playwright (a CSP bloqueia antes da rede e o teste passava com o código errado; o teste lê também as mensagens de console da CSP, e foi verificado contra o código revertido); `yaml` não estava instalado: entrou como devDependency do desktop.

### Correções pós-verificação (batch 3)

- **Decididas pelo usuário:** (1) Linux nunca conta como assinado: `LAUNCHKIT_DESKTOP_SIGNED=false`, updater desligado, critério 28 como escrito (a leitura do batch 3 de que Linux era assinado está revogada); (2) o release de macOS falha sem os segredos de assinatura e notarização, sem publicar dmg/zip e sem `-c.mac.identity=-`. Ambas com linha de `Landing` antes do código.
- **C27:** o e2e não exercia o updater (app desempacotado; `updater.start()` retorna na hora). O proof é só o teste de unidade; o spec de `launch.spec.ts` foi renomeado para o que de fato prova (abrir com servidor inalcançável) e saiu do checklist como proof de C27.
- **C38a:** `check-web-bundle.mjs` passou a ter testes, casa `globalThis.launchkit` e `window['launchkit']`, e roda no `desktop-checks` por `npm run check:web-bundle`.
- **Proofs:** C11a e C11b com regex ancorado; `fuses.test.ts` falha em CI sem `release/`; `release-workflow.test.ts` afirma divisão owner/repo, `signed=false` em Linux e os `latest*.yml`; C11a e C11b declarados como não cobertos pelo CI em `Local proof limits`.
- **Ainda pendente (sem mudança):** C23c, C24, C25, C26b, C36c, C11c.
