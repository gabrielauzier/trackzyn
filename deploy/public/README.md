# launchkit em produção, em casa: self-host com Cloudflare Tunnel

Guia passo a passo para rodar o launchkit numa máquina sua (um Mac mini, um notebook velho, uma VM) e acessá-lo pela internet com HTTPS,
**sem abrir portas no roteador**, mesmo atrás de CGNAT. Pensado para uso pessoal ou poucos usuários.

- Os exemplos usam o domínio **`example.com`** e o endereço **`app.example.com`**: troque pelos seus.
- Os passos de sistema são para **macOS** (launchd, `pmset`, firewall do macOS). Em Linux, a ideia é a mesma: troque o launchd por systemd
  (`cloudflared service install` já faz isso) e adapte o passo de endurecimento.
- Operação do dia a dia (parar, retomar, atualizar, diagnosticar): [RUNBOOK.md](RUNBOOK.md). Restaurar backups: [backup/restore.md](backup/restore.md). Publicar as suas próprias imagens: [RELEASING.md](RELEASING.md).

```
Navegador ──HTTPS──> Cloudflare (DNS + TLS) ══ túnel (conexão de saída) ══> cloudflared (sua máquina)
                                                                                │
                                                                      http://127.0.0.1:3100
                                                                                ▼
                                                      docker compose (docker-compose.prod.yml, projeto "launchkit-prod")
                                           frontend (nginx) ──/api──> backend (FastAPI)
                                                       celery-worker · celery-beat · redis · postgres
```

## Por que esta arquitetura
- **O projeto já vem pronto para self-host:** imagens Docker publicadas no GHCR (com build `arm64`) e `docker-compose.prod.yml` com seis serviços. O frontend chama a API por caminho relativo (`/api`) e o nginx faz o proxy; com um domínio único não há CORS nem problema de cookie.
- **Não é serverless:** o backend usa Celery (worker e beat), Redis e disco local para os arquivos enviados. Funções serverless não oferecem processos persistentes nem disco, então isso exigiria reescrever partes do código.
- **PaaS pago** funciona, mas custa dezenas de dólares por mês para um app que cabe em 1 a 2 GB de RAM; e os planos grátis costumam dormir ou não ter workers.
- **Túnel em vez de abrir portas:** a maior parte dos provedores residenciais usa **CGNAT** (o IPv4 que a internet vê não é o do seu roteador), o que impede o redirecionamento de portas. O Cloudflare Tunnel é uma conexão **de saída**, então funciona nesse cenário, esconde o seu IP e dá o certificado HTTPS.

## Antes de começar
- Uma máquina que fique **ligada o tempo todo**, com 2 GB de RAM livres e **espaço em disco de sobra** (veja o passo 7).
- Docker (Docker Desktop no macOS) com Compose v2.
- Um **domínio seu** e uma conta **Cloudflare gratuita** (o túnel só funciona para domínios gerenciados por ela).
- Opcional, mas recomendado: um bucket no **Cloudflare R2** para a cópia externa dos backups.
- O repositório clonado. Todos os comandos abaixo partem da raiz dele.

---

## Passo 1: mover o DNS do domínio para a Cloudflare
> Só faça isto se o domínio **já tem site e/ou e-mail**: o objetivo é mudar de provedor de DNS sem derrubar nada.

1. **Liste os registros atuais** (painel do registrador ou `dig`) e guarde. Os que normalmente existem:

   | Tipo | Nome | Conteúdo | Como ficará na Cloudflare |
   |---|---|---|---|
   | A | `@` | IP/host do seu site atual | **Somente DNS** (nuvem cinza) |
   | CNAME | `www` | `example.com` | **Somente DNS** |
   | MX | `@` | servidores de e-mail do seu provedor (com prioridades) | igual |
   | TXT | `@` | SPF do provedor de e-mail | igual |
   | TXT | `_dmarc` | política DMARC | igual |
   | CNAME | `<seletor>._domainkey` | DKIM do provedor de e-mail | **Somente DNS** |
   | CNAME | `autodiscover`, `autoconfig` | provedor de e-mail | **Somente DNS** |
   | CAA | `@` | autoridades certificadoras permitidas (se existir) | igual |

   O registro `launchkit` **não** é migrado: o túnel o cria no passo 4. Se já existir um `launchkit` apontando para outro lugar, apague antes.

2. **Confirme que o DNSSEC está desativado** (um DS ativo derruba o domínio ao trocar de provedor de DNS). Deve retornar vazio:
   ```bash
   dig +short DS example.com
   ```
   Se retornar algo, desative o DNSSEC no registrador e espere o TTL antes de trocar os nameservers.

