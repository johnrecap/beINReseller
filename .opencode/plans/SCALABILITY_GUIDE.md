# beIN Reseller Panel - Scalability & High-Traffic Guide

> **Target:** 100-500 concurrent users on Single VPS
> **Project:** E:\work\panel_bien_sport\project\bein-reseller-panel
> **Generated:** January 2026
> **Status:** Ready for Implementation

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current Architecture](#current-architecture)
3. [Critical Issues Found](#critical-issues-found)
4. [Phase 1: Database Improvements](#phase-1-database-improvements)
5. [Phase 2: PM2 Clustering](#phase-2-pm2-clustering)
6. [Phase 3: Worker Reliability](#phase-3-worker-reliability)
7. [Phase 4: Redis Optimization](#phase-4-redis-optimization)
8. [Phase 5: Health Monitoring](#phase-5-health-monitoring)
9. [Phase 6: Proxy Resilience](#phase-6-proxy-resilience)
10. [Testing Checklist](#testing-checklist)
11. [Rollback Plan](#rollback-plan)
12. [Resource Requirements](#resource-requirements)

---

## Executive Summary

This document provides a comprehensive guide for scaling the beIN Reseller Panel to handle high traffic volumes (100-500 concurrent users) on a single VPS server.

### Key Findings

| Area | Current State | Recommendation |
|------|--------------|----------------|
| **Database** | No connection pooling | Add pool limits (max: 20) |
| **Web Server** | Single instance | Enable PM2 clustering (4 instances) |
| **Workers** | 8 processes, no stall handling | Add stalled job detection |
| **Redis** | Basic config | Add reconnection strategy |
| **Monitoring** | None | Add health check endpoint |
| **Proxy** | No 403 detection | Add automatic failover |

### Risk Assessment

| Change | Risk Level | Can Break Existing? |
|--------|------------|---------------------|
| Database indexes | Zero | No |
| Connection pooling | Low | No (if pool > 10) |
| PM2 clustering | Medium | Test first |
| Stalled job handling | Low | No |
| Redis reconnection | Zero | No |
| Health endpoint | Zero | No |

---

## Current Architecture

```
+-------------------------------------------------------------------+
|                        FRONTEND                                    |
|  Next.js 16.1.1 + React 19 + TypeScript + Tailwind CSS v4         |
+-------------------------------------------------------------------+
                              |
+-------------------------------------------------------------------+
|                        BACKEND API                                 |
|  Next.js API Routes + NextAuth v5 + Rate Limiting                 |
|  instances: 1 (BOTTLENECK)                                        |
+-------------------------------------------------------------------+
                              |
+--------------------+--------------------+--------------------------+
|    PostgreSQL      |      Redis         |    BullMQ Queue          |
|    (No pool limit) |   (Basic config)   |   (No stall detect)      |
+--------------------+--------------------+--------------------------+
                              |
+-------------------------------------------------------------------+
|                    WORKER PROCESSES (x8)                           |
|  HTTP Client Mode | 8 concurrency each                            |
|  350MB memory limit per worker                                    |
+-------------------------------------------------------------------+
```

---

## Critical Issues Found

### Issue 1: Database Connection Pool (CRITICAL)

**File:** `src/lib/prisma.ts`

**Current Code:**
```typescript
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  // NO LIMITS - can exhaust PostgreSQL connections!
})
```

**Problem:** Under high load, each request creates new connections until PostgreSQL hits `max_connections` limit.

---

### Issue 2: Single Web Instance (CRITICAL)

**File:** `ecosystem.config.js`

**Current Code:**
```javascript
{
  name: 'bein-web',
  instances: 1,  // Single point of failure!
  exec_mode: 'fork',
}
```

**Problem:** Single process can't utilize multi-core CPUs.

---

### Issue 3: No Stalled Job Handling (HIGH)

**File:** `worker/src/index.ts`

**Problem:** If a worker crashes mid-job, the job is lost.

---

### Issue 4: Session TTL Too Long (MEDIUM)

**File:** `worker/src/lib/session-cache.ts`

- **Current:** 600 minutes (10 hours!)
- **Recommended:** 60-120 minutes

---

### Issue 5: No 403 Proxy Detection (MEDIUM)

**File:** `worker/src/http/HttpClientService.ts`

**Problem:** When beIN blocks a proxy (403), the system doesn't mark proxy as unhealthy.

---

## Phase 1: Database Improvements

### 1.1 Add Connection Pool Limits

**File:** `src/lib/prisma.ts`

```typescript
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

// Create PostgreSQL pool with limits
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,                    // Max connections per process
  min: 5,                     // Keep 5 warm connections
  idleTimeoutMillis: 30000,   // Close idle after 30s
  connectionTimeoutMillis: 5000, // Fail fast if can't connect
})

// Log pool events for monitoring
pool.on('error', (err) => {
  console.error('PostgreSQL pool error:', err)
})

const adapter = new PrismaPg(pool)

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

export default prisma
```

### 1.2 Add Missing Database Indexes

**File:** `prisma/schema.prisma`

```prisma
model Operation {
  // ... existing fields ...
  @@index([createdAt])
  @@index([type, status])
}

model Transaction {
  // ... existing fields ...
  @@index([createdAt])
  @@index([type])
}

model ActivityLog {
  // ... existing fields ...
  @@index([action, createdAt])
}
```

**Apply migration:**
```bash
npx prisma migrate dev --name add_scalability_indexes
```

---

## Phase 2: PM2 Clustering

### 2.1 Update PM2 Configuration

**File:** `ecosystem.config.js`

```javascript
module.exports = {
    apps: [
        {
            name: 'bein-web',
            script: 'node_modules/next/dist/bin/next',
            args: 'start',
            cwd: './',
            instances: 4,              // Use 4 instances
            exec_mode: 'cluster',      // Enable clustering
            env: {
                NODE_ENV: 'production',
                PORT: 3000,
            },
            max_memory_restart: '1G',
            listen_timeout: 10000,
            kill_timeout: 5000,
            wait_ready: true,
        },
        ...createWorkers()
    ],
};

function createWorkers() {
    const WORKER_COUNT = 8;
    const COMMON_CONFIG = {
        script: 'dist/index.js',
        cwd: './worker',
        instances: 1,
        exec_mode: 'fork',
        max_memory_restart: '512M',   // Increased from 350M
        autorestart: true,
        max_restarts: 10,
        restart_delay: 5000,
    };

    return Array.from({ length: WORKER_COUNT }, (_, i) => ({
        name: `bein-worker-${i + 1}`,
        ...COMMON_CONFIG,
        env: {
            USE_HTTP_CLIENT: 'true',
            NODE_ENV: 'production',
            WORKER_CONCURRENCY: '8',
            WORKER_RATE_LIMIT: '50',
            WORKER_ID: `worker-${i + 1}`,
        },
    }));
}
```

---

## Phase 3: Worker Reliability

### 3.1 Add Stalled Job Detection

**File:** `worker/src/index.ts`

```typescript
const worker = new Worker(
    'operations',
    async (job) => {
        if (USE_HTTP_CLIENT) {
            return processOperationHttp(job, accountPool!)
        } else {
            return processOperation(job, automation!, accountPool!)
        }
    },
    {
        connection: connection as any,
        concurrency: WORKER_CONCURRENCY,
        limiter: {
            max: WORKER_RATE_LIMIT,
            duration: 60000,
        },
        // NEW: Stalled job configuration
        lockDuration: 120000,       // 2 min lock per job
        stalledInterval: 30000,     // Check every 30s
        maxStalledCount: 2,         // Retry stalled jobs 2x
    }
)

worker.on('stalled', (jobId) => {
    console.warn(`Job ${jobId} stalled - will retry`)
})
```

---

## Phase 4: Redis Optimization

### 4.1 Improve Redis Connection

**File:** `src/lib/redis.ts`

```typescript
import Redis from 'ioredis'

export const redis = new Redis(process.env.REDIS_URL!, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    
    retryStrategy: (times: number) => {
        if (times > 10) return null
        return Math.min(times * 100, 3000)
    },
    
    reconnectOnError: (err) => {
        return err.message.includes('READONLY')
    },
})

redis.on('error', (err) => console.error('Redis error:', err.message))
redis.on('ready', () => console.log('Redis ready'))

export default redis
```

### 4.2 Reduce Session TTL

**File:** `worker/src/lib/session-cache.ts`

Change default TTL from 600 to 120 minutes.

---

## Phase 5: Health Monitoring

### 5.1 Create Health Check Endpoint

**File:** `src/app/api/health/route.ts` (NEW FILE)

```typescript
import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import redis from '@/lib/redis'

export async function GET() {
    const health = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        checks: { database: false, redis: false }
    }
    
    try {
        await prisma.$queryRaw`SELECT 1`
        health.checks.database = true
    } catch {}
    
    try {
        await redis.ping()
        health.checks.redis = true
    } catch {}
    
    const allHealthy = health.checks.database && health.checks.redis
    health.status = allHealthy ? 'ok' : 'degraded'
    
    return NextResponse.json(health, { 
        status: allHealthy ? 200 : 503 
    })
}
```

---

## Phase 6: Proxy Resilience

### 6.1 Add 403 Detection

**File:** `worker/src/http/HttpClientService.ts`

After GET login page:

```typescript
if (loginPageRes.status === 403) {
    console.error('[HTTP] 403 Forbidden - Proxy blocked by beIN');
    return {
        success: false,
        error: 'PROXY_BLOCKED: Proxy IP blocked by beIN',
        requiresProxyChange: true
    };
}
```

### 6.2 Handle in Queue Processor

**File:** `worker/src/http-queue-processor.ts`

```typescript
if (error.message?.includes('PROXY_BLOCKED')) {
    if (selectedAccount?.proxyId) {
        await prisma.proxy.update({
            where: { id: selectedAccount.proxyId },
            data: {
                failureCount: { increment: 1 },
                isActive: false
            }
        });
    }
    await accountPool.markAccountFailed(accountId, 'PROXY_BLOCKED');
}
```

---

## Testing Checklist

### Phase 1 (Database)
- [ ] Load test with 50 concurrent requests
- [ ] Verify pool connections <= 20
- [ ] Migration applies cleanly

### Phase 2 (PM2 Clustering)
- [ ] Login flow works
- [ ] Renewal wizard completes
- [ ] Signal refresh works
- [ ] Rate limiting works

### Phase 3 (Worker Reliability)
- [ ] Kill worker mid-job, verify retry
- [ ] Stalled event fires

### Phase 4 (Redis)
- [ ] Stop Redis, verify degradation
- [ ] Restart Redis, verify reconnection

### Phase 5 (Health Check)
- [ ] `/api/health` returns 200
- [ ] Stop DB, returns 503

### Phase 6 (Proxy)
- [ ] Blocked proxy detected
- [ ] Proxy marked inactive

---

## Rollback Plan

| Change | Rollback |
|--------|----------|
| DB Pool | Remove pool options, restart |
| Indexes | `prisma migrate revert` |
| PM2 Cluster | `instances: 1`, `exec_mode: 'fork'` |
| Session TTL | Change back to `600` |

---

## Resource Requirements

### Minimum (100 users)
- CPU: 4 cores
- RAM: 8GB
- Storage: 50GB SSD
- PostgreSQL max_connections: 100
- Redis memory: 512MB

### Recommended (500 users)
- CPU: 8 cores
- RAM: 16GB
- Storage: 100GB NVMe
- PostgreSQL max_connections: 200
- Redis memory: 1GB

---

## Implementation Order

1. **Zero Risk:** Database indexes, Health endpoint, Redis reconnection
2. **Low Risk:** Connection pooling, Stalled jobs, Session TTL
3. **Medium Risk:** PM2 clustering, Proxy 403 detection

---

## Monitoring Commands

```bash
pm2 status
pm2 monit
pm2 logs bein-worker-1 --lines 100
redis-cli INFO memory
psql -c "SELECT count(*) FROM pg_stat_activity;"
```
