import type { PrismaClient } from '@prisma/client'
import { Prisma } from '@prisma/client'
import * as crypto from 'node:crypto'
import * as points from '../../shared/points/operation-spend-award-runs'
import * as decisions from '../../src/lib/financial-review/manual-decisions'
import * as evidence from '../../src/lib/financial-review/evidence'
import * as capabilities from '../../src/lib/financial-review/capabilities'
import * as packageQuote from '../../shared/operations/package-quote'
import { lockFinancialOperation } from '../../shared/operations/financial-lock'
import { captureCompletionEffects } from '../../shared/operations/completion-effects'
import { loadIsolatedModule } from './promo-dispatch-harness'

export function loadReviewFinalizers(db: PrismaClient) {
    const pointApi = loadIsolatedModule('src/lib/points/operation-spend-award-runs.ts', {
        '@/lib/prisma': { default: db }, '../../../shared/points/operation-spend-award-runs': points,
    })
    const manual = loadIsolatedModule<typeof import('../../src/lib/operations/manual-fulfillment-finalization')>(
        'src/lib/operations/manual-fulfillment-finalization.ts', {
            '@prisma/client': { Prisma }, '@/lib/prisma': { default: db }, '@/lib/financial-review/manual-decisions': decisions,
            '@/lib/financial-review/evidence': evidence, '@/lib/points/operation-spend-award-runs': pointApi,
            '@/lib/financial-review/capabilities': capabilities, '../../../shared/operations/financial-lock': { lockFinancialOperation },
            '../../../shared/operations/completion-effects': { captureCompletionEffects },
        })
    const legacy = loadIsolatedModule<typeof import('../../src/lib/operations/legacy-review-finalization')>(
        'src/lib/operations/legacy-review-finalization.ts', { 'node:crypto': crypto,
            '../../../shared/operations/package-quote': packageQuote, './manual-fulfillment-finalization': manual })
    return { ...manual, ...legacy }
}
