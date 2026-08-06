import {
    Prisma,
    type OperationType,
    type PointRuleOwnerType,
    type Role,
} from '@prisma/client'
import {
    lockOperationRow,
    lockOwnershipOwnerRows,
    lockOwnershipSubjectRow,
} from '../db/ownership-evidence-lock'
import {
    buildOperationSpendAwardSnapshot,
    type OperationSpendAwardSnapshot,
    type OperationSpendOwnershipKind,
    type ResolvedOperationSpendRecipient,
} from './operation-spend-award-snapshot'
import { resolveOperationPointRecipients } from './operation-spend-policy'

const SNAPSHOT_POLICY_VERSION = 'operation-spend-v1'
const LEGACY_POLICY_VERSION = 'legacy-review-v1'
const LEGACY_COMPLETION_SOURCE = 'LEGACY_DETECTED'
const FINALIZATION_BACKOFF_BASE_MS = 5 * 60 * 1000
const FINALIZATION_BACKOFF_MAX_MS = 6 * 60 * 60 * 1000

export const OPERATION_SPEND_FINALIZATION_MAX_ATTEMPTS = 5
export const OPERATION_SPEND_FINALIZATION_ERROR_CODE = 'FINALIZATION_FAILED' as const
export const OPERATION_SPEND_FINALIZATION_EXHAUSTED_REASON = 'FINALIZATION_RETRIES_EXHAUSTED' as const

export type OperationSpendAwardRunStatus =
    | 'CAPTURED'
    | 'AWARDED'
    | 'SKIPPED'
    | 'LEGACY_REVIEW_REQUIRED'

export type OperationSpendAwardRunRecord = {
    id: string
    operationId: string
    policyVersion: string
    completionSource: string
    completedAtSnapshot: Date | null
    operationTypeSnapshot: OperationType
    amountUsdSnapshot: number
    operationUserIdSnapshot: string | null
    ownershipKindSnapshot: string | null
    ownershipOwnerIdSnapshot: string | null
    pointsEnabledSnapshot: boolean | null
    pointsStartAtSnapshot: Date | null
    managerOwnedUserPointsEnabledSnapshot: boolean | null
    ownershipEvidenceSnapshot: Prisma.JsonValue | null
    status: OperationSpendAwardRunStatus
    reasonCode: string | null
    recipientsSnapshot: Prisma.JsonValue | null
    ledgerEntryCount: number
    finalizationAttemptCount: number
    lastFinalizationAttemptAt: Date | null
    nextFinalizationAttemptAt: Date | null
    lastFinalizationErrorCode: string | null
    finalizedAt: Date | null
}

export type OperationSpendAwardRunCreateData = {
    operationId: string
    policyVersion: string
    completionSource: string
    completedAtSnapshot: Date | null
    operationTypeSnapshot: OperationType
    amountUsdSnapshot: number
    operationUserIdSnapshot: string | null
    ownershipKindSnapshot: string | null
    ownershipOwnerIdSnapshot: string | null
    pointsEnabledSnapshot: boolean | null
    pointsStartAtSnapshot: Date | null
    managerOwnedUserPointsEnabledSnapshot: boolean | null
    ownershipEvidenceSnapshot?: Prisma.InputJsonValue
    recipientsSnapshot?: Prisma.InputJsonValue
    status: OperationSpendAwardRunStatus
    reasonCode: string | null
}

export type OperationSpendAwardRunUpdateData = {
    status?: OperationSpendAwardRunStatus
    reasonCode?: string | null
    ledgerEntryCount?: number
    finalizationAttemptCount?: number
    lastFinalizationAttemptAt?: Date | null
    nextFinalizationAttemptAt?: Date | null
    lastFinalizationErrorCode?: string | null
    finalizedAt?: Date | null
}

export type OperationSpendLedgerCreateData = {
    ownerUserId: string
    ownerRoleAtTime: 'USER' | 'AGENT' | 'MANAGER'
    sourceType: 'OPERATION_SPEND'
    sourceId: string
    operationId: string
    operationSpendAwardRunId: string
    points: number
    status: 'AVAILABLE'
    ratePerThousandSnapshot: number
    amountUsdSnapshot: number
    notes: string
}

type CompletionOperationFindUniqueArgs = {
    where: { id: string }
    select: {
        id: true
        userId: true
        customerId: true
        status: true
        type: true
        amount: true
        completedAt: true
        user?: {
            select: {
                id: true
                role: true
                isActive: true
                deletedAt: true
                createdBy: {
                    select: { id: true; role: true; isActive: true; deletedAt: true }
                }
                managerLink: {
                    orderBy: Array<{ createdAt: 'desc' } | { id: 'desc' }>
                    select: {
                        id: true
                        managerId: true
                        manager: {
                            select: { id: true; role: true; isActive: true; deletedAt: true }
                        }
                    }
                }
                agentAssignmentAsUser: {
                    where: { isActive: true }
                    orderBy: Array<{ updatedAt: 'desc' } | { id: 'desc' }>
                    select: {
                        id: true
                        agentId: true
                        isActive: true
                        updatedAt: true
                        agent: {
                            select: { id: true; role: true; isActive: true; deletedAt: true }
                        }
                    }
                }
            }
        }
    }
}

