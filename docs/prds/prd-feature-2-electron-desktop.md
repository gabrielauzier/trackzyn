# PRD: Aplicativo desktop com Electron

**Product/Feature Name:** launchkit Desktop (Electron)
**Status:** Draft
**Author:** Gabriel Auzier (com Claude)
**Stakeholders:** Mantenedor do launchkit, contribuidores, equipes que criam projetos a partir do template
**Date Created:** 2026-10-15
**Last Updated:** 2026-10-15
**Version:** 1.0

Plano técnico de referência: [feature-2-electron-desktop.md](../plans/feature-2-electron-desktop.md)

---

## Executive Summary

**One-liner:** Empacotar o frontend React do launchkit como aplicativo desktop para macOS, Windows e Linux, com instalador, atualização automática e, em uma segunda etapa, funcionamento local e offline.

**Overview:** O launchkit hoje só é acessível pelo navegador. Esta feature entrega um aplicativo desktop que reaproveita o mesmo código de interface da versão web, com janela própria, menu nativo, links externos no navegador do sistema, downloads com diálogo nativo e atualização automática pelo GitHub Releases.

O app tem dois modos. No **modo A (cliente remoto)**, ele se conecta a um servidor launchkit já existente, informado pelo usuário no primeiro uso. No **modo B (local)**, ele roda o backend Node.js (da [Feature 1](prd-feature-1-node-fastify-backend.md)) dentro do próprio aplicativo, com banco local, sem servidor, Postgres ou Redis. O modo A é independente e entra primeiro. O modo B depende da Feature 1.

O frontend não ganha rotas nem contratos novos: um protocolo próprio (`app://launchkit`) serve a interface e encaminha `/api` ao backend ativo pelo processo principal, o que elimina CORS e mantém o cliente HTTP atual intacto.

**Quick Facts:**
- **Target Users:** Usuários finais de produtos construídos sobre o launchkit; desenvolvedores que querem distribuir um app desktop a partir do template
- **Problem Solved:** Sem app desktop, não há instalação nativa, atualização automática nem uso offline
- **Key Metric:** Taxa de sucesso do teste E2E de fumaça (abrir, conectar, entrar, usar) nos três sistemas, no CI
- **Target Launch:** Modo A proposto para 2026-12-18; modo B para 2027-02-26 (a confirmar)

---

## Problem Statement

### The Problem

Usuários de produtos baseados no launchkit precisam abrir o navegador e lembrar a URL do servidor. Não há instalador, ícone no dock ou barra de tarefas, atualização gerenciada, nem forma de usar o produto sem servidor.

### Current State

- Só existe a versão web (React + Vite), servida por nginx em produção.
- O banner de atualização compara a versão com a última release do GitHub e apenas avisa o usuário.
- Todo uso exige um servidor com PostgreSQL e Redis acessíveis.

### Impact

**User Impact:**
- Acesso por URL em vez de aplicativo instalado
- Sem uso offline nem em máquina pessoal sem servidor
- Atualizações dependem do operador do servidor

**Business Impact:**
- O template não cobre o cenário "aplicativo desktop", comum em ferramentas internas e produtos de produtividade
- Times que querem desktop precisam montar o empacotamento, a segurança do Electron e a distribuição por conta própria

### Why Now?

O frontend já está maduro (UI kit, i18n, tema claro e escuro) e a Feature 1 abre a possibilidade de um backend Node embutido. Fazer o modo A agora valida o empacotamento e a segurança sem esperar a Feature 1.

---

## Goals & Objectives

### Business Goals

1. **Estender o template ao desktop:** quem cria um projeto recebe o empacotamento Electron pronto.
2. **Distribuição confiável:** instaladores assinados e atualização automática publicados por CI.
3. **Habilitar o uso offline:** backend local embutido, como diferencial do template.

### User Goals

1. **Instalar e abrir como um app comum:** sem navegador e sem lembrar a URL.
2. **Usar sem servidor:** criar dados e usar o produto no próprio computador (modo B).
3. **Manter o app atualizado:** sem intervenção manual.

### Non-Goals

- Aplicativos móveis (Capacitor ou React Native)
- Sincronização entre o modo local e um servidor remoto
- Redesenhar a interface para um visual nativo de cada sistema

---

## User Personas

