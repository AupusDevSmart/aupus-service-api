# Guia de Backup e Restore do Banco de Dados

Este guia explica como fazer backup completo e restore do banco de dados PostgreSQL da aplicação Aupus.

## 📋 Índice

- [Backup](#backup)
- [Restore](#restore)
- [Estrutura dos Arquivos](#estrutura-dos-arquivos)
- [Troubleshooting](#troubleshooting)
- [Automação](#automação)

---

## 🔒 Backup

### Executar Backup Completo

Para criar um backup de todas as tabelas do banco de dados:

```bash
cd aupus-service-api
npm run backup
```

### O que o script faz:

1. **Conecta ao banco** configurado no `.env` (DATABASE_URL)
2. **Exporta todas as tabelas** (83 tabelas no total) para arquivos JSON individuais
3. **Cria um diretório** com timestamp: `backups/backup_YYYY-MM-DDTHH-mm-ss/`
4. **Salva metadados** do backup em `_metadata.json`
5. **Mostra estatísticas** do backup ao final

### Exemplo de Saída:

```
🔄 Iniciando backup completo do banco de dados...
📁 Diretório de backup: C:\Users\Public\aupus-service\aupus-service-api\backups\backup_2026-02-03T16-30-00

📋 Exportando tabela: usuarios...
   ✅ 145 registros exportados
📋 Exportando tabela: plantas...
   ✅ 52 registros exportados
...

============================================================
✅ BACKUP CONCLUÍDO!
============================================================
📊 Resumo:
   • Tabelas processadas: 83
   • Sucesso: 83
   • Falhas: 0
   • Total de registros: 15.432
   • Duração: 45.23s
   • Localização: C:\Users\Public\aupus-service\aupus-service-api\backups\backup_2026-02-03T16-30-00
============================================================

📈 Top 10 tabelas com mais registros:
   1. equipamentos_dados: 8.523 registros
   2. inversor_leituras: 3.241 registros
   3. usuarios: 145 registros
   ...
```

### Estrutura do Backup:

```
backups/
└── backup_2026-02-03T16-30-00/
    ├── _metadata.json          # Informações do backup
    ├── usuarios.json           # Dados da tabela usuarios
    ├── plantas.json            # Dados da tabela plantas
    ├── equipamentos.json       # Dados da tabela equipamentos
    └── ...                     # Uma arquivo .json por tabela
```

---

## 🔄 Restore

### ⚠️ IMPORTANTE - Antes de Restaurar

**O restore SOBRESCREVE todos os dados do banco atual!**

Recomendações:
1. **Faça backup do banco atual** antes de restaurar
2. **Pare a aplicação** durante o restore
3. **Verifique o caminho** do backup está correto
4. **Teste em ambiente de desenvolvimento** primeiro

### Executar Restore

```bash
cd aupus-service-api
npm run restore -- backups/backup_2026-02-03T16-30-00
```

### O que o script faz:

1. **Valida o diretório** de backup
2. **Desabilita constraints** temporariamente (para evitar erros de foreign key)
3. **Limpa cada tabela** com `TRUNCATE CASCADE`
4. **Insere os dados** do backup (em lotes de 500 registros)
5. **Reabilita constraints**
6. **Atualiza sequences** do PostgreSQL (auto-increment)
7. **Mostra estatísticas** ao final

### Ordem de Restauração

O script restaura as tabelas na ordem correta respeitando dependências de foreign keys:

1. Tabelas sem dependências (cache, migrations, etc.)
2. Organizações e usuários
3. Plantas e unidades
4. Equipamentos
5. Anomalias, manutenção, etc.
6. Ordens de serviço

### Exemplo de Saída:

```
🔄 Iniciando restore do banco de dados...
📁 Origem: backups/backup_2026-02-03T16-30-00

📊 Informações do backup:
   • Data: 03/02/2026 16:30:00
   • Total de registros: 15.432
   • Tabelas: 83

📦 Encontrados 83 arquivos para restaurar

⚠️  ATENÇÃO: Este processo irá SUBSTITUIR os dados existentes!
   Recomenda-se fazer backup do banco atual antes de continuar.

⚙️  Preparando banco para restore...
📋 Restaurando tabela: usuarios...
   📦 145/145 registros inseridos...
   ✅ 145 registros restaurados
...

⚙️  Finalizando restore...
🔄 Atualizando sequences...

============================================================
✅ RESTORE CONCLUÍDO!
============================================================
📊 Resumo:
   • Tabelas processadas: 83
   • Sucesso: 83
   • Falhas: 0
   • Puladas: 0
   • Total restaurado: 15.432 registros
   • Duração: 67.45s
============================================================
```

---

## 📁 Estrutura dos Arquivos

### Arquivo de Metadados (_metadata.json)

```json
{
  "timestamp": "2026-02-03T16:30:00.000Z",
  "database": "aupus",
  "totalTables": 83,
  "successfulTables": 83,
  "failedTables": 0,
  "totalRecords": 15432,
  "duration": "45.23s",
  "stats": [
    {
      "tableName": "usuarios",
      "recordCount": 145,
      "status": "success"
    }
    // ... estatísticas de todas as tabelas
  ]
}
```

### Arquivo de Dados de Tabela (exemplo: usuarios.json)

```json
[
  {
    "id": "01JQ8X9Z2...",
    "nome": "João Silva",
    "email": "joao@example.com",
    "created_at": "2025-01-15T10:30:00.000Z",
    // ... outros campos
  },
  {
    "id": "01JQ8X9Z3...",
    "nome": "Maria Santos",
    "email": "maria@example.com",
    // ... outros campos
  }
  // ... mais registros
]
```

---

## 🔧 Troubleshooting

### Erro: "Too many database connections (P2037)"

Se você receber este erro durante backup ou restore:

```bash
# 1. Pare todas as instâncias da aplicação
Get-Process -Name node | Where-Object {$_.Path -like "*aupus-service-api*"} | Stop-Process -Force

# 2. Aguarde 30 segundos para conexões serem liberadas

# 3. Execute o backup/restore novamente
npm run backup
```

**Veja também**: [TROUBLESHOOTING_DB_CONNECTIONS.md](./TROUBLESHOOTING_DB_CONNECTIONS.md)

### Erro: "Permission denied" ou "Cannot create directory"

**Windows**:
```powershell
# Execute o terminal como Administrador
```

**Solução alternativa**:
```bash
# Criar o diretório manualmente
mkdir backups
```

### Erro de Foreign Key Durante Restore

O script desabilita constraints automaticamente, mas se houver erros:

1. Verifique se o backup está completo (todas as tabelas)
2. Execute o restore em um banco vazio primeiro
3. Verifique logs de erro específicos

### Backup Muito Lento

Para tabelas com milhões de registros:

1. **Use pg_dump nativo** (se disponível):
   ```bash
   pg_dump -h 45.55.122.87 -U admin -d aupus -F c -f backup.dump
   ```

2. **Ajuste connection_limit** temporariamente no `.env`:
   ```env
   # Aumentar apenas durante backup
   DATABASE_URL="...&connection_limit=10"
   ```

3. **Execute em horário de baixo tráfego**

---

## 🤖 Automação

### Backup Automático Diário (Windows Task Scheduler)

**1. Criar script PowerShell** (`backup-daily.ps1`):

```powershell
# backup-daily.ps1
$BackupDir = "C:\backups\aupus"
$LogFile = "$BackupDir\backup-log.txt"
$Date = Get-Date -Format "yyyy-MM-dd_HH-mm"

# Criar diretório se não existir
if (!(Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir
}

# Executar backup
cd "C:\Users\Public\aupus-service\aupus-service-api"
npm run backup 2>&1 | Tee-Object -FilePath $LogFile -Append

# Limpar backups antigos (manter últimos 7 dias)
Get-ChildItem "$BackupDir\backup_*" -Directory |
    Where-Object { $_.CreationTime -lt (Get-Date).AddDays(-7) } |
    Remove-Item -Recurse -Force

Write-Output "[$Date] Backup concluído" | Add-Content $LogFile
```

**2. Agendar no Task Scheduler**:

```powershell
# Criar tarefa que executa às 2h da manhã todo dia
$action = New-ScheduledTaskAction -Execute "PowerShell.exe" -Argument "-File C:\backups\backup-daily.ps1"
$trigger = New-ScheduledTaskTrigger -Daily -At 2am
Register-ScheduledTask -TaskName "Aupus Backup Diário" -Action $action -Trigger $trigger
```

### Backup Automático com Cron (Linux)

```bash
# Editar crontab
crontab -e

# Adicionar linha para backup diário às 2h
0 2 * * * cd /path/to/aupus-service-api && npm run backup >> /var/log/aupus-backup.log 2>&1
```

### Script de Rotação de Backups

```bash
#!/bin/bash
# rotate-backups.sh

BACKUP_DIR="/path/to/backups"
RETENTION_DAYS=7

# Deletar backups mais antigos que 7 dias
find "$BACKUP_DIR" -type d -name "backup_*" -mtime +$RETENTION_DAYS -exec rm -rf {} \;

echo "Backups antigos removidos (retention: $RETENTION_DAYS dias)"
```

---

## 📊 Boas Práticas

### Frequência de Backup

- **Desenvolvimento**: Semanal ou antes de mudanças grandes
- **Produção**: **Diário** (mínimo) ou **a cada hora** (recomendado)
- **Crítico**: Backup contínuo com replicação

### Armazenamento

1. **Local**: Para restore rápido
2. **Remoto**: Cloud storage (AWS S3, Google Cloud, Azure)
3. **Múltiplas cópias**: Princípio 3-2-1
   - 3 cópias dos dados
   - 2 tipos de mídia diferentes
   - 1 cópia offsite

### Teste de Restore

**Sempre teste seus backups!**

```bash
# 1. Criar banco de teste
createdb aupus_test

# 2. Configurar .env.test
DATABASE_URL="postgresql://admin:password@localhost:5432/aupus_test?..."

# 3. Executar restore no banco de teste
DATABASE_URL="postgresql://..." npm run restore -- backups/backup_2026-02-03

# 4. Validar dados restaurados
# 5. Deletar banco de teste
dropdb aupus_test
```

### Monitoramento

Monitore o tamanho dos backups:

```powershell
# Windows
Get-ChildItem "backups" -Recurse | Measure-Object -Property Length -Sum

# Linux
du -sh backups/*
```

---

## 🔗 Links Relacionados

- [TROUBLESHOOTING_DB_CONNECTIONS.md](./TROUBLESHOOTING_DB_CONNECTIONS.md) - Resolver problemas de conexão
- [Prisma Documentation](https://www.prisma.io/docs) - Documentação oficial do Prisma
- [PostgreSQL Backup](https://www.postgresql.org/docs/current/backup.html) - Documentação PostgreSQL

---

## 💡 Dicas Rápidas

**Backup antes de:**
- Migrations de schema
- Deploy de versões novas
- Testes de carga
- Mudanças em produção

**Verificar backup:**
```bash
# Ver tamanho do backup
cd backups/backup_2026-02-03T16-30-00
dir  # Windows
ls -lh  # Linux

# Ver metadados
type _metadata.json  # Windows
cat _metadata.json   # Linux
```

**Backup seletivo (apenas algumas tabelas):**

Modifique o script `backup-database.ts` e comente as tabelas que não precisa:

```typescript
const tables = [
  'usuarios',
  'plantas',
  // 'equipamentos_dados',  // Comentado - não fazer backup
  // ...
];
```

---

## 📞 Suporte

Se tiver problemas com backup/restore:

1. Verifique os logs do script
2. Consulte [TROUBLESHOOTING_DB_CONNECTIONS.md](./TROUBLESHOOTING_DB_CONNECTIONS.md)
3. Verifique conexão com banco: `npm run test-db`
4. Entre em contato com a equipe de infraestrutura

---

**Última atualização**: 03/02/2026
