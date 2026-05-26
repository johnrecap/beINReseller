import { Prisma, type PrismaClient } from '@prisma/client'

type PermissionAuditClient = Pick<PrismaClient, 'permissionAuditEvent'>

function toPrismaJson(value: unknown) {
    if (value === undefined) return undefined
    if (value === null) return Prisma.JsonNull
    return value as Prisma.InputJsonValue
}

export interface WritePermissionAuditInput {
    actorUserId?: string | null
    targetType: 'role' | 'user' | 'global' | 'protected_admin'
    targetId: string
    permissionKey?: string | null
    oldValue?: unknown
    newValue?: unknown
    result: 'success' | 'rejected'
    reason?: string | null
}

export async function writePermissionAudit(
    db: PermissionAuditClient,
    input: WritePermissionAuditInput
) {
    return db.permissionAuditEvent.create({
        data: {
            actorUserId: input.actorUserId ?? null,
            targetType: input.targetType,
            targetId: input.targetId,
            permissionKey: input.permissionKey ?? null,
            oldValue: toPrismaJson(input.oldValue),
            newValue: toPrismaJson(input.newValue),
            result: input.result,
            reason: input.reason ?? null,
        },
    })
}
