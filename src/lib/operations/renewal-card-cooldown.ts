import type { Prisma } from '@prisma/client'

export const RENEWAL_CARD_COOLDOWN_CODE = 'RENEWAL_CARD_COOLDOWN'

export type CardCooldownSnapshot = {
    cardNumber: string
    cooldownUntil: string | null
    serverNow: string
    remainingSeconds: number
}

// Read only: neither denied requests nor countdown refreshes change the deadline.
export async function readRenewalCardCooldown(
    db: Pick<Prisma.TransactionClient, 'operation'>,
    cardNumber: string,
    now = new Date(),
): Promise<CardCooldownSnapshot> {
    const row = await db.operation.findFirst({
        where: { cardNumber, type: 'RENEW', administrativeArchivedAt: null, renewalCooldownUntil: { gt: now } },
        orderBy: { renewalCooldownUntil: 'desc' },
        select: { renewalCooldownUntil: true },
    })
    const until = row?.renewalCooldownUntil
    return { cardNumber, cooldownUntil: until?.toISOString() ?? null, serverNow: now.toISOString(),
        remainingSeconds: until ? Math.max(0, Math.ceil((until.getTime() - now.getTime()) / 1000)) : 0 }
}
