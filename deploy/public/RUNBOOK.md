# Guia de operação: launchkit em produção

Como verificar, parar e retomar o serviço, e o que fazer depois de reiniciar o Mac.
Visão geral e decisões: [README.md](README.md). Backup e restauração: [backup/restore.md](backup/restore.md).
Os comandos de parar e retomar abaixo foram validados num ciclo real (túnel e aplicação), com os dados preservados.

```
Internet → Cloudflare → túnel (cloudflared, LaunchAgent) → 127.0.0.1:3100 → containers "launchkit-prod"
```

| Peça | O que é | Como é gerenciada |
|---|---|---|
| Aplicação | 6 containers do projeto Compose **`launchkit-prod`** (frontend, backend, celery-worker, celery-beat, redis, db) | `docker compose -p launchkit-prod ...` |
| Exposição | Túnel Cloudflare `launchkit` (4 conexões com a Cloudflare) | LaunchAgent `com.cloudflare.cloudflared` |
| Backup | Job diário 03:15, envia ao R2 | LaunchAgent `com.launchkit.backup` |

> ## ⚠️ Leia antes de mexer
> - **Use sempre `./deploy/public/launchkit-compose`** (em vez de `docker compose` direto). Ele já inclui `-p launchkit-prod`, o `.env` de produção e a versão fixa das imagens. Se o ambiente de **desenvolvimento** rodar na mesma máquina, ele usa o projeto `launchkit` (containers `launchkit-*-1`, portas 3000/8000), e os dois arquivos compose declaram `name: launchkit`. Rodar o compose de produção sem `-p launchkit-prod` (o wrapper cuida disso) **substitui os containers de dev e reaproveita o banco de dev**.
> - **Nunca use `down -v`, `docker volume rm` nem `docker system prune --volumes`** em produção: apagam o banco e os arquivos (`launchkit-prod_pgdata`, `launchkit-prod_files`). O `down` sem `-v` remove só os containers (os dados ficam), mas prefira `stop`.
> - Faça um **backup antes** de qualquer operação arriscada: `./deploy/public/backup/backup.sh`.

## 0. Convenções
Todos os comandos assumem a raiz do repositório e usam o atalho **`./deploy/public/launchkit-compose`**, que é o `docker compose` da produção com `-p launchkit-prod`, o `.env` de produção e a versão fixa das imagens já embutidos (funciona de qualquer pasta). Se o seu `.env` estiver em outro lugar, defina `LAUNCHKIT_ENV_FILE=caminho/do/.env`.
```bash
cd /caminho/para/o/repositorio/launchkit
```

## 1. Ver o estado
```bash
./deploy/public/launchkit-compose ps
```
```bash
curl -s http://127.0.0.1:3100/api/health        # local: deve responder {"status":"healthy"}
```
```bash
curl -s https://app.example.com/api/health   # público, pela Cloudflare
```
```bash
launchctl list | grep -E "cloudflared|launchkit"   # PID na 1ª coluna = rodando; 2ª coluna = último código de saída (0 = ok)
```

## 2. Parar e retomar

### 2.1 Tirar do ar sem parar a aplicação (emergência, ou "desligar o acesso de fora")
Só derruba o túnel. A aplicação continua rodando e acessível em `http://127.0.0.1:3100`; os jobs do Celery continuam.
```bash
launchctl bootout gui/$(id -u)/com.cloudflare.cloudflared
```
Resultado público: **HTTP 530** (Cloudflare sem túnel ativo).

**Retomar:**
```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.cloudflare.cloudflared.plist
```
Em ~10 segundos o `/api/health` público volta a responder 200.

### 2.2 Parar a aplicação (manutenção; preserva todos os dados)
```bash
./deploy/public/launchkit-compose stop
```
Para os 6 containers sem removê-los; **volumes e dados ficam intactos**. Se o túnel estiver ativo, o público passa a responder **HTTP 502** (túnel sem origem). Para uma manutenção limpa, derrube antes o túnel (2.1) e o público verá 530 em vez de 502.

**Retomar:**
```bash
./deploy/public/launchkit-compose start
```
O banco e o Redis ficam saudáveis em ~10 s; em seguida sobem backend, workers e frontend. Se os containers tiverem sido removidos (por exemplo, após um `down`), use `up -d` no lugar de `start`.

### 2.3 Parada completa e retomada, na ordem certa
```bash
# parar
launchctl bootout gui/$(id -u)/com.cloudflare.cloudflared
./deploy/public/launchkit-compose stop
```
```bash
# retomar
./deploy/public/launchkit-compose start
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.cloudflare.cloudflared.plist
```
Confira com a seção 1. `stop` e `start` não removem containers nem volumes, então os dados ficam intactos.

### 2.4 Reiniciar só um serviço (ex.: depois de mudar o `.env`)
```bash
./deploy/public/launchkit-compose up -d backend celery-worker celery-beat
```
Mudanças no `deploy/public/.env` só valem depois de recriar os containers afetados (`up -d`); `restart` não relê o `.env`.

### 2.5 Pausar o backup noturno
```bash
launchctl bootout gui/$(id -u)/com.launchkit.backup
```
Retomar:
```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.launchkit.backup.plist
```
Se a aplicação estiver **parada** às 03:15, o backup falha (o script exige o banco saudável), o que aparece em `~/Library/Logs/launchkit-backup.log`. Faça um backup manual antes de parar por muito tempo.

