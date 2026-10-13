import type { Prisma } from '@prisma/client'
import { evaluateRenewalFulfillmentEnforcement, RENEWAL_FULFILLMENT_PROOF_MODE_SETTING_KEY,
    RENEWAL_FULFILLMENT_LIVE_SMOKE_ATTESTATION_SETTING_KEY, RENEWAL_FULFILLMENT_LIVE_SMOKE_MAX_AGE_MS,
} from '../../shared/operations/renewal-fulfillment-config'

type ReadinessDb = Pick<Prisma.TransactionClient, 'beinAccount' | 'providerAccountCausalReservation' | 'setting' | '$queryRaw'>
export async function getRenewalReadiness(db: ReadinessDb, input: {
    operationId?: string; beinAccountId?: string | null; minBalance?: number; now?: Date; lockAssignedAccount?: boolean
} = {}) {
    const now = input.now ?? new Date()
    const settings = await db.setting.findMany({ where: { key: { in: [RENEWAL_FULFILLMENT_PROOF_MODE_SETTING_KEY,
        RENEWAL_FULFILLMENT_LIVE_SMOKE_ATTESTATION_SETTING_KEY] } }, select: { key: true, value: true } })
    const values = new Map(settings.map(row => [row.key, row.value]))
    const enforcement = evaluateRenewalFulfillmentEnforcement({
        requestedMode: values.get(RENEWAL_FULFILLMENT_PROOF_MODE_SETTING_KEY),
        attestationValue: values.get(RENEWAL_FULFILLMENT_LIVE_SMOKE_ATTESTATION_SETTING_KEY), now,
    })
    // The regular worker pool currently leaves customerOnly undefined. Match
    // that scope; do not silently move existing customer jobs/accounts.
    const eligibility: Prisma.BeinAccountWhereInput = { isActive: true, automationExclusive: true,
        ...(input.minBalance !== undefined ? { dealerBalance: { gte: input.minBalance } } : {}) }
    if (input.lockAssignedAccount && input.beinAccountId) {
        await db.$queryRaw`SELECT "id" FROM "bein_accounts" WHERE "id" = ${input.beinAccountId} FOR SHARE`
        await db.$queryRaw`SELECT "id" FROM "provider_account_causal_reservations"
            WHERE "operation_id" = ${input.operationId ?? ''} AND "released_at" IS NULL FOR SHARE`
    }
    const [eligibleAccountCount, owned] = await Promise.all([
        db.beinAccount.count({ where: { ...eligibility, providerAccountCausalReservations: { none: { releasedAt: null } } } }),
        input.operationId ? db.providerAccountCausalReservation.findFirst({ where: {
            operationId: input.operationId, releasedAt: null,
            ...(input.beinAccountId ? { beinAccountId: input.beinAccountId } : {}),
            beinAccount: eligibility,
        }, select: { id: true } }) : null,
    ])
    const availableForOperation = input.lockAssignedAccount ? Boolean(input.beinAccountId && owned) : eligibleAccountCount > 0 || Boolean(owned)
    const modeAvailable = enforcement.requestedMode !== 'ENFORCE' || enforcement.enforcementAvailable
    return { ready: availableForOperation && modeAvailable, eligibleAccountCount, ownedReservationAvailable: Boolean(owned),
        requestedMode: enforcement.requestedMode, effectiveMode: enforcement.effectiveMode,
        automaticFulfillmentAvailable: enforcement.enforcementAvailable, attestationReason: enforcement.reason,
        attestationExpiresAt: enforcement.verifiedAt ? new Date(Date.parse(enforcement.verifiedAt) + RENEWAL_FULFILLMENT_LIVE_SMOKE_MAX_AGE_MS).toISOString() : null,
        reasonCode: !availableForOperation ? 'NO_ELIGIBLE_PROVIDER_ACCOUNT' : !modeAvailable ? enforcement.reason : 'READY',
        // This is database admission evidence; Redis leases and real provider
        // session readiness remain the worker's responsibility.
        providerSessionVerified: false as const }
}

export class RenewalReadinessError extends Error {
    readonly code = 'RENEWAL_NOT_READY'
    constructor(readonly reasonCode: string) { super('RENEWAL_NOT_READY') }
}
export async function assertRenewalReadiness(db: ReadinessDb, input?: Parameters<typeof getRenewalReadiness>[1]) {
    const readiness = await getRenewalReadiness(db, input)
    if (!readiness.ready) throw new RenewalReadinessError(readiness.reasonCode)
    return readiness
}
export function renewalReadinessErrorPayload(error: unknown) {
    return error instanceof RenewalReadinessError ? { error: error.code, code: error.code, reasonCode: error.reasonCode,
        messageKey: 'operations.renewalNotReady' } : null
}
