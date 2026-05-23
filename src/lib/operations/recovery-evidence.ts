import { Prisma } from '@prisma/client'
import { parseOperationResponseData } from '@/lib/operation-safety'
import type { AccountLockReleaseEvidence } from '@/lib/operations/account-lock-release'
import type {
    RecoveryDecision,
    RecoveryFinancialImpact,
    RecoverySource,
} from '@/lib/operations/recovery-classifier'

export function mergeRecoveryEvidence(
    responseData: unknown,
    input: {
        source: RecoverySource
        decision: RecoveryDecision
        reason: string
        financialImpact: RecoveryFinancialImpact
        at: Date
        lockRelease?: AccountLockReleaseEvidence
    }
): Prisma.InputJsonObject {
    const base = parseOperationResponseData(responseData)
    const lockRelease = input.lockRelease
        ? {
            attempted: input.lockRelease.attempted,
            released: input.lockRelease.released,
            reason: input.lockRelease.reason,
            ...(input.lockRelease.currentOwner !== undefined
                ? { currentOwner: input.lockRelease.currentOwner }
                : {}),
            ...(input.lockRelease.expectedOwner !== undefined
                ? { expectedOwner: input.lockRelease.expectedOwner }
                : {}),
        } satisfies Prisma.InputJsonObject
        : undefined

    return {
        ...base,
        lastRecoveryDecision: input.decision,
        lastRecoveryReason: input.reason,
        lastRecoverySource: input.source,
        lastRecoveryFinancialImpact: input.financialImpact,
        lastRecoveryAt: input.at.toISOString(),
        ...(lockRelease ? { lastRecoveryLockRelease: lockRelease } : {}),
    }
}
