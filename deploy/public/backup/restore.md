# Restaurar um backup do launchkit

Os backups são criptografados com [age](https://github.com/FiloSottile/age). O servidor guarda só a chave **pública**;
para restaurar é preciso a chave **privada** (`age-key.txt`), que deve estar guardada **fora** do servidor (gerenciador de senhas).
Sem ela os backups **não podem ser abertos**.

Nomes dos arquivos: `launchkit-db-<data>.dump.age`, `launchkit-files-<data>.tar.gz.age` e `launchkit-<data>.sha256`.
Onde estão: na pasta definida por `BACKUP_DIR` (padrão `~/launchkit-backup-files`) e, se configurado, no seu bucket R2.

> Convenções: rode os comandos a partir da raiz do repositório. Troque `<data>` pelo carimbo do backup
> (ex.: `20260101-031500`). Os comandos assumem o projeto Compose `launchkit-prod` e o arquivo de ambiente
> `deploy/public/.env`, ambos embutidos no atalho `./deploy/public/launchkit-compose` (veja o README).

## 1. Verificar a integridade
```bash
cd <pasta-dos-backups> && shasum -a 256 -c launchkit-<data>.sha256
```

## 2. Testar a restauração sem tocar na produção (faça de tempos em tempos)
```bash
age -d -i ~/.config/launchkit-backup/age-key.txt -o /tmp/restore.dump launchkit-db-<data>.dump.age
docker run -d --name launchkit-restore-test -e POSTGRES_PASSWORD=teste -e POSTGRES_DB=launchkit docker.io/library/postgres:16-alpine
docker exec launchkit-restore-test psql -U postgres launchkit -c "create extension if not exists vector;"
docker cp /tmp/restore.dump launchkit-restore-test:/tmp/restore.dump
docker exec launchkit-restore-test pg_restore -U postgres -d launchkit --no-owner /tmp/restore.dump
docker exec launchkit-restore-test psql -U postgres launchkit -c "select count(*) from users;"
docker rm -f launchkit-restore-test && rm /tmp/restore.dump
```
O dump em claro contém os dados da aplicação: apague `/tmp/restore.dump` ao terminar. Compare o resultado
(número de tabelas, usuários, versão da migration) com a produção para confirmar que o backup é utilizável.

## 3. Restaurar na produção (DESTRUTIVO: substitui o banco atual)
Pare o backend e os workers para não gravarem durante a restauração, e faça um backup novo antes.
```bash
C="./deploy/public/launchkit-compose"
./deploy/public/backup/backup.sh                   # backup de segurança do estado atual
$C stop backend celery-worker celery-beat frontend
age -d -i ~/.config/launchkit-backup/age-key.txt -o /tmp/restore.dump launchkit-db-<data>.dump.age
docker cp /tmp/restore.dump launchkit-prod-db-1:/tmp/restore.dump
docker exec launchkit-prod-db-1 psql -U postgres -c "drop database launchkit;" -c "create database launchkit;"
docker exec launchkit-prod-db-1 psql -U postgres launchkit -c "create extension if not exists vector;"
docker exec launchkit-prod-db-1 pg_restore -U postgres -d launchkit --no-owner /tmp/restore.dump
$C up -d
rm /tmp/restore.dump
```

## 4. Restaurar os arquivos enviados
```bash
age -d -i ~/.config/launchkit-backup/age-key.txt launchkit-files-<data>.tar.gz.age \
  | docker run --rm -i --entrypoint tar -v launchkit-prod_files:/data docker.io/library/redis:8-alpine xzf - -C /data
```

## 5. Restaurar em outra máquina
Restaure usando o **mesmo `SECRET_KEY`** do servidor original; com outro valor o banco volta íntegro, mas todos os logins
caem (e qualquer dado que você criptografe com uma chave derivada dele fica ilegível). O backup **não inclui** o arquivo `.env`:
guarde `SECRET_KEY` e a chave privada age no gerenciador de senhas.
