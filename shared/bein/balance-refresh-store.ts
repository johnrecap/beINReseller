import { BALANCE_QUEUE_MS, BALANCE_RUN_MS, BALANCE_MAX_MS, BALANCE_RECORD_SECONDS, BALANCE_RESULT_SECONDS,
    validBalanceObservation, type BalanceRefreshRequest, type BalanceRefreshTerminal } from './balance-refresh'

export type BalanceRedis = { get(key: string): Promise<string | null>;
    eval(script: string, keys: number, ...args: (string | number)[]): Promise<unknown> }
const prefix = 'bein:balance-refresh:request:'
export const balanceRefreshKey = (id: string) => `${prefix}${id}`
export const balanceActiveKey = (accountId: string) => `bein:balance-refresh:active:${accountId}`

export async function readBalanceRefresh(redis: BalanceRedis, id: string, now = Date.now()): Promise<BalanceRefreshRequest | null> {
    const raw = await redis.get(balanceRefreshKey(id))
    if (!raw) return null
    const request = JSON.parse(raw) as BalanceRefreshRequest
    if ((request.state === 'QUEUED' || request.state === 'RUNNING') && request.deadline <= now) {
        const updated = await redis.eval(`
            local raw = redis.call('get', KEYS[1])
            if not raw then return false end
            local r = cjson.decode(raw)
            if (r.state == 'QUEUED' or r.state == 'RUNNING') and r.deadline <= tonumber(ARGV[1]) then
                r.state = 'FAILED'; r.errorCode = 'BALANCE_TIMEOUT'; r.runToken = nil
                redis.call('set', KEYS[1], cjson.encode(r), 'EX', ARGV[2])
                if redis.call('get', KEYS[2]) == r.requestId then redis.call('del', KEYS[2]) end
            end
            return cjson.encode(r)
        `, 2, balanceRefreshKey(id), balanceActiveKey(request.accountId), now, BALANCE_RESULT_SECONDS)
        return typeof updated === 'string' ? JSON.parse(updated) as BalanceRefreshRequest : null
    }
    return request
}

export async function activeBalanceRefresh(redis: BalanceRedis, accountId: string, now = Date.now()) {
    const id = await redis.get(balanceActiveKey(accountId))
    if (!id) return null
    const request = await readBalanceRefresh(redis, id, now)
    return request && request.accountId === accountId && (request.state === 'QUEUED' || request.state === 'RUNNING') ? request : null
}

export async function admitBalanceRefresh(redis: BalanceRedis, accountId: string, id: string, now = Date.now()) {
    const request: BalanceRefreshRequest = { requestId: id, accountId, state: 'QUEUED', createdAt: now,
        deadline: now + BALANCE_QUEUE_MS, expiresAt: now + BALANCE_RECORD_SECONDS * 1000 }
    const value = await redis.eval(`
        local active = redis.call('get', KEYS[1])
        if active then
            local raw = redis.call('get', ARGV[7] .. active)
            if raw then
                local r = cjson.decode(raw)
                if (r.state == 'QUEUED' or r.state == 'RUNNING') and r.deadline > tonumber(ARGV[3]) then
                    return cjson.encode({created=false, request=r})
                end
                if r.state == 'QUEUED' or r.state == 'RUNNING' then
                    r.state='FAILED'; r.errorCode='BALANCE_TIMEOUT'; r.runToken=nil
                    redis.call('set', ARGV[7] .. active, cjson.encode(r), 'EX', ARGV[6])
                end
            end
        end
        if redis.call('exists', KEYS[2]) == 1 then return redis.error_reply('BALANCE_REQUEST_ID_REUSED') end
        redis.call('set', KEYS[1], ARGV[1], 'PX', ARGV[4])
        redis.call('set', KEYS[2], ARGV[2], 'EX', ARGV[5])
        return cjson.encode({created=true, request=cjson.decode(ARGV[2])})
    `, 2, balanceActiveKey(accountId), balanceRefreshKey(id), id, JSON.stringify(request), now,
    BALANCE_MAX_MS, BALANCE_RECORD_SECONDS, BALANCE_RESULT_SECONDS, prefix)
    if (typeof value !== 'string') throw new Error('BALANCE_STORE_INVALID_RESULT')
    return JSON.parse(value) as { created: boolean; request: BalanceRefreshRequest }
}