type PointSettingsFindUniqueArgs = {
    where: { id: 'default' }
    select: {
        pointsEnabled: true
        pointsStartAt: true
        managerOwnedUserPointsEnabled: true
        operationSpendSnapshotCutoverAt: true
    }
}

type PointRulesFindManyArgs = {
    where: {
        isActive: true
        ownerType: { in: PointRuleOwnerType[] }
        OR: [{ ownerUserId: null }, { ownerUserId: { in: string[] } }]
    }
    orderBy: Array<{ updatedAt: 'desc' } | { id: 'desc' }>
    select: {
        id: true
        ownerType: true
        ownerUserId: true
        pointsPerThousand: true
        updatedAt: true
    }
}

type AwardRunFindUniqueArgs = { where: { operationId: string } }
type AwardRunUpdateManyArgs = {
    where: {
        id: string
        status: 'CAPTURED'
        finalizationAttemptCount: number
    }
    data: OperationSpendAwardRunUpdateData
}
type UnlinkedSpendEntryFindArgs = {
    where: {
        sourceType: 'OPERATION_SPEND'
        sourceId: string
        operationSpendAwardRunId: null
    }
    select: { id: true }
}
type LinkedSpendEntryCountArgs = { where: { operationSpendAwardRunId: string } }

export type AwardRunTransaction = {
    $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T>
    operation: {
        findUnique(args: CompletionOperationFindUniqueArgs): Promise<CompletionOperation | null>
    }
    pointProgramSettings: {
        findUnique(args: PointSettingsFindUniqueArgs): Promise<PointSettings | null>
    }
    pointRule: {
        findMany(args: PointRulesFindManyArgs): Promise<PointRuleSnapshot[]>
    }
    operationSpendAwardRun: {
        findUnique(args: AwardRunFindUniqueArgs): Promise<OperationSpendAwardRunRecord | null>
        create(args: { data: OperationSpendAwardRunCreateData }): Promise<OperationSpendAwardRunRecord>
        upsert(args: {
            where: { operationId: string }
            create: OperationSpendAwardRunCreateData
            update: OperationSpendAwardRunUpdateData
        }): Promise<OperationSpendAwardRunRecord>
        update(args: {
            where: { id: string }
            data: OperationSpendAwardRunUpdateData
        }): Promise<OperationSpendAwardRunRecord>
        updateMany(args: AwardRunUpdateManyArgs): Promise<{ count: number }>
    }
    pointLedgerEntry: {
        findFirst(args: UnlinkedSpendEntryFindArgs): Promise<{ id: string } | null>
        count(args: LinkedSpendEntryCountArgs): Promise<number>
        createMany(args: { data: OperationSpendLedgerCreateData[] }): Promise<{ count: number }>
    }
}

export type AwardRunDatabase = {
    $transaction<T>(work: (transaction: AwardRunTransaction) => Promise<T>): Promise<T>
}

type CompletionOwner = {
    id: string
    role: Role
    isActive: boolean
    deletedAt: Date | null
}

type ManagerOwnership = {
    id: string
    managerId: string
    manager: CompletionOwner
}

type AgentOwnership = {
    id: string
    agentId: string
    isActive: boolean
    updatedAt: Date
    agent: CompletionOwner
}

type CompletionUser = CompletionOwner & {
    createdBy: CompletionOwner | null
    managerLink: ManagerOwnership[]
    agentAssignmentAsUser: AgentOwnership[]
}

type CompletionOperation = {
    id: string
    userId: string | null
    customerId: string | null
    status: string
    type: OperationType
    amount: number
    completedAt: Date | null
    user: CompletionUser | null
}

type PointSettings = {
    pointsEnabled: boolean
    pointsStartAt: Date | null
    managerOwnedUserPointsEnabled: boolean
    operationSpendSnapshotCutoverAt: Date | null
}

type PointRuleSnapshot = {
    id: string
    ownerType: PointRuleOwnerType
    ownerUserId: string | null
    pointsPerThousand: number
    updatedAt: Date
}

export type OperationSpendCaptureOutcome = 'CREATED' | 'ALREADY_EXISTS' | 'CONFLICT'

export type OperationSpendCaptureResult = {
    operationId: string
    runId: string
    outcome: OperationSpendCaptureOutcome
    status: OperationSpendAwardRunStatus
    reasonCode: string | null
}

export type OperationSpendFinalizationOutcome =
    | 'AWARDED'
    | 'ALREADY_FINALIZED'
    | 'SKIPPED'
    | 'REVIEW_REQUIRED'
    | 'NOT_FOUND'

export type OperationSpendFinalizationResult = {
    operationId: string
    runId: string | null
    outcome: OperationSpendFinalizationOutcome
    ledgerEntryCount: number
    reasonCode: string | null
}