### Primary Persona: Usuário final do produto

**Demographics:**
- Role/Title: Profissional que usa o produto no dia a dia
- Tech savviness: Média
- Location: Global

**Behaviors:**
- Instala aplicativos, prefere ícone no dock ou na barra de tarefas
- Usa o computador pessoal e o de trabalho

**Needs & Motivations:**
- Abrir o produto com um clique, entrar e trabalhar
- Não perder dados quando está sem internet (modo B)

**Pain Points:**
- Precisa achar e digitar a URL do servidor
- Abas do navegador se perdem

**Quote:** _"Quero abrir o aplicativo e já estar no meu workspace."_

### Secondary Persona: Operador / administrador do servidor

**Behaviors:**
- Mantém um servidor launchkit (Docker Compose ou Helm)

**Needs & Motivations:**
- Distribuir um cliente para a equipe, sem expor o servidor além do necessário
- Manter o login por SSO (OIDC) funcionando

**Pain Points:**
- Cada usuário precisa receber a URL e instruções

### Secondary Persona: Desenvolvedor que parte do template

**Behaviors:**
- Quer um app desktop seguro e distribuível sem estudar a fundo as práticas de segurança do Electron

**Needs & Motivations:**
- Um empacotamento com os padrões de segurança aplicados desde o início

---

## User Stories & Requirements

### Epic: Cliente desktop remoto (modo A)

#### Must-Have Stories (P0)

##### Story 1: Abrir o app e ver a interface

**User Story:**
```
As a usuário final,
I want abrir o aplicativo desktop e ver a interface do launchkit,
So that eu use o produto sem navegador.
```

**Acceptance Criteria:**
- [ ] Given o app instalado, when o abro, then a interface carrega em uma janela única a partir de `app://launchkit`
- [ ] Given a navegação interna (por exemplo `/files`), when recarrego a janela, then a rota continua funcionando (fallback para `index.html`)
- [ ] Given um segundo clique no ícone, when o app já está aberto, then a janela existente recebe foco e nenhuma segunda instância é criada

**Priority:** Must Have (P0)
**Effort:** M
**Dependencies:** Nenhuma

---

##### Story 2: Conectar a um servidor

**User Story:**
```
As a usuário final,
I want informar a URL do meu servidor launchkit,
So that o app use meus dados e meu workspace.
```

**Acceptance Criteria:**
- [ ] Given que não há servidor configurado, when abro o app, then vejo a tela "Conectar a um servidor" antes de `/setup` e `/login`
- [ ] Given uma URL, when confirmo, then o app valida com `GET /api/health` e `GET /api/info` e mostra erro claro se falhar
- [ ] Given um servidor configurado, when abro o app novamente, then não preciso informar a URL
- [ ] Given o menu do app, when escolho trocar de servidor, then posso informar outra URL
- [ ] Edge case: URL sem protocolo, com barra final, ou `http` para host não local mostram aviso ou são normalizadas

**Priority:** Must Have (P0)
**Effort:** M
**Dependencies:** Story 1

---

##### Story 3: Entrar com e-mail, senha e TOTP

**User Story:**
```
As a usuário final,
I want entrar com minhas credenciais no app,
So that eu acesse meus workspaces como na versão web.
```

**Acceptance Criteria:**
- [ ] Given um servidor Python e um servidor Node, when entro com e-mail e senha (e TOTP, se ativo), then o login funciona em ambos
- [ ] Given o token expirado (401), when uma chamada falha, then volto para a tela de login do app
- [ ] Given que mudo de workspace, when faço uma chamada, then o cabeçalho `X-Workspace-Id` é enviado como na web
- [ ] Nenhum cabeçalho CORS é necessário no servidor para o app funcionar

**Priority:** Must Have (P0)
**Effort:** S
**Dependencies:** Story 2

---

##### Story 4: Janela segura por padrão

**User Story:**
```
As a usuário final,
I want que o app não exponha meu computador a páginas ou scripts maliciosos,
So that usar um app desktop não seja mais arriscado que usar o navegador.
```

