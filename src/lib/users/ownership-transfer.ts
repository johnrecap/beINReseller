import type { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import {
    resolveAgentAssignmentMetadata,
    type SourceGroupResolutionMode,
} from '@/lib/agents/assignment-transfer'
import {
    buildOwnershipToken,
    lockOwnershipOwnerRows,
    lockOwnershipSubjectRow,
    type OwnershipEvidence,
} from '../../../shared/db/ownership-evidence-lock'
import { createHash } from 'node:crypto'

export type OwnershipTransferTargetType = 'ADMIN' | 'MANAGER' | 'AGENT'

type UserTransferState = {
    id: string
    role?: string | null
    isActive?: boolean | null
    deletedAt?: Date | string | null
}

type TargetOwnerTransferState = UserTransferState & {
    username?: string | null
    agentProfile?: {
        defaultSourceGroup?: string | null
        isActive?: boolean | null
    } | null
}

type ValidationFailureCode = 'INVALID_TARGET_USER' | 'INVALID_TARGET_OWNER'

export type OwnershipTransferValidationResult =
    | { ok: true }
    | { ok: false; code: ValidationFailureCode; status: 400 }

export type OwnershipTransferPlan = {
    userId: string
    targetOwnerType: OwnershipTransferTargetType
    targetOwnerId: string
    managerUserIdsToRemove: string[]
    activeAssignmentIdsToClose: string[]
    requiresAgentAssignmentCreate: boolean
    requiresManagerLinkCreate: boolean
    replacedOwnership: boolean
}

export type OwnershipTransferPreconditionError = {
    ok: false
    code:
        | 'OWNERSHIP_PRECONDITION_REQUIRED'
        | 'OWNERSHIP_CHANGED'
        | 'SOURCE_GROUP_TOO_LONG'
        | 'INVALID_WHATSAPP_GROUP_URL'
        | 'OWNERSHIP_EXISTS'
        | 'OWNERSHIP_CONFLICT'
        | 'ASSIGNMENT_NOT_FOUND'
    status: 400 | 404 | 409 | 428
    currentOwnershipToken?: string
    currentOwnershipSummary?: SafeCurrentOwnershipSummary
}

export type SafeCurrentOwnershipSummary = {
    managerOwnerIds: string[]
    agentOwnerIds: string[]
    managerLinkCount: number
    activeAssignmentCount: number
}

export type ConcurrentOwnershipTransferPlan = OwnershipTransferPlan & {
    mode: 'CREATED' | 'REPLACED' | 'UPDATED' | 'NO_OP'
    sourceGroup: string | null
    whatsappGroupUrl: string | null
    sourceGroupResolution: SourceGroupResolutionMode
    whatsappGroupUrlResolution: 'EXPLICIT' | 'CLEARED' | 'PRESERVED' | 'NONE'
    activeAssignmentIdToUpdate: string | null
    auditLogId?: null
}

export type OwnershipTransferResult = {
    userId: string
    newOwnerType: OwnershipTransferTargetType
    newOwnerId: string
    newOwnerLabel: string
    managerUserIdsRemoved: string[]
    activeAssignmentIdsClosed: string[]
    managerLinkId: string | null
    agentAssignment: {
        id: string
        sourceGroup: string | null
        whatsappGroupUrl: string | null
    } | null
    auditLogId: string | null
    ownershipToken: string
    mode: 'CREATED' | 'REPLACED' | 'UPDATED' | 'NO_OP'
    sourceGroupResolution: SourceGroupResolutionMode
    whatsappGroupUrlResolution: 'EXPLICIT' | 'CLEARED' | 'PRESERVED' | 'NONE'
    previousManagerOwnerIds: string[]
    previousAgentAssignmentIds: string[]
}

type TransferDbClient = Prisma.TransactionClient

function unique(values: Array<string | null | undefined>): string[] {
    return Array.from(new Set(values.filter(Boolean) as string[]))
}

export function buildSafeCurrentOwnershipSummary(
    evidence: OwnershipEvidence,
): SafeCurrentOwnershipSummary {
    return {
        managerOwnerIds: unique(evidence.managerLinks.map((link) => link.managerId)).sort(),
        agentOwnerIds: unique(evidence.activeAssignments.map((assignment) => assignment.agentId)).sort(),
        managerLinkCount: evidence.managerLinks.length,
        activeAssignmentCount: evidence.activeAssignments.length,
    }
}

function isActiveAccount(account: UserTransferState | null | undefined): account is UserTransferState {
    return Boolean(account && account.isActive !== false && !account.deletedAt)
}

function clean(value: string | null | undefined): string | null {
    const trimmed = value?.trim()
    return trimmed ? trimmed : null
}

function hasOwn(input: object, field: string): boolean {
    return Object.prototype.hasOwnProperty.call(input, field)
}

function ownerLabel(owner: TargetOwnerTransferState): string {
    return owner.username?.trim() || owner.id
}

export function validateOwnershipTransferTargets(input: {
    user: UserTransferState | null | undefined
    targetOwner: TargetOwnerTransferState | null | undefined
    targetOwnerType: OwnershipTransferTargetType
}): OwnershipTransferValidationResult {
    if (!isActiveAccount(input.user) || input.user.role !== 'USER') {
        return { ok: false, code: 'INVALID_TARGET_USER', status: 400 }
    }

    if (!isActiveAccount(input.targetOwner) || input.targetOwner.role !== input.targetOwnerType) {
        return { ok: false, code: 'INVALID_TARGET_OWNER', status: 400 }
    }

    if (
        input.targetOwnerType === 'AGENT'
        && input.targetOwner.agentProfile?.isActive === false
    ) {
        return { ok: false, code: 'INVALID_TARGET_OWNER', status: 400 }
    }

    return { ok: true }
}

type OwnershipTransferPlanInput = {
    userId: string
    targetOwnerType: OwnershipTransferTargetType
    targetOwnerId: string
    managerUserIds?: string[]
    activeAssignments?: Array<{ id?: string | null; agentId?: string | null }>
}

type ConcurrentOwnershipTransferPlanInput = {
    userId: string
    targetOwnerType: OwnershipTransferTargetType
    targetOwnerId: string
    managerUserIds?: string[]
    managerLinks?: Array<{ id: string; managerId: string }>
    activeAssignments?: Array<{
        id: string
        agentId: string
        sourceGroup: string | null
        whatsappGroupUrl: string | null
    }>
    sourceGroup?: string | null
    whatsappGroupUrl?: string | null
    agentDefaultSourceGroup?: string | null
    expectedOwnershipToken?: string
    currentOwnershipToken: string
}

function buildLegacyOwnershipTransferPlan(input: OwnershipTransferPlanInput): OwnershipTransferPlan {
    const managerUserIdsToRemove = unique(input.managerUserIds || [])
    const activeAssignmentIdsToClose = unique((input.activeAssignments || []).map((assignment) => assignment.id))

    return {
        userId: input.userId,
        targetOwnerType: input.targetOwnerType,
        targetOwnerId: input.targetOwnerId,
        managerUserIdsToRemove,
        activeAssignmentIdsToClose,
        requiresAgentAssignmentCreate: input.targetOwnerType === 'AGENT',
        requiresManagerLinkCreate: input.targetOwnerType === 'ADMIN' || input.targetOwnerType === 'MANAGER',
        replacedOwnership: managerUserIdsToRemove.length > 0 || activeAssignmentIdsToClose.length > 0,
    }
}

type ConcurrentAgentAssignment = NonNullable<ConcurrentOwnershipTransferPlanInput['activeAssignments']>[number]

type ResolvedAgentMetadata = {
    sourceGroup: string | null
    whatsappGroupUrl: string | null
    sourceGroupResolution: SourceGroupResolutionMode
    whatsappGroupUrlResolution: 'EXPLICIT' | 'CLEARED' | 'PRESERVED' | 'NONE'
}

function currentAgentAssignmentForPlan(
    input: ConcurrentOwnershipTransferPlanInput,
    managerUserIdsToRemove: string[],
): ConcurrentAgentAssignment | null {
    const activeAssignments = input.activeAssignments || []
    return input.targetOwnerType === 'AGENT'
        && managerUserIdsToRemove.length === 0
        && activeAssignments.length === 1
        && activeAssignments[0].agentId === input.targetOwnerId
        ? activeAssignments[0]
        : null
}

function resolveOwnershipPlanMetadata(
    input: ConcurrentOwnershipTransferPlanInput,
    currentAssignment: ConcurrentAgentAssignment | null,
) {
    return resolveAgentAssignmentMetadata({
        ...(hasOwn(input, 'sourceGroup') ? { sourceGroup: input.sourceGroup } : {}),
        ...(hasOwn(input, 'whatsappGroupUrl') ? { whatsappGroupUrl: input.whatsappGroupUrl } : {}),
        agentDefaultSourceGroup: input.agentDefaultSourceGroup,
        currentAssignment,
    })
}

function noOpOwnershipPlan(
    input: ConcurrentOwnershipTransferPlanInput,
    metadata: ResolvedAgentMetadata,
): ConcurrentOwnershipTransferPlan {
    return {
        userId: input.userId,
        targetOwnerType: input.targetOwnerType,
        targetOwnerId: input.targetOwnerId,
        managerUserIdsToRemove: [],
        activeAssignmentIdsToClose: [],
        requiresAgentAssignmentCreate: false,
        requiresManagerLinkCreate: false,
        replacedOwnership: false,
        mode: 'NO_OP',
        ...metadata,
        activeAssignmentIdToUpdate: null,
        auditLogId: null,
    }
}

function updatedOwnershipPlan(
    input: ConcurrentOwnershipTransferPlanInput,
    metadata: ResolvedAgentMetadata,
    assignmentId: string,
): ConcurrentOwnershipTransferPlan {
    return {
        userId: input.userId,
        targetOwnerType: input.targetOwnerType,
        targetOwnerId: input.targetOwnerId,
        managerUserIdsToRemove: [],
        activeAssignmentIdsToClose: [],
        requiresAgentAssignmentCreate: false,
        requiresManagerLinkCreate: false,
        replacedOwnership: false,
        mode: 'UPDATED',
        ...metadata,
        activeAssignmentIdToUpdate: assignmentId,
    }
}

function buildConcurrentOwnershipTransferPlan(
    input: ConcurrentOwnershipTransferPlanInput,
): ConcurrentOwnershipTransferPlan | OwnershipTransferPreconditionError {
    if (!input.expectedOwnershipToken) {
        return { ok: false, code: 'OWNERSHIP_PRECONDITION_REQUIRED', status: 428 }
    }

    const managerUserIdsToRemove = unique(input.managerUserIds || [])
    const managerLinks = input.managerLinks || []
    const currentAssignment = currentAgentAssignmentForPlan(input, managerUserIdsToRemove)
    const metadata = resolveOwnershipPlanMetadata(input, currentAssignment)
    if ('ok' in metadata) return metadata
    const exactDesiredState = Boolean(
        currentAssignment
        && metadata.sourceGroup === clean(currentAssignment.sourceGroup)
        && metadata.whatsappGroupUrl === clean(currentAssignment.whatsappGroupUrl),
    ) || Boolean(
        input.targetOwnerType !== 'AGENT'
        && (input.activeAssignments || []).length === 0
        && managerLinks.length === 1
        && managerLinks[0].managerId === input.targetOwnerId
    )

    if (exactDesiredState) {
        return noOpOwnershipPlan(input, metadata)
    }

    if (input.expectedOwnershipToken !== input.currentOwnershipToken) {
        return { ok: false, code: 'OWNERSHIP_CHANGED', status: 409 }
    }

    if (currentAssignment) {
        return updatedOwnershipPlan(input, metadata, currentAssignment.id)
    }

    const legacyPlan = buildLegacyOwnershipTransferPlan(input)
    return {
        ...legacyPlan,
        mode: legacyPlan.replacedOwnership ? 'REPLACED' : 'CREATED',
        sourceGroup: input.targetOwnerType === 'AGENT' ? metadata.sourceGroup : null,
        whatsappGroupUrl: input.targetOwnerType === 'AGENT' ? metadata.whatsappGroupUrl : null,
        sourceGroupResolution: input.targetOwnerType === 'AGENT' ? metadata.sourceGroupResolution : 'NONE',
        whatsappGroupUrlResolution: input.targetOwnerType === 'AGENT'
            ? metadata.whatsappGroupUrlResolution
            : 'NONE',
        activeAssignmentIdToUpdate: null,
    }
}

export function buildOwnershipTransferPlan(
    input: ConcurrentOwnershipTransferPlanInput,
): ConcurrentOwnershipTransferPlan | OwnershipTransferPreconditionError
export function buildOwnershipTransferPlan(input: OwnershipTransferPlanInput): OwnershipTransferPlan
export function buildOwnershipTransferPlan(
    input: OwnershipTransferPlanInput | ConcurrentOwnershipTransferPlanInput,
): OwnershipTransferPlan | ConcurrentOwnershipTransferPlan | OwnershipTransferPreconditionError {
    if (hasOwn(input, 'currentOwnershipToken')) {
        return buildConcurrentOwnershipTransferPlan(input as ConcurrentOwnershipTransferPlanInput)
    }

    return buildLegacyOwnershipTransferPlan(input)
}

export function getOwnershipTransferErrorResponse(
    error: unknown
): OwnershipTransferValidationResult | OwnershipTransferPreconditionError | null {
    if (
        error
        && typeof error === 'object'
        && 'ok' in error
        && 'code' in error
        && 'status' in error
    ) {
        return error as OwnershipTransferValidationResult | OwnershipTransferPreconditionError
    }

    return null
}

type OwnershipTransferFailure =
    | Exclude<OwnershipTransferValidationResult, { ok: true }>
    | OwnershipTransferPreconditionError

export function buildOwnershipTransferErrorPayload(error: OwnershipTransferFailure) {
    const currentOwnershipToken = 'currentOwnershipToken' in error
        ? error.currentOwnershipToken
        : undefined
    const currentOwnershipSummary = 'currentOwnershipSummary' in error
        ? error.currentOwnershipSummary
        : undefined
    return {
        error: error.code,
        ...(currentOwnershipToken
            ? { currentOwnershipToken }
            : {}),
        ...(currentOwnershipSummary
            ? { currentOwnershipSummary }
            : {}),
    }
}

const OWNERSHIP_EVIDENCE_SELECT = {
    managerLinks: {
        select: { id: true, managerId: true },
        orderBy: { createdAt: 'asc' as const },
    },
    activeAssignments: {
        where: { isActive: true },
        select: {
            id: true,
            agentId: true,
            sourceGroup: true,
            whatsappGroupUrl: true,
            updatedAt: true,
        },
        orderBy: { createdAt: 'asc' as const },
    },
}

type CurrentOwnershipEvidence = OwnershipEvidence & {
    managerLinks: Array<{ id: string; managerId: string }>
    activeAssignments: Array<{
        id: string
        agentId: string
        sourceGroup: string | null
        whatsappGroupUrl: string | null
        updatedAt: Date
    }>
}

async function readOwnershipEvidence(
    db: TransferDbClient,
    userId: string
): Promise<CurrentOwnershipEvidence> {
    const [managerLinks, activeAssignments] = await Promise.all([
        db.managerUser.findMany({
            where: { userId },
            ...OWNERSHIP_EVIDENCE_SELECT.managerLinks,
        }),
        db.agentAssignment.findMany({
            where: { userId, isActive: true },
            select: OWNERSHIP_EVIDENCE_SELECT.activeAssignments.select,
            orderBy: OWNERSHIP_EVIDENCE_SELECT.activeAssignments.orderBy,
        }),
    ])
    return { managerLinks, activeAssignments }
}

function throwTransferError(error: OwnershipTransferValidationResult | OwnershipTransferPreconditionError): never {
    if (error.ok) throw new Error('EXPECTED_TRANSFER_ERROR')
    throw Object.assign(new Error(error.code), error)
}

function whatsappAuditEvidence(
    value: string | null,
    resolution: 'EXPLICIT' | 'CLEARED' | 'PRESERVED' | 'NONE'
) {
    return {
        resolution,
        state: value ? 'CONFIGURED' : 'NONE',
        digest: value
            ? createHash('sha256').update(value).digest('base64url')
            : null,
    }
}

function ownershipStateError(
    code: 'OWNERSHIP_CHANGED' | 'OWNERSHIP_EXISTS' | 'OWNERSHIP_CONFLICT',
    currentOwnershipToken: string,
    evidence: OwnershipEvidence,
): OwnershipTransferPreconditionError {
    return {
        ok: false,
        code,
        status: 409,
        currentOwnershipToken,
        currentOwnershipSummary: buildSafeCurrentOwnershipSummary(evidence),
    }
}

export function mapOwnershipMutationError(
    error: unknown,
    currentOwnershipToken: string,
    evidence: OwnershipEvidence,
): OwnershipTransferPreconditionError | null {
    if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'P2002') {
        return null
    }

    return ownershipStateError('OWNERSHIP_CONFLICT', currentOwnershipToken, evidence)
}