export type OperationSpendFinalizationFailureState = {
    finalizationAttemptCount: number
    lastFinalizationAttemptAt: Date
    nextFinalizationAttemptAt: Date | null
    lastFinalizationErrorCode: typeof OPERATION_SPEND_FINALIZATION_ERROR_CODE
    status: 'CAPTURED' | 'LEGACY_REVIEW_REQUIRED'
    reasonCode: null | typeof OPERATION_SPEND_FINALIZATION_EXHAUSTED_REASON
}

export function resolveOperationSpendFinalizationFailure(input: {
    currentAttemptCount: number
    attemptedAt: Date
}): OperationSpendFinalizationFailureState {
    const currentAttemptCount = Math.max(0, Math.trunc(input.currentAttemptCount))
    const finalizationAttemptCount = Math.min(
        currentAttemptCount + 1,
        OPERATION_SPEND_FINALIZATION_MAX_ATTEMPTS
    )
    const exhausted = finalizationAttemptCount >= OPERATION_SPEND_FINALIZATION_MAX_ATTEMPTS
    const backoffMs = Math.min(
        FINALIZATION_BACKOFF_BASE_MS * (2 ** (finalizationAttemptCount - 1)),
        FINALIZATION_BACKOFF_MAX_MS
    )
    return {
        finalizationAttemptCount,
        lastFinalizationAttemptAt: input.attemptedAt,
        nextFinalizationAttemptAt: exhausted
            ? null
            : new Date(input.attemptedAt.getTime() + backoffMs),
        lastFinalizationErrorCode: OPERATION_SPEND_FINALIZATION_ERROR_CODE,
        status: exhausted ? 'LEGACY_REVIEW_REQUIRED' : 'CAPTURED',
        reasonCode: exhausted ? OPERATION_SPEND_FINALIZATION_EXHAUSTED_REASON : null,
    }
}

export type OperationSpendAwardRunInvariantCode =
    | 'OPERATION_NOT_FOUND'
    | 'OPERATION_NOT_COMPLETED'
    | 'COMPLETION_TIMESTAMP_MISMATCH'
    | 'OPERATION_USER_NOT_FOUND'

export class OperationSpendAwardRunInvariantError extends Error {
    constructor(
        readonly code: OperationSpendAwardRunInvariantCode,
        readonly operationId: string
    ) {
        super(code)
        this.name = 'OperationSpendAwardRunInvariantError'
    }
}

function sameTimestamp(left: Date | null, right: Date): boolean {
    return left?.getTime() === right.getTime()
}

function activeOwner(owner: CompletionOwner | null | undefined, role: Role): owner is CompletionOwner {
    return Boolean(owner && owner.role === role && owner.isActive && !owner.deletedAt)
}

function selectedManagerOwnership(user: CompletionUser): ManagerOwnership | null {
    return user.managerLink.find((link) => (
        activeOwner(link.manager, 'MANAGER') || activeOwner(link.manager, 'ADMIN')
    )) ?? null
}

function selectedAgentOwnership(user: CompletionUser): AgentOwnership | null {
    return user.agentAssignmentAsUser.find((assignment) => (
        assignment.isActive && activeOwner(assignment.agent, 'AGENT')
    )) ?? null
}

function ownershipKind(input: {
    user: CompletionUser
    managerOwnership: ManagerOwnership | null
    agentOwnership: AgentOwnership | null
}): OperationSpendOwnershipKind {
    if (!activeOwner(input.user, 'USER')) return 'INVALID'
    if (input.managerOwnership?.manager.role === 'MANAGER') return 'MANAGER'
    if (input.managerOwnership?.manager.role === 'ADMIN') return 'ADMIN_DIRECT'
    if (input.agentOwnership) return 'AGENT'
    if (activeOwner(input.user.createdBy, 'ADMIN')) return 'LEGACY_ADMIN'
    return 'UNOWNED'
}

function ownershipOwnerId(input: {
    kind: OperationSpendOwnershipKind
    user: CompletionUser
    managerOwnership: ManagerOwnership | null
    agentOwnership: AgentOwnership | null
}): string | null {
    if (input.kind === 'MANAGER' || input.kind === 'ADMIN_DIRECT') {
        return input.managerOwnership?.manager.id ?? null
    }
    if (input.kind === 'AGENT') return input.agentOwnership?.agent.id ?? null
    if (input.kind === 'LEGACY_ADMIN') return input.user.createdBy?.id ?? null
    return null
}

function relevantOwnerIds(user: CompletionUser): string[] {
    return [
        ...user.managerLink.map((link) => link.managerId),
        ...user.agentAssignmentAsUser.map((assignment) => assignment.agentId),
        ...(user.createdBy ? [user.createdBy.id] : []),
    ]
}

function newestRule(
    rules: PointRuleSnapshot[],
    ownerType: PointRuleOwnerType,
    ownerUserId: string | null
): PointRuleSnapshot | null {
    return rules.find((rule) => (
        rule.ownerType === ownerType && rule.ownerUserId === ownerUserId
    )) ?? null
}