**Acceptance Criteria:**
- [ ] `contextIsolation`, `sandbox` e `webSecurity` ligados; `nodeIntegration` desligado (verificado por teste)
- [ ] Given um link externo, when clico, then ele abre no navegador do sistema (apenas `http` e `https`), e a janela do app não navega para fora de `app://launchkit`
- [ ] Todo handler de IPC valida o remetente (`senderFrame`)
- [ ] A API exposta ao renderer (`window.launchkit`) é mínima e tipada
- [ ] O build usa CSP restritiva e Electron Fuses (sem `RunAsNode`, com validação de integridade do ASAR)

**Priority:** Must Have (P0)
**Effort:** M
**Dependencies:** Story 1

---

##### Story 5: Instalador e atualização automática

**User Story:**
```
As a usuário final,
I want instalar o app com um instalador assinado e receber atualizações sozinho,
So that eu use sempre a versão mais recente e sem avisos de segurança do sistema.
```

**Acceptance Criteria:**
- [ ] Given uma tag `desktop-v*`, when o CI executa, then publica `dmg` e `zip` (macOS), `nsis` (Windows) e `AppImage` e `deb` (Linux) no GitHub Releases
- [ ] Given o macOS, when instalo o app, then ele está assinado com Developer ID e notarizado, e abre sem alerta do Gatekeeper
- [ ] Given o Windows, when instalo o app, then o instalador está assinado
- [ ] Given uma release nova, when o app está aberto, then o banner de atualização oferece instalar, e após reiniciar a nova versão está ativa
- [ ] Edge case: sem rede, o app abre normalmente e tenta atualizar depois

**Priority:** Must Have (P0)
**Effort:** L
**Dependencies:** Story 1

---

#### Should-Have Stories (P1)

##### Story 6: Experiência nativa

**User Story:**
```
As a usuário final,
I want menu nativo, atalhos e comportamento esperado de um app desktop,
So that o app se pareça com os demais da minha máquina.
```

**Acceptance Criteria:**
- [ ] Given o menu, when o abro, then vejo Arquivo, Editar, Exibir, Janela e Ajuda; a ⌘K (ou Ctrl+K) abre a command palette
- [ ] Given que fecho o app, when o reabro, then a janela volta ao tamanho e posição anteriores
- [ ] Given o macOS, when uso a janela, then o cabeçalho tem área de arrasto e os botões de janela não cobrem o conteúdo
- [ ] Given um download de arquivo, when o inicio, then aparece o diálogo nativo de salvar
- [ ] Strings novas existem em `en.json` e `pt-BR.json`

**Priority:** Should Have (P1)
**Effort:** M
**Dependencies:** Story 1

---

##### Story 7: Login por SSO (OIDC) no desktop

**User Story:**
```
As a usuário que entra por SSO,
I want fazer login pelo navegador do sistema e voltar ao app,
So that eu use minha conta corporativa sem digitar senha no app.
```

**Acceptance Criteria:**
- [ ] Given um servidor com OIDC, when escolho entrar com SSO, then o login abre no navegador do sistema (nunca em uma janela embutida)
- [ ] Given que concluo o login, when o provedor redireciona, then o deep link `launchkit://auth/callback` devolve o token ao app e entro
- [ ] Given um `redirect_target` fora da allowlist (`OIDC_DESKTOP_REDIRECT`), when chamo `GET /api/auth/oidc/login`, then recebo erro e nenhum redirecionamento acontece
- [ ] A mudança de API vale nas duas stacks e tem teste de contrato

**Priority:** Should Have (P1)
**Effort:** M
**Dependencies:** Story 3; suíte de contrato da Feature 1

---

#### Nice-to-Have Stories (P2)

##### Story 8: Extras do sistema

**User Story:**
```
As a usuário final,
I want guardar meu token com segurança, receber notificações nativas e abrir o app ao ligar o computador,
So that o app seja mais conveniente e mais seguro.
```

**Acceptance Criteria:**
- [ ] Given que entro, when o token é salvo, then fica no armazenamento seguro do sistema (Keychain, DPAPI ou libsecret)
- [ ] Given uma opção nas configurações, when ativo "abrir ao iniciar", then o app abre no login do sistema
- [ ] Given um evento relevante, when ele ocorre, then uma notificação nativa é exibida

**Priority:** Nice to Have (P2)
**Effort:** M
**Dependencies:** Story 3

---

### Epic: Modo local e offline (modo B)