3. Na Cloudflare, **adicione o site** (plano Free). Ela importa os registros que encontra; **compare com a sua lista** e crie o que faltar.
4. Deixe **todos os registros do site e do e-mail em "Somente DNS"** (nuvem cinza). Com o proxy ligado, o DKIM deixa de funcionar, a configuração automática de e-mail quebra e o certificado do site pode falhar.
5. **Valide a zona antes de trocar** consultando direto os nameservers que a Cloudflare atribuiu (`<ns1>` e `<ns2>`) e comparando com a zona atual:
   ```bash
   dig @<ns1-da-cloudflare> +short A example.com
   dig @<ns1-da-cloudflare> +short MX example.com
   dig @<ns1-da-cloudflare> +short TXT example.com
   ```
6. No registrador, **troque os nameservers pelos dois da Cloudflare e apague os antigos**. Nunca deixe nameservers de dois provedores ao mesmo tempo.
7. Depois da propagação, valide:
   ```bash
   dig +short NS example.com           # só os dois da Cloudflare
   dig +short A example.com            # o IP do seu site, como antes
   dig +short MX example.com           # os mesmos MX
   ```
   Abra o site e **envie um e-mail de teste** para uma conta externa. Em "Mostrar original" confira SPF, DKIM e DMARC como `PASS`.

**Reversão:** devolva os nameservers anteriores no registrador.

## Passo 2: subir a aplicação (isolada do ambiente de desenvolvimento)
1. Crie o arquivo de ambiente a partir do modelo e proteja-o:
   ```bash
   cp deploy/public/.env.example deploy/public/.env
   chmod 600 deploy/public/.env
   ```
   Preencha `SECRET_KEY` (`openssl rand -hex 32`) e `FRONTEND_URL=https://app.example.com`. O `FRONTEND_URL` precisa ser exatamente a URL pública: controla CORS, callbacks OAuth e passkeys. Fixe também `APP_VERSION` numa versão (veja "Versões e releases").

2. **Use sempre o atalho `./deploy/public/launchkit-compose`**, que embute `-p launchkit-prod`. O `-p` importa porque o `docker-compose.yml` (desenvolvimento) e o `docker-compose.prod.yml` declaram `name: launchkit`: se o ambiente de dev rodar na mesma máquina, subir a produção sem ele **substitui os containers de dev e reaproveita o banco e os volumes de dev**. Confira o isolamento:
   ```bash
   ./deploy/public/launchkit-compose config | grep -E "^name:|published:"
   ```
   Deve mostrar `name: launchkit-prod` e as portas `3100` e `8100` (presas ao `127.0.0.1` pelo `.env`).

3. Confira se as imagens têm build para a sua arquitetura (importante em Apple Silicon/ARM):
   ```bash
   docker buildx imagetools inspect ghcr.io/<seu-usuario>/launchkit-backend:latest | grep Platform
   ```

4. Baixe e suba:
   ```bash
   ./deploy/public/launchkit-compose pull
   ./deploy/public/launchkit-compose up -d
   curl -s http://127.0.0.1:3100/api/health        # {"status":"healthy"}
   ```
   As migrations rodam sozinhas no start do backend. O Postgres do compose **não publica porta**: só é acessível dentro da rede do projeto.

## Passo 3: criar a conta de administrador e fechar o cadastro (**antes** de expor)
- A tela de configuração inicial **só existe enquanto o banco está vazio**, e **a primeira conta criada vira administradora**. Expor uma instância vazia entregaria a administração a quem chegasse primeiro.
- Além disso, o **cadastro de novos usuários vem habilitado por padrão**.

1. Abra `http://127.0.0.1:3100` no navegador **da própria máquina** e crie a sua conta.
2. Desative o cadastro de novos usuários. O valor fica na tabela `app_settings`; o comando deve responder `UPDATE 1`:
   ```bash
   docker exec launchkit-prod-db-1 psql -U postgres launchkit -c "UPDATE app_settings SET value = 'false' WHERE key = 'registration_enabled';"
   ```