function recipientRateRule(
    recipient: { ownerKind: string; ownerUserId: string },
    rules: PointRuleSnapshot[]
): { bucket: PointRuleOwnerType; source: string; rule: PointRuleSnapshot | null } {
    if (recipient.ownerKind === 'USER') {
        return { bucket: 'USER_GLOBAL', source: 'DEFAULT', rule: newestRule(rules, 'USER_GLOBAL', null) }
    }
    if (recipient.ownerKind === 'MANAGER_OWNED_USER') {
        return {
            bucket: 'MANAGER_OWNED_USER_DEFAULT',
            source: 'DEFAULT',
            rule: newestRule(rules, 'MANAGER_OWNED_USER_DEFAULT', null),
        }
    }

    const ownerKind = recipient.ownerKind === 'AGENT' ? 'AGENT' : 'MANAGER'
    const overrideBucket = `${ownerKind}_OVERRIDE` as PointRuleOwnerType
    const defaultBucket = `${ownerKind}_DEFAULT` as PointRuleOwnerType
    const override = newestRule(rules, overrideBucket, recipient.ownerUserId)
    return override
        ? { bucket: overrideBucket, source: 'OWNER_OVERRIDE', rule: override }
        : { bucket: defaultBucket, source: 'DEFAULT', rule: newestRule(rules, defaultBucket, null) }
}

function resolvedRecipient(
    recipient: { ownerUserId: string; ownerRole: string; ownerKind: string },
    rules: PointRuleSnapshot[]
): ResolvedOperationSpendRecipient {
    const rateRule = recipientRateRule(recipient, rules)
    return {
        ...recipient,
        rateBucket: rateRule.bucket,
        rateSource: rateRule.source,
        ruleId: rateRule.rule?.id ?? null,
        ratePerThousand: Math.max(0, rateRule.rule?.pointsPerThousand ?? 0),
    }
}

async function operationWithOwnership(
    transaction: AwardRunTransaction,
    operationId: string
): Promise<CompletionOperation | null> {
    return transaction.operation.findUnique({
        where: { id: operationId },
        select: {
            id: true,
            userId: true,
            customerId: true,
            status: true,
            type: true,
            amount: true,
            completedAt: true,
            user: {
                select: {
                    id: true,
                    role: true,
                    isActive: true,
                    deletedAt: true,
                    createdBy: { select: { id: true, role: true, isActive: true, deletedAt: true } },
                    managerLink: {
                        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                        select: {
                            id: true,
                            managerId: true,
                            manager: { select: { id: true, role: true, isActive: true, deletedAt: true } },
                        },
                    },
                    agentAssignmentAsUser: {
                        where: { isActive: true },
                        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
                        select: {
                            id: true,
                            agentId: true,
                            isActive: true,
                            updatedAt: true,
                            agent: { select: { id: true, role: true, isActive: true, deletedAt: true } },
                        },
                    },
                },
            },
        },
    })
}

async function lockedCompletionOperation(
    transaction: AwardRunTransaction,
    operationId: string,
    completedAt: Date
): Promise<CompletionOperation> {
    if (!await lockOperationRow(transaction, operationId)) {
        throw new OperationSpendAwardRunInvariantError('OPERATION_NOT_FOUND', operationId)
    }
    const operation = await transaction.operation.findUnique({
        where: { id: operationId },
        select: {
            id: true,
            userId: true,
            customerId: true,
            status: true,
            type: true,
            amount: true,
            completedAt: true,
        },
    })
    if (!operation) throw new OperationSpendAwardRunInvariantError('OPERATION_NOT_FOUND', operationId)
    if (operation.status !== 'COMPLETED') {
        throw new OperationSpendAwardRunInvariantError('OPERATION_NOT_COMPLETED', operationId)
    }
    if (!sameTimestamp(operation.completedAt, completedAt)) {
        throw new OperationSpendAwardRunInvariantError('COMPLETION_TIMESTAMP_MISMATCH', operationId)
    }
    if (operation.userId === null) {
        if (operation.customerId === null) {
            throw new OperationSpendAwardRunInvariantError('OPERATION_USER_NOT_FOUND', operationId)
        }
        return { ...operation, user: null }
    }
    if (!await lockOwnershipSubjectRow(transaction, operation.userId)) {
        throw new OperationSpendAwardRunInvariantError('OPERATION_USER_NOT_FOUND', operationId)
    }

    const observedOperation = await operationWithOwnership(transaction, operationId)
    if (!observedOperation?.user) {
        throw new OperationSpendAwardRunInvariantError('OPERATION_USER_NOT_FOUND', operationId)
    }

    await lockOwnershipOwnerRows(transaction, {
        subjectUserId: observedOperation.user.id,
        ownerUserIds: relevantOwnerIds(observedOperation.user),
    })
    const lockedOperation = await operationWithOwnership(transaction, operationId)
    if (!lockedOperation?.user) {
        throw new OperationSpendAwardRunInvariantError('OPERATION_USER_NOT_FOUND', operationId)
    }
    return lockedOperation
}