Depende da [Feature 1](prd-feature-1-node-fastify-backend.md) concluída até a Fase 5 (admin e arquivos) e das interfaces `KeyValueStore` e `JobQueue` em memória.

#### Should-Have Stories (P1)

##### Story 9: Usar o app sem servidor

**User Story:**
```
As a usuário final,
I want usar o launchkit apenas no meu computador,
So that eu trabalhe sem servidor e sem internet.
```

**Acceptance Criteria:**
- [ ] Given o primeiro uso, when abro o app, then posso escolher "Conectar a um servidor" ou "Usar neste computador"
- [ ] Given o modo local, when o app inicia, then o backend Node sobe em porta aleatória de `127.0.0.1`, e toda chamada exige um token de sessão aleatório injetado pelo processo principal
- [ ] Given o modo local sem rede, when crio usuário, workspace e arquivo, fecho e reabro o app, then os dados continuam lá
- [ ] Given uma atualização do app com migrations, when o app inicia, then um backup do banco é feito antes de migrar
- [ ] O banco é PGlite em `userData/db` e os arquivos ficam em `userData/files`

**Priority:** Should Have (P1)
**Effort:** XL
**Dependencies:** Feature 1 (Fase 5 em diante)

---

##### Story 10: Exportar e importar dados locais

**User Story:**
```
As a usuário do modo local,
I want exportar e importar meus dados,
So that eu faça backup e consiga migrar para um servidor.
```

**Acceptance Criteria:**
- [ ] Given o menu, when escolho exportar, then recebo um arquivo com todos os dados e arquivos do modo local
- [ ] Given um arquivo exportado, when escolho importar numa instalação nova do modo local, then os dados são restaurados
- [ ] Given um arquivo corrompido ou de versão incompatível, when importo, then recebo um erro claro e nada é alterado

**Priority:** Should Have (P1)
**Effort:** M
**Dependencies:** Story 9

---

### Functional Requirements

| Req ID | Description | Priority | Status |
|--------|-------------|----------|--------|
| FR-001 | O app serve o frontend em `app://launchkit` com fallback para `index.html`, sem trocar `BrowserRouter` por `HashRouter` | Must Have | Open |
| FR-002 | Chamadas a `/api/*` são encaminhadas pelo processo principal ao backend ativo; o cliente HTTP do frontend (`baseURL: '/api'`) não muda | Must Have | Open |
| FR-003 | A URL do servidor é validada por `/api/health` e `/api/info`, persistida e pode ser trocada pelo menu | Must Have | Open |
| FR-004 | O frontend identifica o desktop por `window.launchkit?.isDesktop`; o build web não muda de comportamento | Must Have | Open |
| FR-005 | Instância única e registro do protocolo `launchkit://` | Must Have | Open |
| FR-006 | Os controles de segurança da Story 4 são aplicados e testados | Must Have | Open |
| FR-007 | O CI gera instaladores assinados para macOS, Windows e Linux a partir de tags `desktop-v*`, e publica no GitHub Releases | Must Have | Open |
| FR-008 | O banner de atualização usa o electron-updater quando `isDesktop` e a verificação do GitHub quando é web | Must Have | Open |
| FR-009 | Passkeys ficam ocultas na interface quando `isDesktop` (v1) | Must Have | Open |
| FR-010 | OIDC usa navegador do sistema e deep link, com `redirect_target` validado por allowlist, nas duas stacks de backend | Should Have | Open |
| FR-011 | No modo local, o backend Node roda em `utilityProcess`, com PGlite, `KeyValueStore` e `JobQueue` em memória, e token de sessão local | Should Have | Open |
| FR-012 | O modo local faz backup do banco antes de rodar migrations e permite exportar e importar dados | Should Have | Open |

### Non-Functional Requirements

| Req ID | Category | Description | Target |
|--------|----------|-------------|--------|
| NFR-001 | Segurança | Checklist do Electron (isolamento de contexto, sandbox, navegação, IPC, Fuses, CSP) | 100% verificado por teste automatizado |
| NFR-002 | Compatibilidade | Sistemas suportados | macOS (arm64 e x64), Windows 10 ou superior, Linux (AppImage e deb) |
| NFR-003 | Qualidade | Teste E2E de fumaça (Playwright com `_electron.launch`) | Passa nos três sistemas no CI |
| NFR-004 | Distribuição | Assinatura e notarização | macOS notarizado; Windows assinado |
| NFR-005 | Privacidade | O app não envia telemetria; só fala com o servidor configurado e com o GitHub Releases para atualização | Verificado por revisão de rede |
| NFR-006 | Acessibilidade | Mesmas garantias da interface web | Sem regressão nos testes de acessibilidade do frontend |
| NFR-007 | Confiabilidade | Falha ao iniciar o backend local | Mensagem clara e opção de abrir os logs; os dados não são alterados |