3. Confirme que o registro está bloqueado (esperado: `403`):
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" -X POST -H 'Content-Type: application/json' \
     -d '{"email":"teste@example.invalid","password":"Teste-123456"}' http://127.0.0.1:3100/api/auth/register
   ```
   Para reabrir o cadastro, rode o mesmo `UPDATE` com `'true'`.

## Passo 4: o túnel
```bash
brew install cloudflared                 # Linux: pacote oficial da Cloudflare
cloudflared tunnel login                 # abre o navegador; autorize o seu domínio
cloudflared tunnel create launchkit         # anote o <TUNNEL_ID>; as credenciais vão para ~/.cloudflared/<TUNNEL_ID>.json
cloudflared tunnel route dns launchkit app.example.com
```
Crie `~/.cloudflared/config.yml` (aponte para a porta de **produção**, nunca para a do ambiente de dev):
```yaml
tunnel: <TUNNEL_ID>
credentials-file: /Users/<usuario>/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: app.example.com
    service: http://localhost:3100
  - service: http_status:404
```
```bash
cloudflared tunnel ingress validate
cloudflared tunnel run launchkit            # teste em primeiro plano; Ctrl+C para sair
curl -s https://app.example.com/api/health
```

**Rodar como serviço (macOS):** `cloudflared service install` cria um **LaunchAgent do usuário** (sobe no login, não precisa de `sudo`).
O arquivo gerado vem **incompleto**: o `ProgramArguments` contém só o binário e o serviço sai com erro. Acrescente `tunnel run` e recarregue:
```bash
cloudflared service install
/usr/libexec/PlistBuddy -c "Add :ProgramArguments: string tunnel" -c "Add :ProgramArguments: string run" ~/Library/LaunchAgents/com.cloudflare.cloudflared.plist
launchctl bootout gui/$(id -u)/com.cloudflare.cloudflared 2>/dev/null
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.cloudflare.cloudflared.plist
launchctl list | grep cloudflared        # PID na 1ª coluna e 0 na 2ª = ok
```
Logs: `~/Library/Logs/com.cloudflare.cloudflared.err.log`. Para subir no boot **sem login**, instale como root (LaunchDaemon, configuração em `/etc/cloudflared/`).

**Opcional, recomendado:** coloque o **Cloudflare Access** (Zero Trust, plano gratuito) na frente do hostname para exigir um login extra antes de chegar ao app.

## Passo 5: validar o rate limit (`TRUSTED_PROXY_HOPS`)
O backend limita tentativas de login por IP, lendo o IP do cabeçalho `X-Forwarded-For` e confiando em tantos proxies quantos você declarar. Com **Cloudflare → cloudflared → nginx** são **2**.
Valor errado: maior que o real permite forjar o IP; menor faz todos os clientes dividirem o mesmo limite. Prove que está certo:
```bash
curl -s -o /dev/null -X POST -H 'Content-Type: application/x-www-form-urlencoded' \
  --data 'username=x@example.invalid&password=x' https://app.example.com/api/auth/login
