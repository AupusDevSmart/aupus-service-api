# Troubleshooting: Database Connection Pool Issues (P2037)

## Problem
Error `P2037: Too many database connections opened` occurs when the PostgreSQL server's `max_connections` limit is reached.

## Root Causes
1. **Multiple app instances** running simultaneously connecting to the same database
2. **Zombie connections** from crashed or improperly terminated instances
3. **Connection limit too high** relative to database's `max_connections` setting
4. **Long-running queries** holding connections open

## Solutions Implemented

### 1. Connection Pool Configuration
**File**: [.env](./env#L8)

```env
DATABASE_URL="postgresql://admin:password@45.55.122.87:5432/aupus?schema=public&connection_limit=3&pool_timeout=20&connect_timeout=10&socket_timeout=0&pgbouncer=true"
```

- `connection_limit=3`: Conservative limit (3 connections per app instance)
- `pool_timeout=20`: Wait up to 20s for available connection
- `pgbouncer=true`: Optimizations for connection pooling proxy

### 2. Automatic Retry with Exponential Backoff
**File**: [src/shared/prisma/prisma.service.ts](./src/shared/prisma/prisma.service.ts#L70-L125)

The `executeWithRetry()` method now handles P2037 errors specially:
- Waits progressively longer (2s, 4s, 6s) for connections to free up
- Does NOT disconnect/reconnect (unlike other connection errors)
- Retries up to 3 times before failing

### 3. Usage in Services
**Example**: [src/modules/plantas/plantas.service.ts](./src/modules/plantas/plantas.service.ts#L171)

```typescript
const [plantas, total] = await this.prisma.executeWithRetry(async () => {
  return await Promise.all([
    this.prisma.plantas.findMany({ /* ... */ }),
    this.prisma.plantas.count({ /* ... */ })
  ]);
});
```

## Best Practices

### 1. Always Stop Old Instances Before Starting New Ones
```powershell
# Check running Node processes
Get-Process -Name node | Select-Object Id, ProcessName, StartTime

# Stop old backend instances
Stop-Process -Id <PID> -Force
```

### 2. Check for Multiple Instances
```powershell
# Get command lines for all node processes
Get-WmiObject Win32_Process -Filter "name='node.exe'" | Select-Object ProcessId, CommandLine
```

### 3. Monitor Connection Usage
Add this query to check active connections on PostgreSQL:
```sql
SELECT count(*)
FROM pg_stat_activity
WHERE datname = 'aupus';
```

### 4. Clean Zombie Connections (PostgreSQL Admin)
If you have database admin access:
```sql
-- View connections
SELECT pid, usename, application_name, client_addr, state, query_start
FROM pg_stat_activity
WHERE datname = 'aupus';

-- Kill zombie connections (run on database server)
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = 'aupus'
  AND state = 'idle'
  AND query_start < NOW() - INTERVAL '30 minutes';
```

## Monitoring

### Check if P2037 is being retried:
Look for these log messages:
```
[PrismaService] Pool de conexões esgotado (P2037). Aguardando 2s antes de tentar novamente... (1/3)
```

### If retries fail:
1. Check if multiple app instances are running
2. Verify DATABASE_URL connection_limit is low (3-5)
3. Contact database admin to check `max_connections` setting
4. Consider using PgBouncer for better connection pooling

## Emergency Fix

If the issue persists and you need immediate resolution:

1. **Stop all backend instances**:
   ```powershell
   Get-Process -Name node | Where-Object {$_.Path -like "*aupus-service-api*"} | Stop-Process -Force
   ```

2. **Wait 30 seconds** for connections to timeout

3. **Start only ONE instance**:
   ```bash
   cd aupus-service-api
   npm run start:dev
   ```

4. **Contact database administrator** to:
   - Increase `max_connections` in PostgreSQL (if possible)
   - Set up PgBouncer connection pooler
   - Clean up zombie connections

## Configuration Tunables

If you need to adjust the connection settings:

| Parameter | Current | Recommended Range | Effect |
|-----------|---------|-------------------|--------|
| `connection_limit` | 3 | 3-5 | Lower = fewer connections per instance |
| `pool_timeout` | 20s | 15-30s | How long to wait for available connection |
| `connect_timeout` | 10s | 5-15s | Initial connection timeout |
| Retry attempts | 3 | 3-5 | Times to retry on P2037 |
| Retry delay | 2s | 1-3s | Base delay between retries |

## Related Files
- [.env](./.env) - Database URL configuration
- [prisma.service.ts](./src/shared/prisma/prisma.service.ts) - Connection pool management
- [plantas.service.ts](./src/modules/plantas/plantas.service.ts) - Example usage