---

## Success Metrics

### Key Performance Indicators (KPIs)

#### Primary Metric (North Star)

**Metric:** Taxa de sucesso do E2E de fumaça nos três sistemas
**Definition:** Execuções do job `desktop-e2e` aprovadas dividido pelo total, na `main` e nas tags de release
**Current Baseline:** Não existe app desktop hoje
**Target:** 100% nas execuções de release
**Why This Metric:** Mostra que o ciclo abrir, conectar, entrar e usar funciona em cada sistema suportado

#### Secondary Metrics

| Metric | Current | Target | Timeframe |
|--------|---------|--------|-----------|
| Alvos de instalador publicados por release | 0 | 3 sistemas (macOS, Windows, Linux) | A cada release |
| Itens do checklist de segurança verificados por teste | 0 | 100% | No lançamento do modo A |
| Atualização automática de versão N para N+1 em ambiente de pré-produção | Não testada | Sucesso nos três sistemas | Antes de cada release estável |
| Dados preservados após fechar e reabrir no modo local, sem rede | Não aplicável | 100% dos casos de teste | No lançamento do modo B |
| Backup automático antes de migrar (modo local) | Não aplicável | 100% das migrations | No lançamento do modo B |

### Measurement Framework

**Framework Used:** Custom (sem telemetria no template; a medição é feita pelo CI e pelos testes)

**Adoção:**
- Downloads por release no GitHub (indicador externo, sem coleta pelo app)

**Qualidade:**
- Resultado dos jobs `desktop-checks` e `desktop-e2e`
- Resultado do teste de atualização em pré-produção

### Analytics Implementation

**Eventos a acompanhar:** nenhum. O app não coleta telemetria.

**Dashboards:**
- Página de execuções do GitHub Actions para `desktop-checks`, `desktop-e2e` e `desktop-release`
- Página de downloads do GitHub Releases

---

## Scope

### In Scope

**Phase 1 (MVP, modo A):**
- Pacote `desktop/` com electron-vite e electron-builder
- Protocolo `app://launchkit` e proxy `/api` pelo processo principal
- Tela "Conectar a um servidor" e troca de servidor
- Hardening de segurança completo (Story 4)
- Menu nativo, downloads com diálogo nativo, links externos no navegador
- Instaladores assinados, publicação no GitHub Releases e atualização automática
- Login por e-mail, senha e TOTP; login por SSO via deep link
- Testes: unitários do main e do preload, E2E de fumaça com Playwright
- Jobs de CI `desktop-checks`, `desktop-e2e` e `desktop-release`

**Phase 2 (modo B, depende da Feature 1):**
- Backend Node embutido em `utilityProcess`, PGlite, interfaces em memória e token de sessão local
- Seleção de modo no primeiro uso
- Backup antes de migrar, exportar e importar dados

### Out of Scope

**Explicitamente excluído:**
- Passkeys no desktop na v1: o suporte do WebAuthn no Electron é limitado e a origin `app://` não bate com o RP ID do servidor
- Embutir o backend Python (PyInstaller): binário pesado, assinatura complexa no macOS e ainda exigiria Postgres local
- Sincronização entre modo local e servidor: complexidade alta, escopo próprio
- Aplicativos móveis: tecnologia e distribuição diferentes
- Reescrita da interface para visual nativo

### Future Considerations

- Passkeys no desktop, se o suporte do Electron amadurecer
- Token no armazenamento seguro do sistema (Story 8)
- Ícone na bandeja para o modo local
- Sincronização local e remota

---

## Technical Considerations

### High-Level Architecture