docker exec launchkit-prod-redis-1 redis-cli --scan --pattern 'rate_limit:*'
```
A chave deve terminar com o **seu IP público real** (o de onde você fez o `curl`), e não com um IP interno. Se aparecer um IP interno, ajuste `TRUSTED_PROXY_HOPS` no `.env` e recrie o backend (`up -d backend`).

## Passo 6: backup (obrigatório)
O que é feito, por [`backup/backup.sh`](backup/backup.sh): `pg_dump` do banco e `tar` do volume de arquivos, **cada um criptografado com [age](https://github.com/FiloSottile/age)**,
mais um `.sha256` por backup (verificado ao final), retenção automática e, se existir o gancho, envio ao R2 com verificação (`rclone check`). O servidor guarda só a chave **pública**.

1. Instale e gere as chaves:
   ```bash
   brew install age rclone
   mkdir -p ~/.config/launchkit-backup && chmod 700 ~/.config/launchkit-backup
   age-keygen -o ~/.config/launchkit-backup/age-key.txt && chmod 600 ~/.config/launchkit-backup/age-key.txt
   grep '^# public key:' ~/.config/launchkit-backup/age-key.txt | sed 's/^# public key: //' > ~/.config/launchkit-backup/age-recipient.txt
   ```
   **Copie a chave privada (`age-key.txt`) para o gerenciador de senhas.** Sem ela nenhum backup abre. Guarde também o `SECRET_KEY` (veja "Armadilhas").
2. Primeiro backup e **teste de restauração** (restore.md, seção 2). Um backup que nunca foi restaurado não é um backup:
   ```bash
   ./deploy/public/backup/backup.sh
   ```
   Por padrão grava em `~/launchkit-backup-files` (mude com `BACKUP_DIR`); mantém 30 dias (`KEEP_DAYS`).
3. **Cópia externa no Cloudflare R2** (10 GB grátis): crie um bucket, depois um API token **Object Read & Write restrito a esse bucket** (guarde Access Key ID e Secret) e anote o Account ID. Então:
   ```bash
   ./deploy/public/backup/setup-r2.sh        # pergunta os valores (o secret não aparece), grava ~/.config/launchkit-backup/r2.env (modo 600) e testa enviando/apagando um arquivo
   cp deploy/public/backup/offsite.sh ~/.config/launchkit-backup/offsite.sh && chmod 755 ~/.config/launchkit-backup/offsite.sh
   ./deploy/public/backup/backup.sh          # agora deve enviar e verificar no R2
   ```
   O token precisa poder apagar (retenção), então se a máquina for comprometida o atacante pode apagar os backups remotos; os arquivos são ilegíveis sem a chave age. Considere versionamento no bucket.
4. **Agende** (macOS, LaunchAgent diário). O launchd **não consegue ler scripts nem renomear arquivos em volumes externos** (proteção de privacidade do macOS): use cópias no disco interno.
   ```bash
   cp deploy/public/backup/backup.sh ~/.config/launchkit-backup/backup.sh && chmod 755 ~/.config/launchkit-backup/backup.sh
   cp deploy/public/backup/com.launchkit.backup.plist.example ~/Library/LaunchAgents/com.launchkit.backup.plist
   # edite o arquivo e troque SEU_USUARIO pelo seu usuário
   launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.launchkit.backup.plist
   launchctl kickstart gui/$(id -u)/com.launchkit.backup     # roda agora; veja ~/Library/Logs/launchkit-backup.log
   ```
   Se você alterar os scripts do repositório, **copie de novo** para `~/.config/launchkit-backup/`.

## Passo 7: endurecer a máquina e cuidar do disco
**Verifique o disco primeiro.** No Docker Desktop, o banco e os volumes vivem num único arquivo (`~/Library/Containers/com.docker.docker/Data/vms/0/data/Docker.raw`) **no disco interno**. Se o disco encher, o Postgres pode parar ou corromper.
```bash
df -h /System/Volumes/Data      # mantenha folga confortável
docker system df                # o que o Docker ocupa e o que é recuperável
```

**Script de endurecimento (macOS)**: altera configurações de sistema e segurança, por isso pede `sudo` e confirma cada item. Veja primeiro o que ele faria:
```bash
./deploy/public/hardening/harden-mac.sh --dry-run
./deploy/public/hardening/harden-mac.sh
```
Ele: (1) impede o sleep na tomada e religa sozinho após queda de energia (`pmset`); (2) liga o firewall; (3) bloqueia conexões de **entrada** do Docker Desktop (portas publicadas em `0.0.0.0` do ambiente de dev deixam de abrir pela rede local; o túnel usa o loopback e não é afetado: **confira o `/api/health` público depois**); (4) opcional, desliga a instalação automática de atualizações do macOS.

**Manual:**
- Docker Desktop → Settings → General → **"Start Docker Desktop when you sign in"**. Sem isso os containers não voltam após reiniciar.
- **FileVault e queda de energia:** com o FileVault ativo, depois de qualquer reinício o Mac para na tela de senha e nada sobe até alguém digitar (o login automático não funciona com FileVault). Opções: aceitar e usar um **nobreak**; ou desligar o FileVault (o disco com o banco fica sem criptografia em repouso). O backup cobre perda de dados, não indisponibilidade.
- Opcional: desligar o Receptor AirPlay (escuta nas portas 5000 e 7000).

---

## Trocar de stack

O launchkit tem duas stacks de backend com a mesma API e o mesmo banco: `python` (FastAPI + Celery, o padrão) e `node` (Fastify + BullMQ). A escolha é a variável `BACKEND_STACK` do `deploy/public/.env`; a imagem de cada uma é publicada com o mesmo `IMAGE_PREFIX` (`launchkit-backend` e `launchkit-backend-node`). Os volumes `pgdata` e `files` são os mesmos nas duas, então a troca é só de configuração: **nunca** rode as duas ao mesmo tempo sobre o mesmo banco.

1. **Backup.** Rode `deploy/public/backup/backup.sh` e confirme que os arquivos `.age` e `.sha256` do dia existem (restauração em [backup/restore.md](backup/restore.md)).
2. **Trocar o `BACKEND_STACK`.** Em `deploy/public/.env` ponha `BACKEND_STACK=node` (ou `python`), confira que a imagem existe para o seu `APP_VERSION` e aplique: `./deploy/public/launchkit-compose up -d --remove-orphans`. Sem `-v`: os volumes ficam.
3. **Verificar `GET /api/health`.** `curl -s http://127.0.0.1:3100/api/health` deve responder `{"status":"healthy"}`; entre com a mesma conta e confira que os seus workspaces e arquivos continuam lá.
4. **Voltar atrás.** Se algo falhar, ponha o valor anterior de `BACKEND_STACK`, rode o mesmo `up -d --remove-orphans` e verifique `GET /api/health` de novo. Os dados criados na outra stack continuam disponíveis; só restaure o backup se o banco foi danificado.