async function pointSettings(transaction: AwardRunTransaction): Promise<PointSettings> {
    const settings = await transaction.pointProgramSettings.findUnique({
        where: { id: 'default' },
        select: {
            pointsEnabled: true,
            pointsStartAt: true,
            managerOwnedUserPointsEnabled: true,
            operationSpendSnapshotCutoverAt: true,
        },
    })
    return settings ?? {
        pointsEnabled: false,
        pointsStartAt: null,
        managerOwnedUserPointsEnabled: false,
        operationSpendSnapshotCutoverAt: null,
    }
}

async function pointRules(
    transaction: AwardRunTransaction,
    ownerUserIds: string[]
): Promise<PointRuleSnapshot[]> {
    return transaction.pointRule.findMany({
        where: {
            isActive: true,
            ownerType: {
                in: [
                    'USER_GLOBAL',
                    'MANAGER_OWNED_USER_DEFAULT',
                    'AGENT_DEFAULT',
                    'AGENT_OVERRIDE',
                    'MANAGER_DEFAULT',
                    'MANAGER_OVERRIDE',
                ],
            },
            OR: [
                { ownerUserId: null },
                { ownerUserId: { in: ownerUserIds } },
            ],
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        select: {
            id: true,
            ownerType: true,
            ownerUserId: true,
            pointsPerThousand: true,
            updatedAt: true,
        },
    })
}

function snapshotInput(input: {
    operation: CompletionOperation
    completionSource: string
    settings: PointSettings
    rules: PointRuleSnapshot[]
}): OperationSpendAwardSnapshot {
    const user = input.operation.user as CompletionUser
    const managerOwnership = selectedManagerOwnership(user)
    const agentOwnership = selectedAgentOwnership(user)
    const kind = ownershipKind({ user, managerOwnership, agentOwnership })
    const recipients = resolveOperationPointRecipients({
        operationUser: user,
        managerOwnership,
        agentAssignment: agentOwnership,
        managerOwnedUserPointsEnabled: input.settings.managerOwnedUserPointsEnabled,
    }).map((recipient) => resolvedRecipient(recipient, input.rules))

    return buildOperationSpendAwardSnapshot({
        policyVersion: SNAPSHOT_POLICY_VERSION,
        completionSource: input.completionSource,
        operation: {
            id: input.operation.id,
            status: input.operation.status,
            type: input.operation.type,
            amountUsd: input.operation.amount,
            completedAt: input.operation.completedAt,
            user,
        },
        ownership: {
            kind,
            ownerUserId: ownershipOwnerId({ kind, user, managerOwnership, agentOwnership }),
            managerOwnership,
            agentAssignment: agentOwnership,
            legacyCreator: user.createdBy,
        },
        settings: input.settings,
        resolvedRecipients: recipients,
    })
}

function runIdentityMatches(
    run: OperationSpendAwardRunRecord,
    operation: CompletionOperation,
    completionSource: string,
    completedAt: Date
): boolean {
    return run.operationId === operation.id
        && run.operationUserIdSnapshot === operation.userId
        && run.completedAtSnapshot?.getTime() === completedAt.getTime()
        && run.operationTypeSnapshot === operation.type
        && run.amountUsdSnapshot === operation.amount
        && run.completionSource === completionSource
}

function captureResult(
    run: OperationSpendAwardRunRecord,
    outcome: OperationSpendCaptureOutcome,
    reasonCode = run.reasonCode
): OperationSpendCaptureResult {
    return {
        operationId: run.operationId,
        runId: run.id,
        outcome,
        status: run.status,
        reasonCode,
    }
}

function snapshotCreateData(
    snapshot: OperationSpendAwardSnapshot,
    operationType: OperationType
): OperationSpendAwardRunCreateData {
    return {
        operationId: snapshot.operationId,
        policyVersion: snapshot.policyVersion,
        completionSource: snapshot.completionSource,
        completedAtSnapshot: snapshot.completedAtSnapshot ? new Date(snapshot.completedAtSnapshot) : null,
        operationTypeSnapshot: operationType,
        amountUsdSnapshot: snapshot.amountUsdSnapshot,
        operationUserIdSnapshot: snapshot.operationUserIdSnapshot,
        ownershipKindSnapshot: snapshot.ownershipKindSnapshot,
        ownershipOwnerIdSnapshot: snapshot.ownershipOwnerIdSnapshot,
        pointsEnabledSnapshot: snapshot.pointsEnabledSnapshot,
        pointsStartAtSnapshot: snapshot.pointsStartAtSnapshot ? new Date(snapshot.pointsStartAtSnapshot) : null,
        managerOwnedUserPointsEnabledSnapshot: snapshot.managerOwnedUserPointsEnabledSnapshot,
        ownershipEvidenceSnapshot: snapshot.ownershipEvidenceSnapshot as Prisma.InputJsonValue,
        recipientsSnapshot: snapshot.recipientsSnapshot as Prisma.InputJsonValue,
        status: snapshot.status,
        reasonCode: snapshot.reasonCode,
    }
}

function customerOperationSkipCreateData(
    operation: CompletionOperation,
    completionSource: string
): OperationSpendAwardRunCreateData {
    return {
        operationId: operation.id,
        policyVersion: SNAPSHOT_POLICY_VERSION,
        completionSource,
        completedAtSnapshot: operation.completedAt,
        operationTypeSnapshot: operation.type,
        amountUsdSnapshot: operation.amount,
        operationUserIdSnapshot: null,
        ownershipKindSnapshot: null,
        ownershipOwnerIdSnapshot: null,
        pointsEnabledSnapshot: null,
        pointsStartAtSnapshot: null,
        managerOwnedUserPointsEnabledSnapshot: null,
        status: 'SKIPPED',
        reasonCode: 'CUSTOMER_OPERATION_NOT_ELIGIBLE',
    }
}

async function lockPointProgramSettingsRow(transaction: AwardRunTransaction): Promise<void> {
    await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id"
        FROM "point_program_settings"
        WHERE "id" = 'default'
        FOR UPDATE
    `)
}

export async function captureOperationSpendAwardRunInTransaction(
    transaction: AwardRunTransaction,
    operationId: string,
    completionSource: string,
    completedAt: Date
): Promise<OperationSpendCaptureResult> {
    const operation = await lockedCompletionOperation(transaction, operationId, completedAt)
    const existingRun = await transaction.operationSpendAwardRun.findUnique({ where: { operationId } })
    if (existingRun) {
        return runIdentityMatches(existingRun, operation, completionSource, completedAt)
            ? captureResult(existingRun, 'ALREADY_EXISTS')
            : captureResult(existingRun, 'CONFLICT', 'AWARD_RUN_CONFLICT')
    }

    if (operation.userId === null) {
        const run = await transaction.operationSpendAwardRun.create({
            data: customerOperationSkipCreateData(operation, completionSource),
        })
        return captureResult(run, 'CREATED')
    }

    await lockPointProgramSettingsRow(transaction)
    const settings = await pointSettings(transaction)
    const rules = await pointRules(transaction, operation.user ? relevantOwnerIds(operation.user) : [])
    const snapshot = snapshotInput({ operation, completionSource, settings, rules })
    const run = await transaction.operationSpendAwardRun.create({
        data: snapshotCreateData(snapshot, operation.type),
    })
    return captureResult(run, 'CREATED')
}

async function lockAwardRun(transaction: AwardRunTransaction, runId: string): Promise<boolean> {
    const rows = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id"
        FROM "operation_spend_award_runs"
        WHERE "id" = ${runId}
        FOR UPDATE
    `)
    return rows.length === 1
}

