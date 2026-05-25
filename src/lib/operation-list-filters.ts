import type { OperationStatus, OperationType, Prisma } from '@prisma/client'

const MIN_CARD_SEARCH_DIGITS = 4

export function normalizeOperationCardSearch(value: string | null | undefined): string | undefined {
    const normalized = value?.replace(/\D/g, '')
    return normalized && normalized.length >= MIN_CARD_SEARCH_DIGITS ? normalized : undefined
}

export function buildOperationListWhere(
    userId: string,
    searchParams: URLSearchParams
): Prisma.OperationWhereInput {
    const type = searchParams.get('type') as OperationType | null
    const status = searchParams.get('status')
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const cardNumber = normalizeOperationCardSearch(searchParams.get('cardNumber'))

    const where: Prisma.OperationWhereInput = {
        userId,
    }

    if (type) {
        where.type = type
    }

    if (status === 'active') {
        where.status = {
            in: ['PENDING', 'PROCESSING', 'AWAITING_CAPTCHA', 'AWAITING_PACKAGE', 'AWAITING_FINAL_CONFIRM', 'COMPLETING'],
        }
    } else if (status) {
        where.status = status as OperationStatus
    }

    if (from || to) {
        where.createdAt = {}
        if (from) {
            where.createdAt.gte = new Date(from)
        }
        if (to) {
            where.createdAt.lte = new Date(to)
        }
    }

    if (cardNumber) {
        where.cardNumber = { contains: cardNumber }
    }

    return where
}
