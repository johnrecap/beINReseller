export const DEFAULT_EID_AUDIENCE_ROLES = ['ADMIN', 'MANAGER', 'AGENT', 'USER'] as const

export type EidAudienceRole = typeof DEFAULT_EID_AUDIENCE_ROLES[number]
export type EidAudienceOverrideEffect = 'ALLOW' | 'DENY'
export type EidAudienceDecisionReason =
    | 'ROLE_ALLOWED'
    | 'ROLE_DENIED'
    | 'USER_ALLOWED'
    | 'USER_DENIED'
    | 'INACTIVE_USER'
    | 'DELETED_USER'

export type EidAudienceUserLike = {
    id: string
    role: string
    isActive: boolean
    deletedAt: Date | string | null
}

export type EidAudienceOverrideLike = {
    effect: EidAudienceOverrideEffect
} | null

export function isEidAudienceRole(value: unknown): value is EidAudienceRole {
    return typeof value === 'string' && DEFAULT_EID_AUDIENCE_ROLES.includes(value as EidAudienceRole)
}

export function normalizeEidAudienceRoles(value: unknown): EidAudienceRole[] {
    if (!Array.isArray(value)) return [...DEFAULT_EID_AUDIENCE_ROLES]

    const roles: EidAudienceRole[] = []
    for (const item of value) {
        if (isEidAudienceRole(item) && !roles.includes(item)) {
            roles.push(item)
        }
    }
    return roles
}

export function evaluateEidRewardAudience(input: {
    user: EidAudienceUserLike | null
    audienceRoles: readonly string[]
    override: EidAudienceOverrideLike
}): { allowed: boolean; reason: EidAudienceDecisionReason } {
    if (!input.user || !input.user.isActive) {
        return { allowed: false, reason: 'INACTIVE_USER' }
    }

    if (input.user.deletedAt) {
        return { allowed: false, reason: 'DELETED_USER' }
    }

    if (input.override?.effect === 'DENY') {
        return { allowed: false, reason: 'USER_DENIED' }
    }

    if (input.override?.effect === 'ALLOW') {
        return { allowed: true, reason: 'USER_ALLOWED' }
    }

    const roles = normalizeEidAudienceRoles(input.audienceRoles)
    if (roles.includes(input.user.role as EidAudienceRole)) {
        return { allowed: true, reason: 'ROLE_ALLOWED' }
    }

    return { allowed: false, reason: 'ROLE_DENIED' }
}