## 3. Depois de reiniciar o Mac ou de uma queda de energia
Com `autorestart` ligado o Mac religa sozinho. **Se o FileVault estiver ativo** (o login automático não funciona com ele), o Mac para na tela de senha e nada sobe até alguém digitar a senha.
1. **Digite a senha de login** na tela de boot (presencial; não há como fazer remotamente).
2. O **túnel** (LaunchAgent) sobe com a sessão. O **Docker Desktop só sobe sozinho se "Start Docker Desktop when you sign in" estiver ligado** (Settings → General). Se não estiver, abra o Docker Desktop manualmente.
3. Os containers têm `restart: unless-stopped` e voltam quando o Docker inicia. Se algum não voltar:
   ```bash
   ./deploy/public/launchkit-compose up -d
   ```
4. Confirme com a seção 1. Enquanto isso não for feito, o público responde 530 ou 502.

Atualizações do macOS que reiniciam o Mac derrubam o serviço até o desbloqueio. Se você desligou a instalação automática (passo opcional do `hardening/harden-mac.sh`), instale manualmente numa janela de manutenção: faça backup, atualize, digite a senha no reinício e confira a seção 1.

## 4. Atualizar a versão do launchkit
A versão que roda é a definida por `IMAGE_PREFIX` e `APP_VERSION` no `.env`. **Fixe uma versão** (nada de `latest`) para que um `pull` nunca troque o app sem você ter lido as notas e feito backup. Para construir e publicar suas próprias imagens, veja [RELEASING.md](RELEASING.md).

1. Backup (grava em `BACKUP_DIR` e envia ao R2, se configurado), anotando a versão atual:
   ```bash
   grep -E '^(IMAGE_PREFIX|APP_VERSION)=' deploy/public/.env
   ./deploy/public/backup/backup.sh
   ```
2. Edite `APP_VERSION` (e `IMAGE_PREFIX`, se mudar de origem) no `.env` e aplique:
   ```bash
   ./deploy/public/launchkit-compose pull
   ./deploy/public/launchkit-compose up -d
   ```
3. Confira com a seção 1 e acompanhe os logs do backend (as migrations rodam sozinhas no start, `alembic upgrade head`).

**Voltar atrás:** as migrations **não são revertidas**. Se a versão nova não tiver aplicado nenhuma migration (veja os logs), basta recolocar a tag antiga no `.env` e repetir o `pull` e o `up -d`. Se tiver aplicado, restaure o backup feito no passo 1 (ver [backup/restore.md](backup/restore.md)) **junto** com a tag antiga.

## 5. Logs e diagnóstico
```bash
./deploy/public/launchkit-compose logs --tail 100 backend
```
```bash
./deploy/public/launchkit-compose logs -f      # todos, ao vivo
```
```bash
tail -n 30 ~/Library/Logs/com.cloudflare.cloudflared.err.log    # túnel
```
```bash
tail -n 30 ~/Library/Logs/launchkit-backup.log                     # backup
```

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| Público **530** | Túnel parado ou sem conexão | `launchctl list | grep cloudflared` (sem PID = parado): seção 2.1 (retomar) e log do túnel |
| Público **502** | Túnel ok, aplicação parada ou reiniciando | Seção 2.2 (retomar); `ps` e logs do backend |
| Público **404** com a página de outra plataforma (ex.: "deployment not found") | DNS antigo em cache no seu resolver, ainda apontando para o servidor anterior do domínio | Aguardar (até 24–48 h após trocar nameservers) ou usar DNS `1.1.1.1`; ver "Armadilhas" no README |
| **403** em `/api/auth/register` | Cadastro de novos usuários desativado (intencional) | Reabrir: ver "Cadastro de novos usuários" no README |
| Login bloqueado por excesso de tentativas | Rate limit (5 por minuto por IP) | Aguardar 1 minuto |
| Backup noturno com erro | App parada, credenciais do R2 ou volume cheio | Log do backup; `deploy/public/backup/setup-r2.sh` |
| Containers não sobem após reinício | Docker Desktop não iniciou | Seção 3 |

## 6. Arquivos importantes (nada disso vai para o git)
| Caminho | Conteúdo |
|---|---|
| `deploy/public/.env` | Segredos da aplicação (`SECRET_KEY` etc.) |
| `~/.cloudflared/` | `cert.pem`, credenciais do túnel (`<id>.json`) e `config.yml` |
| `~/.config/launchkit-backup/` | `age-key.txt` (**chave privada dos backups**), `age-recipient.txt`, `r2.env`, cópias dos scripts, backups diários |
| `~/Library/LaunchAgents/` | `com.cloudflare.cloudflared.plist`, `com.launchkit.backup.plist` |
| `~/Library/Logs/` | Logs do túnel e do backup |

### Segredos que NÃO estão no backup (guarde uma cópia fora do Mac)
O backup cobre só o banco e os arquivos. **Não inclui `deploy/public/.env` nem a chave `age-key.txt`.**
- **`SECRET_KEY` (em `deploy/public/.env`):** assina sessões e tokens de login. Se for perdida, o banco restaurado continua íntegro, mas todos os logins ativos caem. Restaurar o banco num ambiente novo **com o mesmo `SECRET_KEY`** evita isso.
- **`age-key.txt`:** sem ela, nenhum backup (local ou no R2) abre.
- **`~/.cloudflared/*.json`:** credenciais do túnel; se forem perdidas, crie um novo túnel (`cloudflared tunnel create`) e rode `cloudflared tunnel route dns` de novo.

Guarde `SECRET_KEY` e a chave privada age no gerenciador de senhas.
