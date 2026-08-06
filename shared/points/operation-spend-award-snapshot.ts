export type OperationSpendRunStatus = 'CAPTURED' | 'SKIPPED'

export type OperationSpendSnapshotReason =
    | 'POINTS_DISABLED'
    | 'NOT_COMPLETED'
    | 'NOT_SUBSCRIPTION_OPERATION'
    | 'NON_POSITIVE_AMOUNT'
    | 'MISSING_COMPLETED_AT'
    | 'BEFORE_POINTS_START'
    | 'INVALID_OPERATION_USER'
    | 'UNOWNED'
    | 'INVALID_OWNER'
    | 'NO_POSITIVE_RECIPIENTS'

export type OperationSpendOwnershipKind =
    | 'ADMIN_DIRECT'
    | 'LEGACY_ADMIN'
    | 'AGENT'
    | 'MANAGER'
    | 'UNOWNED'
    | 'INVALID'

export type OperationSpendSnapshotUser = {
    id: string
    role: string
    isActive: boolean
    deletedAt: Date | string | null
    [field: string]: unknown
}

type ManagerOwnershipEvidence = {
    id?: string | null
    isActive?: boolean
    manager: OperationSpendSnapshotUser
    [field: string]: unknown
}

type AgentAssignmentEvidence = {
    id: string
    isActive: boolean
    agent: OperationSpendSnapshotUser
    [field: string]: unknown
}

export type ResolvedOperationSpendRecipient = {
    ownerUserId: string
    ownerRole: string
    ownerKind: string
    rateBucket: string
    rateSource: string
    ruleId: string | null
    ratePerThousand: number
}

export type OperationSpendAwardSnapshotInput = {
    policyVersion: string
    completionSource: string
    operation: {
        id: string
        status: string
        type: string | null
        amountUsd: number
        completedAt: Date | string | null
        user: OperationSpendSnapshotUser
    }
    ownership: {
        kind: OperationSpendOwnershipKind
        ownerUserId: string | null
        managerOwnership: ManagerOwnershipEvidence | null
        agentAssignment: AgentAssignmentEvidence | null
        legacyCreator: OperationSpendSnapshotUser | null
    }
    settings: {
        pointsEnabled: boolean
        pointsStartAt: Date | string | null
        managerOwnedUserPointsEnabled: boolean
    }
    resolvedRecipients: ResolvedOperationSpendRecipient[]
}

type SafeUserEvidence = {
    id: string
    role: string
    isActive: boolean
    deletedAt: string | null
}

export type OperationSpendRecipientSnapshot = Omit<ResolvedOperationSpendRecipient, 'ratePerThousand'> & {
    ratePerThousand: number
    points: number
    zeroReason: 'ZERO_RATE' | 'ZERO_POINTS_AFTER_ROUNDING' | null
}

export type OperationSpendAwardSnapshot = {
    operationId: string
    policyVersion: string
    completionSource: string
    completedAtSnapshot: string | null
    operationTypeSnapshot: string | null
    amountUsdSnapshot: number
    operationUserIdSnapshot: string
    ownershipKindSnapshot: OperationSpendOwnershipKind
    ownershipOwnerIdSnapshot: string | null
    pointsEnabledSnapshot: boolean
    pointsStartAtSnapshot: string | null
    managerOwnedUserPointsEnabledSnapshot: boolean
    ownershipEvidenceSnapshot: {
        operationUser: SafeUserEvidence
        managerOwnership: ReturnType<typeof safeManagerOwnership>
        agentAssignment: ReturnType<typeof safeAgentAssignment>
        legacyCreator: SafeUserEvidence | null
    }
    recipientsSnapshot: OperationSpendRecipientSnapshot[]
    status: OperationSpendRunStatus
    reasonCode: OperationSpendSnapshotReason | null
}

function timestampSnapshot(timestamp: Date | string | null): string | null {
    if (timestamp === null) return null
    const parsedTimestamp = timestamp instanceof Date ? timestamp : new Date(timestamp)
    return Number.isNaN(parsedTimestamp.getTime()) ? null : parsedTimestamp.toISOString()
}

function safeUserEvidence(user: OperationSpendSnapshotUser): SafeUserEvidence {
    return {
        id: user.id,
        role: user.role,
        isActive: user.isActive,
        deletedAt: timestampSnapshot(user.deletedAt),
    }
}

function safeManagerOwnership(ownership: ManagerOwnershipEvidence | null) {
    if (!ownership) return null
    return {
        ...(ownership.id !== undefined ? { id: ownership.id } : {}),
        ...(ownership.isActive !== undefined ? { isActive: ownership.isActive } : {}),
        manager: safeUserEvidence(ownership.manager),
    }
}

function safeAgentAssignment(assignment: AgentAssignmentEvidence | null) {
    if (!assignment) return null
    return {
        id: assignment.id,
        isActive: assignment.isActive,
        agent: safeUserEvidence(assignment.agent),
    }
}

