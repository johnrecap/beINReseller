import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-utils'
import prisma from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { lockFinancialOperation } from '../../../../../../shared/operations/financial-lock'
import { quoteData, quoteRevisionOf, publicPackageQuote, quoteErrorPayload } from '../../../../../../shared/operations/package-quote'
import { createOperationDispatch, dispatchPendingOperationJobs } from '@/lib/operation-dispatch'
import {
    ensureGuardedRenewalOperationReservation,
    isRenewalCreationBlockedError,
    renewalCreationBlockedPayload,
} from '@/lib/operations/renewal-creation-guard'

/**
 * Helper to get authenticated user from session OR mobile token
 */
async function getAuthUser(request: NextRequest) {
    return getAuthenticatedUser(request)
}

const promoSchema = z.object({
    actionRevision: z.number().int().min(1).max(2147483647),
    promoAction: z.enum(['APPLY', 'REMOVE']).default('APPLY'),
    promoCode: z.string().trim().min(1).max(100).transform(code => code.toUpperCase()).optional(),
}).refine(input => input.promoAction === 'REMOVE' || Boolean(input.promoCode))

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const authUser = await getAuthUser(request)
        if (!authUser?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        const { id } = await params
        const parsed = promoSchema.safeParse(await request.json().catch(() => null))
        if (!parsed.success) return NextResponse.json({ code: 'INVALID_PROMO_REQUEST', error: 'INVALID_PROMO_REQUEST',
            messageKey: 'operations.packageQuoteChanged' }, { status: 400 })
        const input = parsed.data
        const requestedCode = input.promoAction === 'REMOVE' ? null : input.promoCode!
        await prisma.$transaction(async tx => {
            if (!await lockFinancialOperation(tx, id)) throw new Error('OPERATION_NOT_FOUND')
            const current = await tx.operation.findUniqueOrThrow({ where: { id } })
            if (current.userId !== authUser.id) throw new Error('FORBIDDEN')
            if (current.status !== 'AWAITING_PACKAGE' || (current.finalConfirmExpiry && current.finalConfirmExpiry <= new Date())) {
                throw new Error('STALE_PACKAGE_QUOTE')
            }
            const data = quoteData(current.responseData)
            const revision = quoteRevisionOf(data)
            if (input.actionRevision === revision) {
                if (data.requestedPromoCode !== requestedCode || data.promoAction !== input.promoAction) {
                    throw new Error('PROMO_REQUEST_CONFLICT')
                }
                return // Pending, completed and failed requests replay their existing result.
            }
            if (input.actionRevision !== revision + 1) throw new Error('PROMO_REQUEST_CONFLICT')
            if (data.quoteState === 'FAILED') throw new Error('PACKAGE_QUOTE_NOT_READY')
            await ensureGuardedRenewalOperationReservation(tx, { operationId: id, cardNumber: current.cardNumber })
            await tx.operation.update({ where: { id }, data: {
                selectedPackage: Prisma.JsonNull,
                responseData: JSON.stringify({ ...data, quoteRevision: input.actionRevision, quoteState: 'PENDING',
                    requestedPromoCode: requestedCode, promoAction: input.promoAction, refreshing: true,
                    promoApplied: false, error: null }),
            } })
            await createOperationDispatch(tx, {
                operationId: id, type: 'APPLY_PROMO', actionRevision: input.actionRevision,
                promoAction: input.promoAction, promoCode: requestedCode || undefined,
                userId: authUser.id, cardNumber: current.cardNumber,
                smartcardType: typeof data.smartcardType === 'string' ? data.smartcardType : 'CISCO',
            })
        })
        await dispatchPendingOperationJobs({ operationIds: [id] })
        const latest = await prisma.operation.findUniqueOrThrow({ where: { id } })
        const quote = publicPackageQuote(latest)
        const processing = quote.quoteState === 'PENDING'
        return NextResponse.json({ ...quote, success: quote.quoteState === 'READY', processing,
            messageKey: processing ? 'operations.packageQuotePending' : quote.quoteState === 'FAILED'
                ? 'operations.packageQuoteFailed' : 'operations.packageQuoteUpdated' }, { status: processing ? 202 : 200 })
    } catch (error) {
        if (isRenewalCreationBlockedError(error)) return NextResponse.json(renewalCreationBlockedPayload(error), { status: 409 })
        const quoteError = quoteErrorPayload(error)
        if (quoteError) return NextResponse.json(quoteError, { status: 409 })
        const message = error instanceof Error ? error.message : ''
        if (message === 'FORBIDDEN') return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
        if (message === 'OPERATION_NOT_FOUND') return NextResponse.json({ error: 'Operation not found' }, { status: 404 })
        console.error('Apply promo error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