async function persistFinalizationFailure(
    transaction: AwardRunTransaction,
    operationId: string,
    attemptedAt: Date
): Promise<OperationSpendFinalizationFailureState | null> {
    let run = await transaction.operationSpendAwardRun.findUnique({ where: { operationId } })
    if (!run || !await lockAwardRun(transaction, run.id)) return null

    run = await transaction.operationSpendAwardRun.findUnique({ where: { operationId } })
    if (!run || run.status !== 'CAPTURED') return null

    const failureState = resolveOperationSpendFinalizationFailure({
        currentAttemptCount: run.finalizationAttemptCount,
        attemptedAt,
    })
    const update = await transaction.operationSpendAwardRun.updateMany({
        where: {
            id: run.id,
            status: 'CAPTURED',
            finalizationAttemptCount: run.finalizationAttemptCount,
        },
        data: failureState,
    })
    return update.count === 1 ? failureState : null
}

function finalizationResult(input: {
    operationId: string
    runId: string | null
    outcome: OperationSpendFinalizationOutcome
    ledgerEntryCount?: number
    reasonCode?: string | null
}): OperationSpendFinalizationResult {
    return {
        operationId: input.operationId,
        runId: input.runId,
        outcome: input.outcome,
        ledgerEntryCount: input.ledgerEntryCount ?? 0,
        reasonCode: input.reasonCode ?? null,
    }
}

async function unlinkedSpendEntry(transaction: AwardRunTransaction, operationId: string) {
    return transaction.pointLedgerEntry.findFirst({
        where: {
            sourceType: 'OPERATION_SPEND',
            sourceId: operationId,
            operationSpendAwardRunId: null,
        },
        select: { id: true },
    })
}

function shouldCreatePostCutoverSentinel(
    operation: Pick<CompletionOperation, 'status' | 'completedAt'>,
    cutoverAt: Date | null
): boolean {
    return operation.status === 'COMPLETED'
        && operation.completedAt !== null
        && cutoverAt !== null
        && operation.completedAt >= cutoverAt
}

function sameNullableTimestamp(left: Date | null, right: Date | null): boolean {
    if (left === null || right === null) return left === right
    return left.getTime() === right.getTime()
}

function matchesReviewSentinelIdentity(
    run: OperationSpendAwardRunRecord,
    operation: CompletionOperation
): boolean {
    return run.operationId === operation.id
        && run.policyVersion === LEGACY_POLICY_VERSION
        && run.completionSource === LEGACY_COMPLETION_SOURCE
        && sameNullableTimestamp(run.completedAtSnapshot, operation.completedAt)
        && run.operationTypeSnapshot === operation.type
        && run.amountUsdSnapshot === operation.amount
        && run.operationUserIdSnapshot === operation.userId
        && run.status === 'LEGACY_REVIEW_REQUIRED'
        && run.ownershipKindSnapshot === null
        && run.ownershipOwnerIdSnapshot === null
        && run.pointsEnabledSnapshot === null
        && run.pointsStartAtSnapshot === null
        && run.managerOwnedUserPointsEnabledSnapshot === null
        && run.ownershipEvidenceSnapshot === null
        && run.recipientsSnapshot === null
}

