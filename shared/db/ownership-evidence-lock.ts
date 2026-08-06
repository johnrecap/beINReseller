import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'

export type OwnershipManagerLinkEvidence = {
    id: string
    managerId: string
}

export type OwnershipAgentAssignmentEvidence = {
    id: string
    agentId: string
    updatedAt: Date | string
    sourceGroup: string | null
    whatsappGroupUrl?: string | null
}

export type OwnershipEvidence = {
    managerLinks: OwnershipManagerLinkEvidence[]
    activeAssignments: OwnershipAgentAssignmentEvidence[]
}

export type CanonicalOwnershipEvidence = {
    managerLinks: OwnershipManagerLinkEvidence[]
    activeAssignments: Array<{
        id: string
        agentId: string
        updatedAt: string
        sourceGroup: string | null
        whatsapp: {
            state: 'CONFIGURED' | 'NONE'
            digest: string | null
        }
    }>
}

type RowLockClient = {
    $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T>
}

function digestSecret(value: string): string {
    return createHash('sha256').update(value).digest('base64url')
}

function canonicalDate(value: Date | string): string {
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

export function canonicalizeOwnershipEvidence(
    evidence: OwnershipEvidence
): CanonicalOwnershipEvidence {
    return {
        managerLinks: evidence.managerLinks
            .map((link) => ({ id: link.id, managerId: link.managerId }))
            .sort((left, right) => (
                left.managerId.localeCompare(right.managerId) || left.id.localeCompare(right.id)
            )),
        activeAssignments: evidence.activeAssignments
            .map((assignment) => {
                const whatsappGroupUrl = assignment.whatsappGroupUrl?.trim() || null
                return {
                    id: assignment.id,
                    agentId: assignment.agentId,
                    updatedAt: canonicalDate(assignment.updatedAt),
                    sourceGroup: assignment.sourceGroup,
                    whatsapp: whatsappGroupUrl
                        ? { state: 'CONFIGURED' as const, digest: digestSecret(whatsappGroupUrl) }
                        : { state: 'NONE' as const, digest: null },
                }
            })
            .sort((left, right) => (
                left.agentId.localeCompare(right.agentId) || left.id.localeCompare(right.id)
            )),
    }
}

export function buildOwnershipToken(evidence: OwnershipEvidence): string {
    const canonical = JSON.stringify(canonicalizeOwnershipEvidence(evidence))
    return `ow1.${createHash('sha256').update(canonical).digest('base64url')}`
}

export function sortOwnershipOwnerIds(input: {
    subjectUserId: string
    ownerUserIds: string[]
}): string[] {
    return Array.from(new Set(input.ownerUserIds))
        .filter((id) => id !== input.subjectUserId)
        .sort((left, right) => left.localeCompare(right))
}

export async function lockOperationRow(
    db: RowLockClient,
    operationId: string
): Promise<boolean> {
    const rows = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id"
        FROM "operations"
        WHERE "id" = ${operationId}
        FOR UPDATE
    `)
    return rows.length === 1
}

export async function lockOwnershipSubjectRow(
    db: RowLockClient,
    subjectUserId: string
): Promise<boolean> {
    const rows = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id"
        FROM "users"
        WHERE "id" = ${subjectUserId}
        FOR UPDATE
    `)
    return rows.length === 1
}

export async function lockOwnershipOwnerRows(
    db: RowLockClient,
    input: { subjectUserId: string; ownerUserIds: string[] }
): Promise<string[]> {
    const ownerIds = sortOwnershipOwnerIds(input)
    if (ownerIds.length === 0) return []

    const rows = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id"
        FROM "users"
        WHERE "id" IN (${Prisma.join(ownerIds)})
        ORDER BY "id" ASC
        FOR UPDATE
    `)
    return rows.map((row) => row.id)
}
