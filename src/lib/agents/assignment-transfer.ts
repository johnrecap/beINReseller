import type { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import type { SafeCurrentOwnershipSummary } from '@/lib/users/ownership-transfer'
import { normalizeWhatsAppGroupInviteUrl } from '@/lib/whatsapp/group-invite-url'

export type AgentTransferErrorCode =
    | 'INVALID_TARGET_USER'
    | 'INVALID_TARGET_AGENT'
    | 'SOURCE_GROUP_TOO_LONG'
    | 'INVALID_WHATSAPP_GROUP_URL'
    | 'OWNERSHIP_EXISTS'
    | 'OWNERSHIP_PRECONDITION_REQUIRED'
    | 'OWNERSHIP_CHANGED'
    | 'OWNERSHIP_CONFLICT'
    | 'ASSIGNMENT_NOT_FOUND'

export type AgentTransferError = {
    ok: false
    code: AgentTransferErrorCode
    status: 400 | 404 | 409 | 428
    currentOwnershipToken?: string
    currentOwnershipSummary?: SafeCurrentOwnershipSummary
}

export type SourceGroupValidationError = {
    ok: false
    code: 'SOURCE_GROUP_TOO_LONG'
    status: 400
}

export type WhatsappGroupUrlValidationError = {
    ok: false
    code: 'INVALID_WHATSAPP_GROUP_URL'
    status: 400
}

export type TransferUserAccount = {
    id: string
    role: string
    isActive: boolean
    deletedAt: Date | string | null
}

export type TransferAgentAccount = {
    id: string
    role: string
    isActive: boolean
    deletedAt: Date | string | null
    agentProfile?: {
        defaultSourceGroup: string | null
        isActive: boolean
    } | null
}

export type ActiveAgentAssignment = {
    id: string
    agentId: string
    sourceGroup: string | null
    whatsappGroupUrl?: string | null
}

export type AgentTransferPlan = {
    mode: 'created' | 'transferred' | 'refreshed'
    userId: string
    agentId: string
    sourceGroup: string | null
    previousManagerOwnerIds: string[]
    previousAgentAssignmentIds: string[]
    replacedOwnership: boolean
}

export type SourceGroupResolutionMode =
    | 'EXPLICIT'
    | 'CLEARED'
    | 'PRESERVED'
    | 'AGENT_DEFAULT'
    | 'NONE'

export type NullableAgentTransferPlan = {
    mode: 'created' | 'transferred' | 'refreshed' | 'noop'
    userId: string
    agentId: string
    sourceGroup: string | null
    whatsappGroupUrl: string | null
    sourceGroupResolution: SourceGroupResolutionMode
    whatsappGroupUrlResolution: 'EXPLICIT' | 'CLEARED' | 'PRESERVED' | 'NONE'
    previousManagerOwnerIds: string[]
    previousAgentAssignmentIds: string[]
    activeAssignmentIdsToClose: string[]
    assignmentIdToUpdate: string | null
    requiresAssignmentCreate: boolean
    replacedOwnership: boolean
}

export type AgentTransferResult = {
    assignment: {
        id: string
        userId: string
        agentId: string
        sourceGroup: string | null
        whatsappGroupUrl: string | null
        createdAt: string
    }
    transfer: NullableAgentTransferPlan
}

type TransferDbClient = Prisma.TransactionClient

function cleanSourceGroup(value: string | null | undefined) {
    const trimmed = value?.trim()
    return trimmed ? trimmed : null
}

function cleanOptionalUrl(value: string | null | undefined) {
    const trimmed = value?.trim()
    return trimmed ? trimmed : null
}

function hasOwn(input: object, field: string): boolean {
    return Object.prototype.hasOwnProperty.call(input, field)
}

export function validateAgentTransferTargets(input: {
    user: TransferUserAccount | null
    agent: TransferAgentAccount | null
}): { ok: true } | AgentTransferError {
    if (!input.user || input.user.role !== 'USER' || !input.user.isActive || input.user.deletedAt) {
        return { ok: false, code: 'INVALID_TARGET_USER', status: 400 }
    }

    if (
        !input.agent ||
        input.agent.role !== 'AGENT' ||
        !input.agent.isActive ||
        input.agent.deletedAt ||
        input.agent.agentProfile?.isActive === false
    ) {
        return { ok: false, code: 'INVALID_TARGET_AGENT', status: 400 }
    }

    return { ok: true }
}

type LegacySourceGroupInput = {
    requestedSourceGroup?: string | null
    agentDefaultSourceGroup?: string | null
}

type NullableSourceGroupInput = LegacySourceGroupInput & {
    currentSourceGroup?: string | null
    isSameAgent: boolean
}

type NullableSourceGroupResolution =
    | { ok: true; sourceGroup: string | null; resolution: SourceGroupResolutionMode }
    | SourceGroupValidationError

function resolveLegacySourceGroup(
    input: LegacySourceGroupInput,
): NullableSourceGroupResolution {
    if (hasOwn(input, 'requestedSourceGroup')) {
        return resolveExplicitSourceGroup(input.requestedSourceGroup)
    }

    return resolveAgentDefaultSourceGroup(input.agentDefaultSourceGroup)
}

function resolveExplicitSourceGroup(requestedSourceGroup: string | null | undefined): NullableSourceGroupResolution {
    const explicit = cleanSourceGroup(requestedSourceGroup)
    if (explicit && explicit.length > 120) {
        return { ok: false, code: 'SOURCE_GROUP_TOO_LONG', status: 400 }
    }
    return explicit
        ? { ok: true, sourceGroup: explicit, resolution: 'EXPLICIT' }
        : { ok: true, sourceGroup: null, resolution: 'CLEARED' }
}

function resolveAgentDefaultSourceGroup(
    agentDefaultSourceGroup: string | null | undefined,
): NullableSourceGroupResolution {
    const fallback = cleanSourceGroup(agentDefaultSourceGroup)
    if (fallback && fallback.length > 120) {
        return { ok: false, code: 'SOURCE_GROUP_TOO_LONG', status: 400 }
    }
    return fallback
        ? { ok: true, sourceGroup: fallback, resolution: 'AGENT_DEFAULT' }
        : { ok: true, sourceGroup: null, resolution: 'NONE' }
}

function resolveNullableSourceGroup(input: NullableSourceGroupInput): NullableSourceGroupResolution {
    if (hasOwn(input, 'requestedSourceGroup')) {
        return resolveExplicitSourceGroup(input.requestedSourceGroup)
    }
    if (input.isSameAgent) {
        return {
            ok: true,
            sourceGroup: cleanSourceGroup(input.currentSourceGroup),
            resolution: 'PRESERVED',
        }
    }

    return resolveAgentDefaultSourceGroup(input.agentDefaultSourceGroup)
}

export function resolveAgentSourceGroup(input: NullableSourceGroupInput): NullableSourceGroupResolution
export function resolveAgentSourceGroup(
    input: LegacySourceGroupInput,
): NullableSourceGroupResolution
export function resolveAgentSourceGroup(
    input: LegacySourceGroupInput | NullableSourceGroupInput,
): NullableSourceGroupResolution {
    return 'isSameAgent' in input
        ? resolveNullableSourceGroup(input)
        : resolveLegacySourceGroup(input)
}

export function resolveAgentWhatsappGroupUrl(input: {
    requestedWhatsappGroupUrl?: string | null
    currentWhatsappGroupUrl?: string | null
    isSameAgent: boolean
}): {
    ok: true
    whatsappGroupUrl: string | null
    resolution: 'EXPLICIT' | 'CLEARED' | 'PRESERVED' | 'NONE'
} | WhatsappGroupUrlValidationError {
    if (hasOwn(input, 'requestedWhatsappGroupUrl')) {
        const explicit = cleanOptionalUrl(input.requestedWhatsappGroupUrl)
        if (!explicit) {
            return { ok: true, whatsappGroupUrl: null, resolution: 'CLEARED' }
        }
        const normalized = normalizeWhatsAppGroupInviteUrl(explicit)
        return normalized
            ? { ok: true, whatsappGroupUrl: normalized, resolution: 'EXPLICIT' }
            : { ok: false, code: 'INVALID_WHATSAPP_GROUP_URL', status: 400 }
    }

    if (input.isSameAgent) {
        return {
            ok: true,
            whatsappGroupUrl: cleanOptionalUrl(input.currentWhatsappGroupUrl),
            resolution: 'PRESERVED',
        }
    }

    return { ok: true, whatsappGroupUrl: null, resolution: 'NONE' }
}

type CurrentAssignmentMetadata = {
    sourceGroup: string | null
    whatsappGroupUrl?: string | null
}

export function resolveAgentAssignmentMetadata(input: {
    sourceGroup?: string | null
    whatsappGroupUrl?: string | null
    agentDefaultSourceGroup?: string | null
    currentAssignment: CurrentAssignmentMetadata | null
}): {
    sourceGroup: string | null
    whatsappGroupUrl: string | null
    sourceGroupResolution: SourceGroupResolutionMode
    whatsappGroupUrlResolution: 'EXPLICIT' | 'CLEARED' | 'PRESERVED' | 'NONE'
} | SourceGroupValidationError | WhatsappGroupUrlValidationError {
    const sourceRequest = hasOwn(input, 'sourceGroup')
        ? { requestedSourceGroup: input.sourceGroup }
        : {}
    const sourceGroup = resolveAgentSourceGroup({
        ...sourceRequest,
        currentSourceGroup: input.currentAssignment?.sourceGroup ?? null,
        agentDefaultSourceGroup: input.agentDefaultSourceGroup,
        isSameAgent: Boolean(input.currentAssignment),
    })
    if (!sourceGroup.ok) return sourceGroup

    const whatsappRequest = hasOwn(input, 'whatsappGroupUrl')
        ? { requestedWhatsappGroupUrl: input.whatsappGroupUrl }
        : {}
    const whatsapp = resolveAgentWhatsappGroupUrl({
        ...whatsappRequest,
        currentWhatsappGroupUrl: input.currentAssignment?.whatsappGroupUrl ?? null,
        isSameAgent: Boolean(input.currentAssignment),
    })
    if (!whatsapp.ok) return whatsapp
    return {
        sourceGroup: sourceGroup.sourceGroup,
        whatsappGroupUrl: whatsapp.whatsappGroupUrl,
        sourceGroupResolution: sourceGroup.resolution,
        whatsappGroupUrlResolution: whatsapp.resolution,
    }
}

type AgentTransferPlanInput = {
    userId: string
    targetAgentId: string
    sourceGroup: string
    managerOwnerIds: string[]
    activeAssignments: ActiveAgentAssignment[]
    replaceExisting: boolean
}

type NullableAgentTransferPlanInput = {
    userId: string
    targetAgentId: string
    sourceGroup?: string | null
    whatsappGroupUrl?: string | null
    agentDefaultSourceGroup?: string | null
    managerOwnerIds: string[]
    activeAssignments: Array<{
        id: string
        agentId: string
        sourceGroup: string | null
        whatsappGroupUrl?: string | null
    }>
    replaceExisting: boolean
}

function buildLegacyAgentTransferPlan(
    input: AgentTransferPlanInput,
): AgentTransferPlan | AgentTransferError {
    const previousManagerOwnerIds = [...new Set(input.managerOwnerIds)]
    const previousAgentAssignmentIds = input.activeAssignments.map((assignment) => assignment.id)
    const hasExistingOwnership = previousManagerOwnerIds.length > 0 || previousAgentAssignmentIds.length > 0

    if (hasExistingOwnership && !input.replaceExisting) {
        return { ok: false, code: 'OWNERSHIP_EXISTS', status: 409 }
    }

    const sameAgentOnly = input.activeAssignments.length > 0
        && input.activeAssignments.every((assignment) => assignment.agentId === input.targetAgentId)
        && previousManagerOwnerIds.length === 0

    return {
        mode: !hasExistingOwnership ? 'created' : sameAgentOnly ? 'refreshed' : 'transferred',
        userId: input.userId,
        agentId: input.targetAgentId,
        sourceGroup: input.sourceGroup,
        previousManagerOwnerIds,
        previousAgentAssignmentIds,
        replacedOwnership: hasExistingOwnership,
    }
}

function usesNullableAgentPlan(input: AgentTransferPlanInput | NullableAgentTransferPlanInput): boolean {
    return !hasOwn(input, 'sourceGroup')
        || input.sourceGroup === null
        || hasOwn(input, 'whatsappGroupUrl')
        || hasOwn(input, 'agentDefaultSourceGroup')
}

function currentAgentAssignment(
    input: NullableAgentTransferPlanInput,
    previousManagerOwnerIds: string[],
) {
    return previousManagerOwnerIds.length === 0
        && input.activeAssignments.length === 1
        && input.activeAssignments[0].agentId === input.targetAgentId
        ? input.activeAssignments[0]
        : null
}

function buildNullableAgentTransferPlan(
    input: NullableAgentTransferPlanInput,
): NullableAgentTransferPlan | AgentTransferError {
    const previousManagerOwnerIds = [...new Set(input.managerOwnerIds)]
    const previousAgentAssignmentIds = input.activeAssignments.map((assignment) => assignment.id)
    const hasExistingOwnership = previousManagerOwnerIds.length > 0 || previousAgentAssignmentIds.length > 0
    if (hasExistingOwnership && !input.replaceExisting) {
        return { ok: false, code: 'OWNERSHIP_EXISTS', status: 409 }
    }

    const currentAssignment = currentAgentAssignment(input, previousManagerOwnerIds)
    const metadata = resolveAgentAssignmentMetadata({
        ...(hasOwn(input, 'sourceGroup') ? { sourceGroup: input.sourceGroup } : {}),
        ...(hasOwn(input, 'whatsappGroupUrl') ? { whatsappGroupUrl: input.whatsappGroupUrl } : {}),
        agentDefaultSourceGroup: input.agentDefaultSourceGroup,
        currentAssignment,
    })
    if ('ok' in metadata) return metadata
    const exactMatch = Boolean(
        currentAssignment
        && metadata.sourceGroup === cleanSourceGroup(currentAssignment.sourceGroup)
        && metadata.whatsappGroupUrl === cleanOptionalUrl(currentAssignment.whatsappGroupUrl),
    )
    const updatesCurrentAssignment = Boolean(currentAssignment && !exactMatch)

    return {
        mode: exactMatch
            ? 'noop'
            : updatesCurrentAssignment
                ? 'refreshed'
                : hasExistingOwnership ? 'transferred' : 'created',
        userId: input.userId,
        agentId: input.targetAgentId,
        sourceGroup: metadata.sourceGroup,
        whatsappGroupUrl: metadata.whatsappGroupUrl,
        sourceGroupResolution: metadata.sourceGroupResolution,
        whatsappGroupUrlResolution: metadata.whatsappGroupUrlResolution,
        previousManagerOwnerIds,
        previousAgentAssignmentIds,
        activeAssignmentIdsToClose: currentAssignment ? [] : previousAgentAssignmentIds,
        assignmentIdToUpdate: updatesCurrentAssignment ? currentAssignment?.id ?? null : null,
        requiresAssignmentCreate: !currentAssignment,
        replacedOwnership: currentAssignment ? false : hasExistingOwnership,
    }
}

export function buildAgentTransferPlan(
    input: AgentTransferPlanInput,
): AgentTransferPlan | AgentTransferError
export function buildAgentTransferPlan(
    input: NullableAgentTransferPlanInput,
): NullableAgentTransferPlan | AgentTransferError
export function buildAgentTransferPlan(
    input: AgentTransferPlanInput | NullableAgentTransferPlanInput,
): AgentTransferPlan | NullableAgentTransferPlan | AgentTransferError {
    if (usesNullableAgentPlan(input)) {
        return buildNullableAgentTransferPlan(input as NullableAgentTransferPlanInput)
    }

    return buildLegacyAgentTransferPlan(input as AgentTransferPlanInput)
}

export async function transferUserToAgentInTransaction(input: {
    userId: string
    agentId: string
    sourceGroup?: string | null
    whatsappGroupUrl?: string | null
    replaceExisting?: boolean
    expectedOwnershipToken?: string
    trustedInitialAssignment?: boolean
    adminUserId: string
    ipAddress?: string | null
}, db: TransferDbClient): Promise<AgentTransferResult> {
    const { transferUserOwnershipInTransaction } = await import('@/lib/users/ownership-transfer')
    const result = await transferUserOwnershipInTransaction({
        userId: input.userId,
        targetOwnerType: 'AGENT',
        targetOwnerId: input.agentId,
        ...(hasOwn(input, 'sourceGroup') ? { sourceGroup: input.sourceGroup } : {}),
        ...(hasOwn(input, 'whatsappGroupUrl') ? { whatsappGroupUrl: input.whatsappGroupUrl } : {}),
        expectedOwnershipToken: input.expectedOwnershipToken,
        trustedInitialAssignment: input.trustedInitialAssignment,
        replaceExisting: input.replaceExisting ?? true,
        adminUserId: input.adminUserId,
        ipAddress: input.ipAddress,
    }, db)

    if (!result.agentAssignment) {
        throw new Error('AGENT_ASSIGNMENT_RESULT_MISSING')
    }
    const assignment = await db.agentAssignment.findUniqueOrThrow({
        where: { id: result.agentAssignment.id },
        select: {
            id: true,
            userId: true,
            agentId: true,
            sourceGroup: true,
            whatsappGroupUrl: true,
            createdAt: true,
        },
    })
    const mode = result.mode === 'CREATED'
        ? 'created'
        : result.mode === 'REPLACED'
            ? 'transferred'
            : result.mode === 'UPDATED' ? 'refreshed' : 'noop'

    return {
        assignment: {
            ...assignment,
            createdAt: assignment.createdAt.toISOString(),
        },
        transfer: {
            mode,
            userId: input.userId,
            agentId: input.agentId,
            sourceGroup: assignment.sourceGroup,
            whatsappGroupUrl: assignment.whatsappGroupUrl,
            sourceGroupResolution: result.sourceGroupResolution,
            whatsappGroupUrlResolution: result.whatsappGroupUrlResolution,
            previousManagerOwnerIds: result.previousManagerOwnerIds,
            previousAgentAssignmentIds: result.previousAgentAssignmentIds,
            activeAssignmentIdsToClose: result.activeAssignmentIdsClosed,
            assignmentIdToUpdate: result.mode === 'UPDATED' ? assignment.id : null,
            requiresAssignmentCreate: result.mode === 'CREATED' || result.mode === 'REPLACED',
            replacedOwnership: result.mode === 'REPLACED',
        },
    }
}

export async function transferUserToAgent(input: {
    userId: string
    agentId: string
    sourceGroup?: string | null
    whatsappGroupUrl?: string | null
    replaceExisting?: boolean
    expectedOwnershipToken?: string
    adminUserId: string
    ipAddress?: string | null
}): Promise<AgentTransferResult> {
    return prisma.$transaction((tx) => transferUserToAgentInTransaction(input, tx))
}

export function getAgentTransferErrorResponse(error: unknown): AgentTransferError | null {
    if (
        error &&
        typeof error === 'object' &&
        'ok' in error &&
        'code' in error &&
        'status' in error
    ) {
        return error as AgentTransferError
    }

    return null
}