async function createReviewSentinel(input: {
    transaction: AwardRunTransaction
    operation: CompletionOperation
    reasonCode: string
}): Promise<OperationSpendFinalizationResult> {
    const run = await input.transaction.operationSpendAwardRun.upsert({
        where: { operationId: input.operation.id },
        update: {},
        create: {
            operationId: input.operation.id,
            policyVersion: LEGACY_POLICY_VERSION,
            completionSource: LEGACY_COMPLETION_SOURCE,
            completedAtSnapshot: input.operation.completedAt,
            operationTypeSnapshot: input.operation.type,
            amountUsdSnapshot: input.operation.amount,
            operationUserIdSnapshot: input.operation.userId,
            ownershipKindSnapshot: null,
            ownershipOwnerIdSnapshot: null,
            pointsEnabledSnapshot: null,
            pointsStartAtSnapshot: null,
            managerOwnedUserPointsEnabledSnapshot: null,
            status: 'LEGACY_REVIEW_REQUIRED',
            reasonCode: input.reasonCode,
        },
    })
    if (!matchesReviewSentinelIdentity(run, input.operation)) {
        return markRunReviewRequired({
            transaction: input.transaction,
            run,
            reasonCode: 'AWARD_RUN_CONFLICT',
        })
    }
    return finalizationResult({
        operationId: input.operation.id,
        runId: run.id,
        outcome: 'REVIEW_REQUIRED',
        reasonCode: run.reasonCode,
    })
}

async function missingRunResult(
    transaction: AwardRunTransaction,
    operation: CompletionOperation
): Promise<OperationSpendFinalizationResult> {
    const [unlinkedEntry, settings] = await Promise.all([
        unlinkedSpendEntry(transaction, operation.id),
        pointSettings(transaction),
    ])
    if (unlinkedEntry) {
        return createReviewSentinel({
            transaction,
            operation,
            reasonCode: 'UNLINKED_OPERATION_SPEND_LEDGER',
        })
    }
    if (shouldCreatePostCutoverSentinel(operation, settings.operationSpendSnapshotCutoverAt)) {
        return createReviewSentinel({
            transaction,
            operation,
            reasonCode: 'POST_CUTOVER_MISSING_RUN',
        })
    }
    return finalizationResult({
        operationId: operation.id,
        runId: null,
        outcome: 'NOT_FOUND',
        reasonCode: 'PRE_CUTOVER_MISSING_RUN',
    })
}

type FinalizableRecipient = {
    ownerUserId: string
    ownerRole: 'USER' | 'AGENT' | 'MANAGER'
    ratePerThousand: number
    points: number
}

function finalizableRecipient(value: unknown): FinalizableRecipient | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const recipient = value as Record<string, unknown>
    const validRole = recipient.ownerRole === 'USER'
        || recipient.ownerRole === 'AGENT'
        || recipient.ownerRole === 'MANAGER'
    if (typeof recipient.ownerUserId !== 'string' || !validRole) return null
    if (typeof recipient.ratePerThousand !== 'number' || !Number.isFinite(recipient.ratePerThousand)) return null
    if (typeof recipient.points !== 'number' || !Number.isFinite(recipient.points) || recipient.points < 0) return null
    return {
        ownerUserId: recipient.ownerUserId,
        ownerRole: recipient.ownerRole as FinalizableRecipient['ownerRole'],
        ratePerThousand: recipient.ratePerThousand,
        points: recipient.points,
    }
}

function positiveRecipients(snapshot: Prisma.JsonValue | null): FinalizableRecipient[] | null {
    if (!Array.isArray(snapshot)) return null
    const recipients = snapshot.map(finalizableRecipient)
    if (recipients.some((recipient) => recipient === null)) return null
    const positive = recipients.filter((recipient): recipient is FinalizableRecipient => (
        recipient !== null && recipient.points > 0
    ))
    if (positive.length === 0) return null
    if (new Set(positive.map((recipient) => recipient.ownerUserId)).size !== positive.length) return null
    return positive
}

async function markRunReviewRequired(input: {
    transaction: AwardRunTransaction
    run: OperationSpendAwardRunRecord
    reasonCode: string
}): Promise<OperationSpendFinalizationResult> {
    const run = await input.transaction.operationSpendAwardRun.update({
        where: { id: input.run.id },
        data: {
            status: 'LEGACY_REVIEW_REQUIRED',
            reasonCode: input.reasonCode,
            nextFinalizationAttemptAt: null,
        },
    })
    return finalizationResult({
        operationId: run.operationId,
        runId: run.id,
        outcome: 'REVIEW_REQUIRED',
        ledgerEntryCount: run.ledgerEntryCount,
        reasonCode: run.reasonCode,
    })
}

