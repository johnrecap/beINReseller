import type { Prisma } from '@prisma/client'
import { classifyFinancialReview, reviewCapabilitySelect } from './capabilities'

/** Aggregate-only compatibility inspection; deliberately has no apply mode. */
export async function inspectPanelReviewCompatibility(db: Pick<Prisma.TransactionClient, 'operation'>,
    options: { batchSize?: number; maxPages?: number; cursor?: string; operationIds?: string[] } = {}) {
    const bounded = (value: number | undefined, fallback: number, max: number) => value !== undefined && Number.isFinite(value)
        ? Math.max(1, Math.min(max, Math.floor(value))) : fallback
    const batchSize = bounded(options.batchSize, 50, 200)
    const maxPages = bounded(options.maxPages, 20, 100)
    let cursor = options.cursor
    let inspected = 0
    let finished = false
    const categories: Record<string, number> = {}
    for (let page = 0; page < maxPages; page++) {
        const rows = await db.operation.findMany({ where: { type: 'RENEW', userId: { not: null }, customerId: null,
            ...(options.operationIds ? { id: { in: options.operationIds } } : {}) },
            select: reviewCapabilitySelect, orderBy: { id: 'asc' }, take: batchSize,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        })
        for (const operation of rows) {
            const category = operation.status === 'COMPLETED' && !operation.fulfillmentProof && !operation.manualFulfillmentEvidence
                ? 'HISTORICAL_COMPLETION_EVIDENCE_HOLD' : classifyFinancialReview(operation).classification
            categories[category] = (categories[category] ?? 0) + 1
            inspected++
        }
        cursor = rows.at(-1)?.id ?? cursor
        if (rows.length < batchSize) { finished = true; break }
    }
    return { mode: 'READ_ONLY', inspected, batchSize, maxPages, complete: finished, nextCursor: finished ? null : cursor ?? null,
        categories, proposedAction: 'REVIEW_ATTRIBUTABLE_EVIDENCE', financialWrites: 0, providerRequests: 0 }
}