```
renderer (frontend React, app://launchkit)
   │  axios baseURL '/api'
   ▼
main (protocol.handle)  ── modo A ─▶  servidor launchkit remoto (Python ou Node)
   │
   └──────────────────── modo B ─▶  utilityProcess: backend Node (127.0.0.1:porta aleatória, PGlite)
preload: window.launchkit { isDesktop, platform, appVersion, get/setServerUrl, openExternal, updates }
```

### Technology Stack

**Frontend:**
- O mesmo `frontend/` (React 19, Vite), construído com `vite build --mode desktop`
- Novo `src/lib/platform.ts` e tela de conexão a servidor

**Desktop:**
- Electron, electron-vite, electron-builder, electron-updater
- Vitest (main e preload) e Playwright (`_electron`)

**Infrastructure:**
- GitHub Actions: matriz `macos-latest`, `windows-latest` e `ubuntu-latest`
- GitHub Releases como fonte de distribuição e de atualização
- Segredos de assinatura (Apple Developer ID e notarização; certificado Windows) no GitHub Actions

### API Requirements

**Mudança de endpoint (Story 7):**
- `GET /api/auth/oidc/login` aceita `redirect_target` opcional, validado contra `OIDC_DESKTOP_REDIRECT`; implementado nas duas stacks e coberto por teste de contrato

Nenhuma outra mudança de API. Nenhuma API externa além do GitHub Releases (atualização).

### Security Requirements

- **Authentication:** igual à web; token bearer no cabeçalho; OIDC no navegador do sistema (RFC 8252); modo local com token de sessão aleatório por execução
- **Authorization:** inalterada; papéis de workspace continuam no servidor
- **Data Encryption:** TLS ao servidor remoto (aviso ao usar `http` fora de host local); no modo local, o banco fica no diretório do usuário, protegido pelas permissões do sistema
- **Compliance:** sem requisito regulatório específico
- **Hardening:** `contextIsolation`, `sandbox`, `nodeIntegration` desligado, `webSecurity`, CSP, Fuses, validação de remetente de IPC, allowlist de esquemas em `openExternal`, bloqueio de navegação para fora de `app://launchkit`

### Performance Requirements

- **Inicialização:** janela visível sem esperar o backend remoto; no modo local, indicador de carregamento enquanto o backend sobe
- **Overhead do proxy:** sem requisito além de não degradar perceptivelmente as chamadas à API
- **Tamanho do instalador:** aceito na faixa típica do Electron (da ordem de 100 MB); o modo local acrescenta o tamanho do PGlite

### Scalability

Aplicativo de cliente; não há requisito de escala no servidor além do que já existe. O modo local é monousuário.

### Data Considerations

**Data Model:** sem mudança. No modo local, o schema é o mesmo do backend Node.

**Storage Requirements:**
- Modo A: apenas a URL do servidor e preferências da janela
- Modo B: banco e arquivos em `app.getPath('userData')`

**Data Migration:**
- Migrations do backend rodam na inicialização do modo local, precedidas de backup
- Rollback: restaurar o backup do diretório do banco

**Privacy & Compliance:**
- O app não envia dados para terceiros
- Remover o app não apaga o diretório de dados do modo local; a documentação explica como removê-lo

---

## Design & UX Requirements

### User Experience Principles

- O app deve parecer o produto web em uma janela própria, sem surpresas
- Diferenças entre web e desktop aparecem só onde há ganho (menu, arraste da janela, downloads)
- Erros de conexão ao servidor são claros e acionáveis

### User Flows

**Primary Flow (modo A):**
1. O usuário instala e abre o app
2. Vê "Conectar a um servidor" e informa a URL
3. O app valida a URL e mostra a tela de login (ou `/setup` no primeiro uso do servidor)
4. O usuário entra e usa o produto
5. Nas próximas aberturas, o app vai direto ao login ou ao workspace

**Alternative Flows:**
- URL inválida ou servidor fora do ar: mensagem de erro com opção de tentar de novo
- SSO: o navegador do sistema abre, o usuário conclui o login e o app recebe o retorno por deep link
- Modo B: escolhe "Usar neste computador", o app inicia o backend local e abre o `/setup`

### Visual Design

**Design System Components:**
- Reuso do UI kit existente (shadcn/Radix, Tailwind) para a tela de conexão ao servidor
- Nenhum componente novo além dessa tela e de ajustes no cabeçalho (área de arrasto)