function terminalRunResult(run: OperationSpendAwardRunRecord): OperationSpendFinalizationResult | null {
    if (run.status === 'AWARDED') {
        return finalizationResult({
            operationId: run.operationId,
            runId: run.id,
            outcome: 'ALREADY_FINALIZED',
            ledgerEntryCount: run.ledgerEntryCount,
            reasonCode: run.reasonCode,
        })
    }
    if (run.status === 'SKIPPED') {
        return finalizationResult({
            operationId: run.operationId,
            runId: run.id,
            outcome: 'SKIPPED',
            ledgerEntryCount: run.ledgerEntryCount,
            reasonCode: run.reasonCode,
        })
    }
    if (run.status === 'LEGACY_REVIEW_REQUIRED') {
        return finalizationResult({
            operationId: run.operationId,
            runId: run.id,
            outcome: 'REVIEW_REQUIRED',
            ledgerEntryCount: run.ledgerEntryCount,
            reasonCode: run.reasonCode,
        })
    }
    return null
}

async function finalizeCapturedRun(
    transaction: AwardRunTransaction,
    run: OperationSpendAwardRunRecord
): Promise<OperationSpendFinalizationResult> {
    if (await unlinkedSpendEntry(transaction, run.operationId)) {
        return markRunReviewRequired({
            transaction,
            run,
            reasonCode: 'UNLINKED_OPERATION_SPEND_LEDGER',
        })
    }
    const linkedEntryCount = await transaction.pointLedgerEntry.count({
        where: { operationSpendAwardRunId: run.id },
    })
    if (linkedEntryCount > 0) {
        return markRunReviewRequired({ transaction, run, reasonCode: 'PARTIAL_RUN_LEDGER_STATE' })
    }
    const recipients = positiveRecipients(run.recipientsSnapshot)
    if (!recipients) {
        return markRunReviewRequired({ transaction, run, reasonCode: 'INVALID_RECIPIENT_SNAPSHOT' })
    }

    await transaction.pointLedgerEntry.createMany({
        data: recipients.map((recipient) => ({
            ownerUserId: recipient.ownerUserId,
            ownerRoleAtTime: recipient.ownerRole,
            sourceType: 'OPERATION_SPEND',
            sourceId: run.operationId,
            operationId: run.operationId,
            operationSpendAwardRunId: run.id,
            points: recipient.points,
            status: 'AVAILABLE',
            ratePerThousandSnapshot: recipient.ratePerThousand,
            amountUsdSnapshot: run.amountUsdSnapshot,
            notes: `Spend points for completed operation ${run.operationId}`,
        })),
    })
    const awardedRun = await transaction.operationSpendAwardRun.update({
        where: { id: run.id },
        data: {
            status: 'AWARDED',
            ledgerEntryCount: recipients.length,
            nextFinalizationAttemptAt: null,
            finalizedAt: new Date(),
        },
    })
    return finalizationResult({
        operationId: awardedRun.operationId,
        runId: awardedRun.id,
        outcome: 'AWARDED',
        ledgerEntryCount: awardedRun.ledgerEntryCount,
        reasonCode: awardedRun.reasonCode,
    })
}

async function finalizeInTransaction(
    transaction: AwardRunTransaction,
    operationId: string
): Promise<OperationSpendFinalizationResult> {
    if (!await lockOperationRow(transaction, operationId)) {
        return finalizationResult({
            operationId,
            runId: null,
            outcome: 'NOT_FOUND',
            reasonCode: 'OPERATION_NOT_FOUND',
        })
    }
    const operation = await transaction.operation.findUnique({
        where: { id: operationId },
        select: {
            id: true,
            userId: true,
            customerId: true,
            status: true,
            type: true,
            amount: true,
            completedAt: true,
        },
    }) as CompletionOperation | null
    if (!operation) {
        return finalizationResult({
            operationId,
            runId: null,
            outcome: 'NOT_FOUND',
            reasonCode: 'OPERATION_NOT_FOUND',
        })
    }
    let run = await transaction.operationSpendAwardRun.findUnique({ where: { operationId } })
    if (!run) return missingRunResult(transaction, operation)
    if (!await lockAwardRun(transaction, run.id)) {
        return finalizationResult({ operationId, runId: null, outcome: 'NOT_FOUND' })
    }
    run = await transaction.operationSpendAwardRun.findUnique({ where: { operationId } })
    if (!run) return finalizationResult({ operationId, runId: null, outcome: 'NOT_FOUND' })
    return terminalRunResult(run) ?? finalizeCapturedRun(transaction, run)
}

export async function finalizeOperationSpendAwardRunInDatabase(
    operationId: string,
    database: AwardRunDatabase
): Promise<OperationSpendFinalizationResult> {
    try {
        return await database.$transaction((transaction) => finalizeInTransaction(transaction, operationId))
    } catch (finalizationError) {
        try {
            await database.$transaction((transaction) => (
                persistFinalizationFailure(transaction, operationId, new Date())
            ))
        } catch {
            // Preserve the primary finalization error when retry metadata cannot be persisted.
        }
        throw finalizationError
    }
}
