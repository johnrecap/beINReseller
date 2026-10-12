import type { ProviderReportCriteria, ProviderReportRequest } from './bein-provider'
import { PROVIDER_REPORT_WAIT_MS, PROVIDER_REPORT_TTL_SECONDS, PROVIDER_REPORT_REFRESH_SECONDS } from './bein-provider'

type RedisStore = { get(key: string): Promise<string | null>; eval(script: string, keys: number, ...args: (string | number)[]): Promise<unknown> }
export const reportRequestKey = (id: string) => `bein:report-browser:request:${id}`
const activeKey = (accountId: string) => `bein:report-browser:active:${accountId}`
const paceKey = (accountId: string) => `bein:report-browser:pace:${accountId}`
export async function readReportRequest(redis: RedisStore, id: string): Promise<ProviderReportRequest | null> {
    const raw = await redis.get(reportRequestKey(id))
    return raw ? JSON.parse(raw) as ProviderReportRequest : null
}
export async function admitReportRequest(redis: RedisStore, criteria: ProviderReportCriteria, id: string, now = Date.now()) {
    const request: ProviderReportRequest = { ...criteria, id, createdAt: now, deadline: now + PROVIDER_REPORT_WAIT_MS, state: 'QUEUED' }
    const result = await redis.eval(`
        local active = redis.call('get', KEYS[1])
        if active then return active end
        if redis.call('exists', KEYS[2]) == 1 then return 'RATE_LIMITED' end
        redis.call('set', KEYS[1], ARGV[1], 'PX', ARGV[3])
        redis.call('set', KEYS[2], '1', 'EX', ARGV[4])
        redis.call('set', KEYS[3], ARGV[2], 'EX', ARGV[5])
        return 'CREATED'
    `, 3, activeKey(criteria.accountId), paceKey(criteria.accountId), reportRequestKey(id),
    id, JSON.stringify(request), PROVIDER_REPORT_WAIT_MS, PROVIDER_REPORT_REFRESH_SECONDS, PROVIDER_REPORT_TTL_SECONDS * 2)
    if (result === 'CREATED') return { kind: 'CREATED' as const, request }
    if (result === 'RATE_LIMITED') return { kind: 'RATE_LIMITED' as const }
    const existing = await readReportRequest(redis, String(result))
    if (existing && existing.from === criteria.from && existing.to === criteria.to && existing.deadline > now)
        return { kind: 'EXISTING' as const, request: existing }
    return { kind: 'ACCOUNT_BUSY' as const }
}
export async function claimReportRequest(redis: RedisStore, request: ProviderReportRequest, token: string): Promise<boolean> {
    const next = { ...request, state: 'RUNNING', runToken: token }
    return await redis.eval(`
        local raw = redis.call('get', KEYS[1])
        if not raw then return 0 end
        local r = cjson.decode(raw)
        if r.state ~= 'QUEUED' or redis.call('get', KEYS[2]) ~= ARGV[1] then return 0 end
        redis.call('set', KEYS[1], ARGV[2], 'EX', ARGV[3])
        return 1
    `, 2, reportRequestKey(request.id), activeKey(request.accountId), request.id, JSON.stringify(next), PROVIDER_REPORT_TTL_SECONDS * 2) === 1
}
export async function finishReportRequest(redis: RedisStore, request: ProviderReportRequest, token?: string): Promise<boolean> {
    const { runToken: _token, ...safe } = request
    void _token
    return await redis.eval(`
        local raw = redis.call('get', KEYS[1])
        if not raw then return 0 end
        local r = cjson.decode(raw)
        if ARGV[2] == '' then
            if r.state ~= 'QUEUED' then return 0 end
        elseif r.state ~= 'RUNNING' or r.runToken ~= ARGV[2] then return 0 end
        redis.call('set', KEYS[1], ARGV[3], 'EX', ARGV[4])
        if redis.call('get', KEYS[2]) == ARGV[1] then redis.call('del', KEYS[2]) end
        return 1
    `, 2, reportRequestKey(request.id), activeKey(request.accountId), request.id, token ?? '', JSON.stringify(safe), PROVIDER_REPORT_TTL_SECONDS) === 1
}
