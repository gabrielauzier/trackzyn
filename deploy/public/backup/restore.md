# Restaurar um backup do trackzyn

Os backups são criptografados com [age](https://github.com/FiloSottile/age). O servidor guarda só a chave **pública**;
para restaurar é preciso a chave **privada** (`age-key.txt`), que deve estar guardada **fora** do servidor (gerenciador de senhas).
Sem ela os backups **não podem ser abertos**.

Nomes dos arquivos: `trackzyn-db-<data>.dump.age`, `trackzyn-files-<data>.tar.gz.age` e `trackzyn-<data>.sha256`.
Onde estão: na pasta definida por `BACKUP_DIR` (padrão `~/trackzyn-backup-files`) e, se configurado, no seu bucket R2.

> Convenções: rode os comandos a partir da raiz do repositório. Troque `<data>` pelo carimbo do backup
> (ex.: `20260101-031500`). Os comandos assumem o projeto Compose `trackzyn-prod` e o arquivo de ambiente
> `deploy/public/.env`, ambos embutidos no atalho `./deploy/public/trackzyn-compose` (veja o README).

## 1. Verificar a integridade
```bash
cd <pasta-dos-backups> && shasum -a 256 -c trackzyn-<data>.sha256
```

## 2. Testar a restauração sem tocar na produção (faça de tempos em tempos)
```bash
age -d -i ~/.config/trackzyn-backup/age-key.txt -o /tmp/restore.dump trackzyn-db-<data>.dump.age
docker run -d --name trackzyn-restore-test -e POSTGRES_PASSWORD=teste -e POSTGRES_DB=trackzyn docker.io/library/postgres:16-alpine
docker exec trackzyn-restore-test psql -U postgres trackzyn -c "create extension if not exists vector;"
docker cp /tmp/restore.dump trackzyn-restore-test:/tmp/restore.dump
docker exec trackzyn-restore-test pg_restore -U postgres -d trackzyn --no-owner /tmp/restore.dump
docker exec trackzyn-restore-test psql -U postgres trackzyn -c "select count(*) from users;"
docker rm -f trackzyn-restore-test && rm /tmp/restore.dump
```
O dump em claro contém os dados da aplicação: apague `/tmp/restore.dump` ao terminar. Compare o resultado
(número de tabelas, usuários, versão da migration) com a produção para confirmar que o backup é utilizável.

## 3. Restaurar na produção (DESTRUTIVO: substitui o banco atual)
Pare o backend e os workers para não gravarem durante a restauração, e faça um backup novo antes.
```bash
C="./deploy/public/trackzyn-compose"
./deploy/public/backup/backup.sh                   # backup de segurança do estado atual
$C stop backend celery-worker celery-beat frontend
age -d -i ~/.config/trackzyn-backup/age-key.txt -o /tmp/restore.dump trackzyn-db-<data>.dump.age
docker cp /tmp/restore.dump trackzyn-prod-db-1:/tmp/restore.dump
docker exec trackzyn-prod-db-1 psql -U postgres -c "drop database trackzyn;" -c "create database trackzyn;"
docker exec trackzyn-prod-db-1 psql -U postgres trackzyn -c "create extension if not exists vector;"
docker exec trackzyn-prod-db-1 pg_restore -U postgres -d trackzyn --no-owner /tmp/restore.dump
$C up -d
rm /tmp/restore.dump
```

## 4. Restaurar os arquivos enviados
```bash
age -d -i ~/.config/trackzyn-backup/age-key.txt trackzyn-files-<data>.tar.gz.age \
  | docker run --rm -i --entrypoint tar -v trackzyn-prod_files:/data docker.io/library/redis:8-alpine xzf - -C /data
```

## 5. Restaurar em outra máquina
Restaure usando o **mesmo `SECRET_KEY`** do servidor original; com outro valor o banco volta íntegro, mas todos os logins
caem (e qualquer dado que você criptografe com uma chave derivada dele fica ilegível). O backup **não inclui** o arquivo `.env`:
guarde `SECRET_KEY` e a chave privada age no gerenciador de senhas.