**Key Screens:**
- Conectar a um servidor
- Seleção de modo no primeiro uso (modo B)
- Banner e diálogo de atualização (adaptação dos existentes)

### Interaction Patterns

- Menu nativo e atalhos padrão do sistema
- ⌘K ou Ctrl+K para a command palette, como na web
- Diálogo nativo para salvar arquivos baixados

### Accessibility (a11y)

**Requirements:**
- Mesmo nível de acessibilidade da interface web atual
- Navegação por teclado completa na tela de conexão e na seleção de modo
- Foco visível e rótulos em todos os campos novos
- Compatibilidade com leitores de tela do sistema

**Testing:**
- [ ] Teste de navegação só por teclado nas telas novas
- [ ] Verificação de contraste nas telas novas, nos temas claro e escuro
- [ ] Os testes de acessibilidade do frontend continuam passando

### Responsive Design

**Platform-Specific Considerations:**
- macOS: `titleBarStyle: hiddenInset` e área de arrasto no cabeçalho
- Windows e Linux: barra de título padrão do sistema
- Largura mínima de janela compatível com o layout responsivo atual

---

## Timeline & Milestones

**Target Launch Date:** Modo A proposto para 2026-12-18; modo B proposto para 2027-02-26 (a confirmar com a capacidade real e com os prazos da Feature 1)

### Phases

| Phase | Deliverables | Owner | Start Date | End Date |
|-------|-------------|-------|------------|----------|
| **Fase 0: Esqueleto** | `desktop/`, protocolo `app://`, proxy `/api`, hardening | Mantenedor | 2026-10-19 | 2026-10-22 |
| **Fase 1: Cliente remoto** | Tela de conexão, menu, downloads, ajustes de UI, E2E de fumaça | Mantenedor | 2026-10-23 | 2026-10-30 |
| **Fase 2: Empacotamento e atualização** | electron-builder, assinatura, notarização, `desktop-release`, electron-updater | Mantenedor | 2026-11-02 | 2026-11-10 |
| **Fase 3: OIDC no desktop** | Deep link, `redirect_target`, teste de contrato | Mantenedor | 2026-11-11 | 2026-11-13 |
| **Release do modo A** | Primeira release estável do desktop | Mantenedor | 2026-12-14 | 2026-12-18 |
| **Fase 4: Modo local** | Backend embutido, PGlite, token local, backup, exportar e importar | Mantenedor | 2027-02-01 | 2027-02-26 |
| **Fase 5: Extras** | Armazenamento seguro de token, bandeja, notificações | Mantenedor | Sob demanda | Sob demanda |

### Key Milestones

- **2026-10-22:** esqueleto funcionando contra um servidor local de dev
- **2026-10-30:** cliente remoto utilizável, com E2E de fumaça
- **2026-11-10:** instaladores assinados e atualização automática validada em pré-produção
- **2026-12-18:** release do modo A
- **2027-02-26:** release do modo B (depende da Feature 1 chegar à Fase 5)

A janela entre novembro e dezembro de 2026 absorve a espera por certificados de assinatura e o progresso da Feature 1. As datas são uma proposta, não um compromisso.

---

## Risks & Mitigation

| Risk | Impact | Probability | Mitigation Strategy | Owner |
|------|--------|------------|---------------------|-------|
| Custo e burocracia de assinatura (Apple Developer, certificado Windows) | Alto | Média | Isolar a Fase 2; usar builds sem assinatura para uso interno até lá | Mantenedor |
| Provedores OIDC que bloqueiam janelas embutidas | Alto | Média | Usar o navegador do sistema e deep link desde o início, nunca uma janela de login embutida | Mantenedor |
| WebAuthn indisponível ou instável no Electron | Médio | Alta | Desligado na v1, com detecção de recurso e esconde a opção na interface | Mantenedor |
| Modo B atrelado ao cronograma da Feature 1 | Alto | Média | O modo A é independente; a Fase 4 só começa com a Feature 1 na Fase 5 | Mantenedor |
| PGlite com volume grande de dados ou corrupção | Médio | Baixa | Backup antes de migrar; exportar e importar; documentar o limite de uso monousuário | Mantenedor |
| Divergência entre web e desktop no frontend | Médio | Média | Todas as diferenças passam por `isDesktop()` em pontos isolados; o build web não muda | Mantenedor |
| Vulnerabilidade por configuração incorreta do Electron | Alto | Baixa | Checklist de segurança verificado por teste desde o primeiro commit | Mantenedor |
| Tamanho do instalador | Baixo | Alta | Aceito, inerente ao Electron | Mantenedor |