## Versões e releases
- Por padrão o Compose de produção usa `ghcr.io/your-org/launchkit-*:latest`, e o projeto só publica imagens quando **publica uma release**. Em produção **fixe a versão** em `APP_VERSION` (no `.env`), para que um `pull` nunca troque o app sem você ter lido as notas e feito backup. O `docker-compose.prod.yml` lê `IMAGE_PREFIX` e `APP_VERSION` do `.env`, que o atalho `launchkit-compose` sempre carrega.
- O repositório publica as próprias imagens em `ghcr.io/<seu-usuario>/launchkit-*` ao criar uma release. O processo completo, com um script de apoio e as armadilhas, está em [RELEASING.md](RELEASING.md).
- Organização de branches sugerida: `main` para desenvolvimento e `prod` com o que roda no seu servidor; as releases saem de `prod`.

## Armadilhas e lições
1. **Nameservers de dois provedores ao mesmo tempo** fazem metade das consultas cair numa zona sem os seus registros: o site ou o e-mail falham de forma intermitente. Use um provedor só.
2. **O proxy da Cloudflare reaparece** em registros importados ou editados. Revise as nuvens cinzas depois de qualquer edição na zona (DKIM, autodiscover e autoconfig são os mais afetados).
3. **Cache de DNS antigo no resolver do seu provedor** (até 24–48 h depois de trocar nameservers): na rede de casa o endereço novo pode mostrar a página do servidor anterior, enquanto no 4G/5G funciona. Teste com `curl --resolve app.example.com:443:<IP da Cloudflare> https://app.example.com/api/health` ou use DNS `1.1.1.1`.
4. **Instância vazia exposta = administração para o primeiro visitante.** Crie a conta e feche o cadastro antes de subir o túnel.
5. **`-p launchkit-prod` sempre.** Sem ele a produção colide com o ambiente de desenvolvimento (mesmo projeto, mesmos volumes).
6. **O backup não inclui o `.env`.** O `SECRET_KEY` assina sessões e tokens; se for perdido, o banco restaurado volta íntegro, mas todos os logins caem. Guarde `SECRET_KEY` e a chave privada age no gerenciador de senhas. Se você criptografar dados no banco com uma chave derivada dele, perdê-lo torna esses dados ilegíveis.
7. **O LaunchAgent do `cloudflared` gerado vem sem `tunnel run`.** Corrija como no passo 4.
8. **launchd × volumes externos:** scripts e destino de backup agendados precisam ficar no disco interno (ou conceda "Acesso Total ao Disco" ao `/bin/bash`).
9. **Reinício com FileVault** deixa o serviço fora do ar até digitar a senha; atualizações automáticas do macOS causam reinícios. Planeje (nobreak, janela de manutenção).
10. **Disco cheio** é o risco silencioso do Docker Desktop. Monitore o espaço.
11. **Nunca** use `docker compose down -v`, `docker volume rm` ou `docker system prune --volumes` na produção: apagam o banco e os arquivos.

## Checklist final
- [ ] DNS na Cloudflare, site e e-mail validados, DNSSEC desligado, registros em "Somente DNS".
- [ ] `deploy/public/.env` com segredos próprios, modo 600, **fora do git**.
- [ ] Aplicação rodando no projeto `launchkit-prod`, portas presas ao `127.0.0.1`.
- [ ] Conta de administrador criada e cadastro de novos usuários **desativado** (403 no registro).
- [ ] Túnel rodando como serviço e `https://app.example.com/api/health` respondendo.
- [ ] `TRUSTED_PROXY_HOPS` validado pela chave do rate limit.
- [ ] Backup diário agendado, **restauração testada**, cópia externa no R2 verificada.
- [ ] Chave privada age e `SECRET_KEY` no gerenciador de senhas.
- [ ] Versão das imagens **fixada** em `APP_VERSION` (não `latest`).
- [ ] Máquina endurecida (energia, firewall), Docker iniciando no login, disco com folga.
- [ ] Decisão consciente sobre FileVault/nobreak.
