export type AwardableRateKind = 'USER' | 'AGENT' | 'MANAGER' | 'MANAGER_OWNED_USER'
export type AwardableOwnerRole = 'USER' | 'AGENT' | 'MANAGER' | 'ADMIN'

export type AwardableUser = {
    id: string
    role: AwardableOwnerRole | string
    isActive: boolean
    deletedAt: Date | string | null
    createdBy?: AwardableUser | null
}

export type OperationPointRecipient = {
    ownerUserId: string
    ownerRole: AwardableOwnerRole
    ownerKind: AwardableRateKind
}

export type RatedOperationPointRecipient = OperationPointRecipient & {
    ratePerThousand: number
}

export type OperationSpendAwardEntry = {
    ownerUserId: string
    ownerRoleAtTime: AwardableOwnerRole
    sourceType: 'OPERATION_SPEND'
    sourceId: string
    points: number
    status: 'AVAILABLE'
    ratePerThousandSnapshot: number
    amountUsdSnapshot: number
    notes: string
}

export type OperationSpendEligibilityInput = {
    status: string
    type?: string
    amount: number
    completedAt: Date | null
    settings: {
        pointsEnabled: boolean
        pointsStartAt: Date | null
    }
}

export type OperationSpendSkippedReason =
    | 'POINTS_DISABLED'
    | 'MISSING_COMPLETED_AT'
    | 'NOT_COMPLETED'
    | 'NOT_SUBSCRIPTION_OPERATION'
    | 'NON_POSITIVE_AMOUNT'
    | 'BEFORE_POINTS_START'

export type OperationSpendEligibility =
    | { eligible: true }
    | {
        eligible: false
        reason: OperationSpendSkippedReason
    }

export type OperationSpendAwardPolicyInput = OperationSpendEligibilityInput & {
    operationUser: AwardableUser
    managerOwnership: { manager: AwardableUser } | null
    agentAssignment: { agent: AwardableUser } | null
    settings: OperationSpendEligibilityInput['settings'] & {
        managerOwnedUserPointsEnabled?: boolean
    }
}

export type OperationSpendAwardPolicy =
    | {
        eligible: true
        skippedReason: null
        recipients: OperationPointRecipient[]
    }
    | {
        eligible: false
        skippedReason: OperationSpendSkippedReason
        recipients: []
    }

function roundPoints(value: number): number {
    if (!Number.isFinite(value)) return 0
    return Math.round(value * 10000) / 10000
}

function isReceivableOwner(user: AwardableUser | null | undefined, role: AwardableOwnerRole): user is AwardableUser {
    return Boolean(user && user.role === role && user.isActive && !user.deletedAt)
}

function isReceivableOperationUser(user: AwardableUser | null | undefined): user is AwardableUser {
    return isReceivableOwner(user, 'USER')
}

export function resolveOperationPointRecipients(input: {
    operationUser: AwardableUser
    managerOwnership: { manager: AwardableUser } | null
    agentAssignment: { agent: AwardableUser } | null
    managerOwnedUserPointsEnabled?: boolean
}): OperationPointRecipient[] {
    if (!isReceivableOperationUser(input.operationUser)) return []

    if (isReceivableOwner(input.managerOwnership?.manager, 'MANAGER')) {
        const recipients: OperationPointRecipient[] = [{
            ownerUserId: input.managerOwnership.manager.id,
            ownerRole: 'MANAGER',
            ownerKind: 'MANAGER',
        }]

        if (input.managerOwnedUserPointsEnabled) {
            recipients.push({
                ownerUserId: input.operationUser.id,
                ownerRole: 'USER',
                ownerKind: 'MANAGER_OWNED_USER',
            })
        }

        return recipients
    }

    if (isReceivableOwner(input.managerOwnership?.manager, 'ADMIN')) {
        return [{
            ownerUserId: input.operationUser.id,
            ownerRole: 'USER',
            ownerKind: 'USER',
        }]
    }

    if (isReceivableOwner(input.agentAssignment?.agent, 'AGENT')) {
        return [
            {
                ownerUserId: input.operationUser.id,
                ownerRole: 'USER',
                ownerKind: 'USER',
            },
            {
                ownerUserId: input.agentAssignment.agent.id,
                ownerRole: 'AGENT',
                ownerKind: 'AGENT',
            },
        ]
    }

    if (isReceivableOwner(input.operationUser.createdBy, 'ADMIN')) {
        return [{
            ownerUserId: input.operationUser.id,
            ownerRole: 'USER',
            ownerKind: 'USER',
        }]
    }

    return []
}

export function getOperationSpendEligibility(input: OperationSpendEligibilityInput): OperationSpendEligibility {
    if (!input.settings.pointsEnabled) return { eligible: false, reason: 'POINTS_DISABLED' }
    if (input.status !== 'COMPLETED') return { eligible: false, reason: 'NOT_COMPLETED' }
    if (input.type && input.type !== 'RENEW') return { eligible: false, reason: 'NOT_SUBSCRIPTION_OPERATION' }
    if (input.amount <= 0) return { eligible: false, reason: 'NON_POSITIVE_AMOUNT' }
    if (!input.completedAt) return { eligible: false, reason: 'MISSING_COMPLETED_AT' }
    if (input.settings.pointsStartAt && input.completedAt < input.settings.pointsStartAt) {
        return { eligible: false, reason: 'BEFORE_POINTS_START' }
    }

    return { eligible: true }
}

export function resolveOperationSpendAwardPolicy(input: OperationSpendAwardPolicyInput): OperationSpendAwardPolicy {
    const eligibility = getOperationSpendEligibility(input)
    if (!eligibility.eligible) {
        return {
            eligible: false,
            skippedReason: eligibility.reason,
            recipients: [],
        }
    }

    return {
        eligible: true,
        skippedReason: null,
        recipients: resolveOperationPointRecipients({
            operationUser: input.operationUser,
            managerOwnership: input.managerOwnership,
            agentAssignment: input.agentAssignment,
            managerOwnedUserPointsEnabled: input.settings.managerOwnedUserPointsEnabled,
        }),
    }
}

export function buildOperationSpendAwardEntries(input: {
    operationId: string
    amountUsd: number
    recipients: RatedOperationPointRecipient[]
}): OperationSpendAwardEntry[] {
    return input.recipients.flatMap((recipient) => {
        const rate = Math.max(0, recipient.ratePerThousand)
        const amountUsd = Math.max(0, input.amountUsd)
        const points = roundPoints((amountUsd / 1000) * rate)
        if (points <= 0) return []

        return [{
            ownerUserId: recipient.ownerUserId,
            ownerRoleAtTime: recipient.ownerRole,
            sourceType: 'OPERATION_SPEND',
            sourceId: input.operationId,
            points,
            status: 'AVAILABLE',
            ratePerThousandSnapshot: rate,
            amountUsdSnapshot: amountUsd,
            notes: `Spend points for completed operation ${input.operationId}`,
        }]
    })
}