function roundedPoints(amountUsd: number, ratePerThousand: number): number {
    const rawPoints = (Math.max(0, amountUsd) / 1000) * Math.max(0, ratePerThousand)
    return Math.round(rawPoints * 10000) / 10000
}

function recipientSnapshot(
    recipient: ResolvedOperationSpendRecipient,
    amountUsd: number
): OperationSpendRecipientSnapshot {
    const ratePerThousand = Number.isFinite(recipient.ratePerThousand)
        ? Math.max(0, recipient.ratePerThousand)
        : 0
    const points = roundedPoints(amountUsd, ratePerThousand)
    const zeroReason = ratePerThousand === 0
        ? 'ZERO_RATE'
        : points === 0 ? 'ZERO_POINTS_AFTER_ROUNDING' : null

    return {
        ownerUserId: recipient.ownerUserId,
        ownerRole: recipient.ownerRole,
        ownerKind: recipient.ownerKind,
        rateBucket: recipient.rateBucket,
        rateSource: recipient.rateSource,
        ruleId: recipient.ruleId,
        ratePerThousand,
        points,
        zeroReason,
    }
}

function compareSnapshotText(left: string, right: string): number {
    if (left < right) return -1
    if (left > right) return 1
    return 0
}

function recipientOrder(
    left: OperationSpendRecipientSnapshot,
    right: OperationSpendRecipientSnapshot
): number {
    return compareSnapshotText(left.ownerUserId, right.ownerUserId)
        || compareSnapshotText(left.ownerKind, right.ownerKind)
        || compareSnapshotText(left.rateBucket, right.rateBucket)
}

function completionSkipReason(
    input: OperationSpendAwardSnapshotInput,
    completedAtSnapshot: string | null,
    pointsStartAtSnapshot: string | null
): OperationSpendSnapshotReason | null {
    if (!input.settings.pointsEnabled) return 'POINTS_DISABLED'
    if (input.operation.status !== 'COMPLETED') return 'NOT_COMPLETED'
    if (input.operation.type !== 'RENEW') return 'NOT_SUBSCRIPTION_OPERATION'
    if (!Number.isFinite(input.operation.amountUsd) || input.operation.amountUsd <= 0) return 'NON_POSITIVE_AMOUNT'
    if (!completedAtSnapshot) return 'MISSING_COMPLETED_AT'
    if (pointsStartAtSnapshot && completedAtSnapshot < pointsStartAtSnapshot) return 'BEFORE_POINTS_START'
    if (input.operation.user.role !== 'USER' || !input.operation.user.isActive || input.operation.user.deletedAt) return 'INVALID_OPERATION_USER'
    if (input.ownership.kind === 'UNOWNED') return 'UNOWNED'
    if (input.ownership.kind === 'INVALID') return 'INVALID_OWNER'
    return null
}

export function buildOperationSpendAwardSnapshot(
    input: OperationSpendAwardSnapshotInput
): OperationSpendAwardSnapshot {
    const completedAtSnapshot = timestampSnapshot(input.operation.completedAt)
    const pointsStartAtSnapshot = timestampSnapshot(input.settings.pointsStartAt)
    const amountUsdSnapshot = Number.isFinite(input.operation.amountUsd) ? input.operation.amountUsd : 0
    const completionReason = completionSkipReason(input, completedAtSnapshot, pointsStartAtSnapshot)
    const recipientsSnapshot = completionReason === null
        ? input.resolvedRecipients
            .map((recipient) => recipientSnapshot(recipient, amountUsdSnapshot))
            .sort(recipientOrder)
        : []
    const reasonCode = completionReason
        ?? (recipientsSnapshot.some((recipient) => recipient.points > 0)
            ? null
            : 'NO_POSITIVE_RECIPIENTS')

    return {
        operationId: input.operation.id,
        policyVersion: input.policyVersion,
        completionSource: input.completionSource,
        completedAtSnapshot,
        operationTypeSnapshot: input.operation.type,
        amountUsdSnapshot,
        operationUserIdSnapshot: input.operation.user.id,
        ownershipKindSnapshot: input.ownership.kind,
        ownershipOwnerIdSnapshot: input.ownership.ownerUserId,
        pointsEnabledSnapshot: input.settings.pointsEnabled,
        pointsStartAtSnapshot,
        managerOwnedUserPointsEnabledSnapshot: input.settings.managerOwnedUserPointsEnabled,
        ownershipEvidenceSnapshot: {
            operationUser: safeUserEvidence(input.operation.user),
            managerOwnership: safeManagerOwnership(input.ownership.managerOwnership),
            agentAssignment: safeAgentAssignment(input.ownership.agentAssignment),
            legacyCreator: input.ownership.legacyCreator
                ? safeUserEvidence(input.ownership.legacyCreator)
                : null,
        },
        recipientsSnapshot,
        status: reasonCode === null ? 'CAPTURED' : 'SKIPPED',
        reasonCode,
    }
}