### Contingency Plans

**If a assinatura e a notarização atrasarem:**
- Action plan: publicar builds não assinados como pré-lançamento, com instruções para liberar o app no sistema, e manter a atualização automática desligada nesses builds
- Decision maker: Mantenedor
- Trigger: certificado não disponível até 2026-11-10

**If a Feature 1 atrasar:**
- Action plan: lançar o modo A e adiar o modo B, sem impacto no restante
- Decision maker: Mantenedor
- Trigger: Feature 1 sem chegar à Fase 5 até 2027-01-29

---

## Dependencies & Assumptions

### Dependencies

**Internal:**
- [ ] Feature 1, Fase 5 em diante, para o modo B (backend Node, interfaces em memória, schema compatível com PGlite)
- [ ] Suíte de contrato da Feature 1, para cobrir a mudança do `redirect_target` do OIDC
- [ ] Mudança em `.github/ci/changes.py` para reconhecer `desktop/` (`run_desktop`)

**External:**
- [ ] Conta Apple Developer (Developer ID e notarização)
- [ ] Certificado de assinatura para Windows (Azure Trusted Signing ou EV)
- [ ] GitHub Releases como canal de distribuição e atualização

### Assumptions

- O frontend continua com `BrowserRouter` e `baseURL: '/api'`
- O servidor remoto de quem usa o app é acessível pela rede do usuário
- Uma pessoa em tempo integral executa as fases
- O repositório de releases do desktop é o mesmo do servidor, com tags separadas (a confirmar)

---

## Open Questions

- [ ] **electron-builder ou Electron Forge?**
  - **Context:** define empacotamento, assinatura e updater
  - **Options:** electron-builder (recomendado, updater maduro com GitHub Releases e assinatura integrada); Electron Forge
  - **Owner:** Mantenedor
  - **Deadline:** Antes da Fase 0 (2026-10-19)

- [ ] **O modo local faz parte do produto ou é só um exemplo do template?**
  - **Context:** muda o tamanho da Fase 4 e o nível de suporte
  - **Options:** parte do produto; exemplo documentado
  - **Owner:** Mantenedor
  - **Deadline:** Antes da Fase 4 (2027-02-01)

- [ ] **Releases do desktop no mesmo repositório do servidor ou em outro?**
  - **Context:** afeta o updater, as tags e o fluxo de `release.yml`; no mesmo repositório, `releases/latest` (usado pelo banner web via `UPDATE_CHECK_REPO`) pode devolver uma release `desktop-v*`
  - **Options:** mesmo repositório com tags `desktop-v*` (proposto); repositório separado
  - **Owner:** Mantenedor
  - **Deadline:** Antes da Fase 2 (2026-11-02)

---

## Stakeholder Sign-Off

| Stakeholder | Role | Review Status | Approved | Date |
|------------|------|---------------|----------|------|
| Gabriel Auzier | Product / Mantenedor | ⏳ Pending | ☐ | - |
| A definir | Engineering review | ⏳ Pending | ☐ | - |
| A definir | Security review (Electron e OIDC) | ⏳ Pending | ☐ | - |

---

## Appendix

### References

- [Plano técnico da Feature 2](../plans/feature-2-electron-desktop.md)
- `frontend/` (código de UI reaproveitado)

### Related Documents

- [PRD da Feature 1: backend Node.js com Fastify](prd-feature-1-node-fastify-backend.md)

### Glossary

- **Modo A:** o app desktop como cliente de um servidor launchkit remoto
- **Modo B:** o app desktop com backend e banco locais embutidos
- **Deep link:** URL de um protocolo próprio (`launchkit://`) que reabre o app
- **PGlite:** PostgreSQL compilado para WebAssembly, usado como banco local
- **utilityProcess:** processo auxiliar do Electron, usado aqui para rodar o backend local
- **Fuses:** chaves de compilação do Electron que desligam recursos perigosos

### Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-15 | Gabriel Auzier (com Claude) | Rascunho inicial |