export async function claimBalanceRefresh(redis: BalanceRedis, id: string, token: string, now = Date.now()): Promise<BalanceRefreshRequest | null> {
    const request = await readBalanceRefresh(redis, id, now)
    if (!request) return null
    const result = await redis.eval(`
        local raw = redis.call('get', KEYS[1])
        if not raw then return false end
        local r = cjson.decode(raw)
        if r.state ~= 'QUEUED' or r.deadline <= tonumber(ARGV[2]) or redis.call('get', KEYS[2]) ~= ARGV[1] then return false end
        r.state = 'RUNNING'; r.runToken = ARGV[3]
        r.deadline = math.min(r.createdAt + tonumber(ARGV[4]), tonumber(ARGV[2]) + tonumber(ARGV[5]))
        redis.call('set', KEYS[1], cjson.encode(r), 'PX', math.max(1, r.expiresAt - tonumber(ARGV[2])))
        return cjson.encode(r)
    `, 2, balanceRefreshKey(id), balanceActiveKey(request.accountId), id, now, token, BALANCE_MAX_MS, BALANCE_RUN_MS)
    return typeof result === 'string' ? JSON.parse(result) as BalanceRefreshRequest : null
}

/** Fence a lost enqueue. A delayed job cannot claim after this write, and an
 * already running job keeps its ownership and result. */
export async function rejectUndeliveredRefresh(redis: BalanceRedis, request: BalanceRefreshRequest) {
    const value = await redis.eval(`
        local raw = redis.call('get', KEYS[1])
        if not raw then return false end
        local r = cjson.decode(raw)
        if r.state == 'QUEUED' then
            r.state='FAILED'; r.errorCode='QUEUE_UNAVAILABLE'
            redis.call('set', KEYS[1], cjson.encode(r), 'EX', ARGV[1])
            if redis.call('get', KEYS[2]) == r.requestId then redis.call('del', KEYS[2]) end
        end
        return cjson.encode(r)
    `, 2, balanceRefreshKey(request.requestId), balanceActiveKey(request.accountId), BALANCE_RESULT_SECONDS)
    return typeof value === 'string' ? JSON.parse(value) as BalanceRefreshRequest : null
}

export async function finishBalanceRefresh(redis: BalanceRedis, id: string, token: string,
    result: BalanceRefreshTerminal, now = Date.now()): Promise<boolean> {
    if (result.state === 'COMPLETED' && !validBalanceObservation(result)) throw new Error('BALANCE_NOT_FOUND')
    const raw = await redis.get(balanceRefreshKey(id))
    if (!raw) return false
    const request = JSON.parse(raw) as BalanceRefreshRequest
    return await redis.eval(`
        local raw = redis.call('get', KEYS[1])
        if not raw then return 0 end
        local r = cjson.decode(raw)
        if r.state ~= 'RUNNING' or r.runToken ~= ARGV[2] then return 0 end
        local result = cjson.decode(ARGV[3])
        if r.deadline <= tonumber(ARGV[4]) then result = {state='FAILED', errorCode='BALANCE_TIMEOUT'} end
        r.state=result.state; r.runToken=nil; r.balance=result.balance; r.updatedAt=result.updatedAt; r.errorCode=result.errorCode
        redis.call('set', KEYS[1], cjson.encode(r), 'EX', ARGV[5])
        if redis.call('get', KEYS[2]) == ARGV[1] then redis.call('del', KEYS[2]) end
        return 1
    `, 2, balanceRefreshKey(id), balanceActiveKey(request.accountId), id, token, JSON.stringify(result), now, BALANCE_RESULT_SECONDS) === 1
}