async function executeOwnershipWrite<T>(
    write: () => Promise<T>,
    currentOwnershipToken: string,
    evidence: OwnershipEvidence,
): Promise<T> {
    try {
        return await write()
    } catch (error) {
        const conflict = mapOwnershipMutationError(error, currentOwnershipToken, evidence)
        if (conflict) throwTransferError(conflict)
        throw error
    }
}

export async function transferUserOwnershipInTransaction(input: {
    userId: string
    targetOwnerType: OwnershipTransferTargetType
    targetOwnerId: string
    sourceGroup?: string | null
    whatsappGroupUrl?: string | null
    expectedOwnershipToken?: string
    adminUserId: string
    reason?: string | null
    ipAddress?: string | null
    userAgent?: string | null
    replaceExisting?: boolean
    trustedInitialAssignment?: boolean
}, db: TransferDbClient): Promise<OwnershipTransferResult> {
    if (!input.trustedInitialAssignment && !input.expectedOwnershipToken) {
        throwTransferError({
            ok: false,
            code: 'OWNERSHIP_PRECONDITION_REQUIRED',
            status: 428,
        })
    }

    const subjectExists = await lockOwnershipSubjectRow(db, input.userId)
    if (!subjectExists) {
        throwTransferError({ ok: false, code: 'INVALID_TARGET_USER', status: 400 })
    }

    const initialEvidence = await readOwnershipEvidence(db, input.userId)
    await lockOwnershipOwnerRows(db, {
        subjectUserId: input.userId,
        ownerUserIds: [
            input.targetOwnerId,
            ...initialEvidence.managerLinks.map((link) => link.managerId),
            ...initialEvidence.activeAssignments.map((assignment) => assignment.agentId),
        ],
    })

    const [user, targetOwner, evidence] = await Promise.all([
        db.user.findUnique({
            where: { id: input.userId },
            select: { id: true, role: true, isActive: true, deletedAt: true },
        }),
        db.user.findUnique({
            where: { id: input.targetOwnerId },
            select: {
                id: true,
                username: true,
                role: true,
                isActive: true,
                deletedAt: true,
                agentProfile: {
                    select: { defaultSourceGroup: true, isActive: true },
                },
            },
        }),
        readOwnershipEvidence(db, input.userId),
    ])

    const validation = validateOwnershipTransferTargets({
        user,
        targetOwner,
        targetOwnerType: input.targetOwnerType,
    })
    if (!validation.ok) throwTransferError(validation)
    const target = targetOwner as TargetOwnerTransferState

    const currentOwnershipToken = buildOwnershipToken(evidence)
    const hasExistingOwnership = evidence.managerLinks.length > 0
        || evidence.activeAssignments.length > 0
    if (hasExistingOwnership && input.replaceExisting === false) {
        throwTransferError(ownershipStateError('OWNERSHIP_EXISTS', currentOwnershipToken, evidence))
    }
    if (input.trustedInitialAssignment && hasExistingOwnership) {
        throwTransferError(ownershipStateError('OWNERSHIP_CONFLICT', currentOwnershipToken, evidence))
    }

    const transferPlan = buildOwnershipTransferPlan({
        userId: input.userId,
        targetOwnerType: input.targetOwnerType,
        targetOwnerId: input.targetOwnerId,
        managerUserIds: evidence.managerLinks.map((link) => link.id),
        managerLinks: evidence.managerLinks,
        activeAssignments: evidence.activeAssignments,
        agentDefaultSourceGroup: target.agentProfile?.defaultSourceGroup ?? null,
        ...(hasOwn(input, 'sourceGroup') ? { sourceGroup: input.sourceGroup } : {}),
        ...(hasOwn(input, 'whatsappGroupUrl') ? { whatsappGroupUrl: input.whatsappGroupUrl } : {}),
        expectedOwnershipToken: input.trustedInitialAssignment
            ? currentOwnershipToken
            : input.expectedOwnershipToken,
        currentOwnershipToken,
    })
    if ('ok' in transferPlan) {
        if (transferPlan.code === 'OWNERSHIP_CHANGED') {
            throwTransferError(ownershipStateError('OWNERSHIP_CHANGED', currentOwnershipToken, evidence))
        }
        throwTransferError(transferPlan)
    }

    let managerLinkId: string | null = null
    let agentAssignment: OwnershipTransferResult['agentAssignment'] = null
    let auditLogId: string | null = null

    if (transferPlan.mode === 'NO_OP') {
        managerLinkId = evidence.managerLinks.find(
            (link) => link.managerId === input.targetOwnerId
        )?.id || null
        const existingAssignment = evidence.activeAssignments.find(
            (assignment) => assignment.agentId === input.targetOwnerId
        )
        agentAssignment = existingAssignment ? {
            id: existingAssignment.id,
            sourceGroup: existingAssignment.sourceGroup,
            whatsappGroupUrl: existingAssignment.whatsappGroupUrl || null,
        } : null
    } else if (transferPlan.mode === 'UPDATED' && transferPlan.activeAssignmentIdToUpdate) {
        const assignmentId = transferPlan.activeAssignmentIdToUpdate
        agentAssignment = await executeOwnershipWrite(() => db.agentAssignment.update({
            where: { id: assignmentId },
            data: {
                sourceGroup: transferPlan.sourceGroup,
                whatsappGroupUrl: transferPlan.whatsappGroupUrl,
            },
            select: { id: true, sourceGroup: true, whatsappGroupUrl: true },
        }), currentOwnershipToken, evidence)
    } else {
        const now = new Date()
        if (transferPlan.activeAssignmentIdsToClose.length > 0) {
            await db.agentAssignment.updateMany({
                where: {
                    id: { in: transferPlan.activeAssignmentIdsToClose },
                    userId: input.userId,
                    isActive: true,
                },
                data: { isActive: false, endedAt: now },
            })
        }
        if (transferPlan.managerUserIdsToRemove.length > 0) {
            await db.managerUser.deleteMany({
                where: {
                    id: { in: transferPlan.managerUserIdsToRemove },
                    userId: input.userId,
                },
            })
        }

        if (input.targetOwnerType === 'AGENT') {
            agentAssignment = await executeOwnershipWrite(() => db.agentAssignment.create({
                data: {
                    userId: input.userId,
                    agentId: input.targetOwnerId,
                    sourceGroup: transferPlan.sourceGroup,
                    whatsappGroupUrl: transferPlan.whatsappGroupUrl,
                    assignedByAdminId: input.adminUserId,
                },
                select: { id: true, sourceGroup: true, whatsappGroupUrl: true },
            }), currentOwnershipToken, evidence)
        } else {
            const created = await executeOwnershipWrite(() => db.managerUser.create({
                data: { userId: input.userId, managerId: input.targetOwnerId },
                select: { id: true },
            }), currentOwnershipToken, evidence)
            managerLinkId = created.id
        }
    }

    if (transferPlan.mode !== 'NO_OP') {
        const previousOwners = buildSafeCurrentOwnershipSummary(evidence)
        const audit = await executeOwnershipWrite(() => db.activityLog.create({
            data: {
                userId: input.adminUserId,
                action: 'ADMIN_USER_OWNERSHIP_TRANSFERRED',
                targetId: input.userId,
                targetType: 'User',
                details: {
                    userId: input.userId,
                    targetOwnerType: input.targetOwnerType,
                    targetOwnerId: input.targetOwnerId,
                    targetOwnerLabel: ownerLabel(target),
                    managerUserIdsRemoved: transferPlan.managerUserIdsToRemove,
                    activeAssignmentIdsClosed: transferPlan.activeAssignmentIdsToClose,
                    previousManagerOwnerIds: previousOwners.managerOwnerIds,
                    previousAgentOwnerIds: previousOwners.agentOwnerIds,
                    managerLinkId,
                    agentAssignmentId: agentAssignment?.id || null,
                    sourceGroup: transferPlan.sourceGroup,
                    sourceGroupResolution: transferPlan.sourceGroupResolution,
                    whatsapp: whatsappAuditEvidence(
                        transferPlan.whatsappGroupUrl,
                        transferPlan.whatsappGroupUrlResolution,
                    ),
                    reason: clean(input.reason),
                    mode: transferPlan.mode,
                    replacedOwnership: transferPlan.replacedOwnership,
                },
                ipAddress: input.ipAddress || 'unknown',
                userAgent: input.userAgent || null,
            },
            select: { id: true },
        }), currentOwnershipToken, evidence)
        auditLogId = audit.id
    }

    const committedEvidence = transferPlan.mode === 'NO_OP'
        ? evidence
        : await readOwnershipEvidence(db, input.userId)

    return {
        userId: input.userId,
        newOwnerType: input.targetOwnerType,
        newOwnerId: input.targetOwnerId,
        newOwnerLabel: ownerLabel(target),
        managerUserIdsRemoved: transferPlan.managerUserIdsToRemove,
        activeAssignmentIdsClosed: transferPlan.activeAssignmentIdsToClose,
        managerLinkId,
        agentAssignment,
        auditLogId,
        ownershipToken: buildOwnershipToken(committedEvidence),
        mode: transferPlan.mode,
        sourceGroupResolution: transferPlan.sourceGroupResolution,
        whatsappGroupUrlResolution: transferPlan.whatsappGroupUrlResolution,
        previousManagerOwnerIds: evidence.managerLinks.map((link) => link.managerId),
        previousAgentAssignmentIds: evidence.activeAssignments.map((assignment) => assignment.id),
    }
}

