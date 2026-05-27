import {
    type AwardableOwnerRole,
    type AwardableUser,
    resolveOperationPointRecipients,
} from '@/lib/points/operation-awards'

export type HistoricalRoutingOwnershipReason =
    | 'MANAGER_LINK'
    | 'ADMIN_CREATOR'
    | 'NO_VALID_OWNER'

export type HistoricalRoutingAuditInput = {
    ledgerEntryId: string
    operationId: string | null
    wrongOwnerUserId: string
    wrongOwnerUsername?: string | null
    ownerRoleAtTime: AwardableOwnerRole | string
    sourceType: string
    status: string
    points: number
    operationUser: AwardableUser
    managerOwnership: { manager: AwardableUser } | null
    agentAssignment: { agent: AwardableUser } | null
    pointCashRedemption?: { balanceAmountUsd: number } | null
}

export type HistoricalRoutingCandidate = {
    ledgerEntryId: string
    operationId: string | null
    wrongOwnerUserId: string
    wrongOwnerUsername: string | null
    points: number
    availableRisk: number
    convertedRisk: boolean
    expectedOwnerUserId: string | null
    expectedOwnerRole: AwardableOwnerRole | null
    reason: HistoricalRoutingOwnershipReason
    reviewRequired: boolean
}

function isConverted(input: Pick<HistoricalRoutingAuditInput, 'status' | 'pointCashRedemption'>): boolean {
    return Boolean(input.pointCashRedemption) || input.status === 'REDEEMED'
}

export function classifyHistoricalPointRoutingCandidate(
    input: HistoricalRoutingAuditInput
): HistoricalRoutingCandidate | null {
    if (input.sourceType !== 'OPERATION_SPEND') return null
    if (input.ownerRoleAtTime !== 'USER') return null
    if (input.points <= 0) return null

    const recipients = resolveOperationPointRecipients({
        operationUser: input.operationUser,
        managerOwnership: input.managerOwnership,
        agentAssignment: input.agentAssignment,
    })

    const stillLegitimateUserAward = recipients.some((recipient) => (
        recipient.ownerUserId === input.wrongOwnerUserId && recipient.ownerRole === 'USER'
    ))
    if (stillLegitimateUserAward) return null

    const expectedOwner = recipients.find((recipient) => recipient.ownerRole !== 'USER') ?? null
    const convertedRisk = isConverted(input)
    const reason = expectedOwner?.ownerRole === 'MANAGER'
        ? 'MANAGER_LINK'
        : expectedOwner?.ownerRole === 'ADMIN'
            ? 'ADMIN_CREATOR'
            : 'NO_VALID_OWNER'

    return {
        ledgerEntryId: input.ledgerEntryId,
        operationId: input.operationId,
        wrongOwnerUserId: input.wrongOwnerUserId,
        wrongOwnerUsername: input.wrongOwnerUsername ?? null,
        points: input.points,
        availableRisk: convertedRisk ? 0 : input.points,
        convertedRisk,
        expectedOwnerUserId: expectedOwner?.ownerUserId ?? null,
        expectedOwnerRole: expectedOwner?.ownerRole ?? null,
        reason,
        reviewRequired: convertedRisk || !expectedOwner,
    }
}
