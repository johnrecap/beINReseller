import prisma from '@/lib/prisma'
import redis from '@/lib/redis'
import { EXECUTION_ENDED_STATUSES, endedOperationExecutionIdle, releaseEndedRenewalReservations } from '../../../shared/operations/renewal-pre-payment'

export interface ProviderReservationMaintenanceSummary {
    inspected: number
    released: number
    held: number
    errors: string[]
}

// Rotate a bounded scan so held historical rows cannot starve later accounts.
let afterId: string | undefined
export async function repairTerminalProviderReservations(options: { limit?: number; now?: Date } = {}): Promise<ProviderReservationMaintenanceSummary> {
    const limit = Number.isFinite(options.limit) ? Math.max(1, Math.min(200, Math.floor(options.limit!))) : 50
    const summary: ProviderReservationMaintenanceSummary = { inspected: 0, released: 0, held: 0, errors: [] }
    const rows = await prisma.operation.findMany({
        where: { status: { in: [...EXECUTION_ENDED_STATUSES] },
            OR: [{ cardLifecycleReservation: { releasedAt: null } },
                { providerAccountCausalReservation: { releasedAt: null } }],
            ...(afterId ? { id: { gt: afterId } } : {}) },
        select: { id: true }, orderBy: { id: 'asc' }, take: limit,
    })
    afterId = rows.length === limit ? rows.at(-1)!.id : undefined
    for (const row of rows) {
        summary.inspected++
        try {
            const released = await prisma.$transaction(tx => releaseEndedRenewalReservations(
                tx, row.id, (accountId, operationId) => endedOperationExecutionIdle(redis, accountId, operationId), options.now))
            if (released) summary.released++
            else summary.held++
        } catch { summary.errors.push(row.id) }
    }
    return summary
}