export async function transferUserOwnership(input: {
    userId: string
    targetOwnerType: OwnershipTransferTargetType
    targetOwnerId: string
    sourceGroup?: string | null
    whatsappGroupUrl?: string | null
    expectedOwnershipToken: string
    adminUserId: string
    reason?: string | null
    ipAddress?: string | null
    userAgent?: string | null
    replaceExisting?: boolean
}): Promise<OwnershipTransferResult> {
    return prisma.$transaction((tx) => transferUserOwnershipInTransaction(input, tx))
}

export type EndAgentAssignmentResult = {
    assignmentId: string
    userId: string
    ownershipToken: string
    auditLogId: string | null
    mode: 'ENDED' | 'NO_OP'
}

export async function endAgentAssignmentInTransaction(input: {
    assignmentId: string
    expectedOwnershipToken: string
    adminUserId: string
    ipAddress?: string | null
    userAgent?: string | null
}, db: TransferDbClient): Promise<EndAgentAssignmentResult> {
    if (!input.expectedOwnershipToken) {
        throwTransferError({
            ok: false,
            code: 'OWNERSHIP_PRECONDITION_REQUIRED',
            status: 428,
        })
    }

    const preliminary = await db.agentAssignment.findUnique({
        where: { id: input.assignmentId },
        select: { id: true, userId: true },
    })
    if (!preliminary) {
        throwTransferError({ ok: false, code: 'ASSIGNMENT_NOT_FOUND', status: 404 })
    }
    if (!await lockOwnershipSubjectRow(db, preliminary.userId)) {
        throwTransferError({ ok: false, code: 'INVALID_TARGET_USER', status: 400 })
    }

    const initialEvidence = await readOwnershipEvidence(db, preliminary.userId)
    await lockOwnershipOwnerRows(db, {
        subjectUserId: preliminary.userId,
        ownerUserIds: [
            ...initialEvidence.managerLinks.map((link) => link.managerId),
            ...initialEvidence.activeAssignments.map((assignment) => assignment.agentId),
        ],
    })
    const evidence = await readOwnershipEvidence(db, preliminary.userId)
    const currentOwnershipToken = buildOwnershipToken(evidence)
    const currentAssignment = evidence.activeAssignments.find(
        (assignment) => assignment.id === input.assignmentId
    )

    if (!currentAssignment) {
        return {
            assignmentId: input.assignmentId,
            userId: preliminary.userId,
            ownershipToken: currentOwnershipToken,
            auditLogId: null,
            mode: 'NO_OP',
        }
    }
    if (input.expectedOwnershipToken !== currentOwnershipToken) {
        throwTransferError(ownershipStateError('OWNERSHIP_CHANGED', currentOwnershipToken, evidence))
    }

    await db.agentAssignment.update({
        where: { id: currentAssignment.id },
        data: { isActive: false, endedAt: new Date() },
    })
    const audit = await db.activityLog.create({
        data: {
            userId: input.adminUserId,
            action: 'ADMIN_AGENT_ASSIGNMENT_ENDED',
            targetId: currentAssignment.id,
            targetType: 'AgentAssignment',
            details: {
                userId: preliminary.userId,
                agentId: currentAssignment.agentId,
                sourceGroupResolution: 'NONE',
                whatsapp: { state: 'REMOVED_WITH_ASSIGNMENT' },
            },
            ipAddress: input.ipAddress || 'unknown',
            userAgent: input.userAgent || null,
        },
        select: { id: true },
    })
    const committedEvidence = await readOwnershipEvidence(db, preliminary.userId)

    return {
        assignmentId: currentAssignment.id,
        userId: preliminary.userId,
        ownershipToken: buildOwnershipToken(committedEvidence),
        auditLogId: audit.id,
        mode: 'ENDED',
    }
}

export async function endAgentAssignment(input: {
    assignmentId: string
    expectedOwnershipToken: string
    adminUserId: string
    ipAddress?: string | null
    userAgent?: string | null
}): Promise<EndAgentAssignmentResult> {
    return prisma.$transaction((tx) => endAgentAssignmentInTransaction(input, tx))
}
