import type { Prisma } from '@prisma/client'
import { createOperationDispatch } from '@/lib/operation-dispatch'
import { acquireCardLifecycleReservation } from '@/lib/operations/card-lifecycle-reservation'
import {
    buildMobileRenewalMetadata,
    decideMobileRenewalPaymentTransition,
    isExactMobileRenewalProviderPayment,
    isObject,
    mobileRenewalMetadataMatches,
    MobileRenewalProviderPayment,
    parseMobileRenewalMetadata,
    PRETERMINAL_MOBILE_PAYMENT_STATUSES,
    sameMobileRenewalMinorAmount,
} from '@/lib/mobile-renewal-payment-contract'

export type { MobileRenewalProviderPayment } from '@/lib/mobile-renewal-payment-contract'

export type MobileRenewalPaymentFinalizationResult = {
    result: 'FINALIZED' | 'ALREADY_FINALIZED' | 'REVIEW_REQUIRED' | 'TERMINAL_PAYMENT_IGNORED'
    operationId: string
    shouldDispatch: boolean
}

export type MobileRenewalPaymentPersistenceResult =
    | 'PERSISTED'
    | 'ALREADY_PERSISTED'
    | 'RECORDED_REVIEW_REQUIRED'

export function isMobileRenewalPaymentSafetyError(error: unknown): boolean {
    return error instanceof Error && error.message.startsWith('MOBILE_RENEWAL_')
}

type PackageSnapshot = {
    name: string
    price: number
}

function parsePackageSnapshot(value: Prisma.JsonValue | null): PackageSnapshot | null {
    if (!isObject(value) || typeof value.name !== 'string' || typeof value.price !== 'number') {
        return null
    }
    if (!value.name || !Number.isFinite(value.price) || value.price <= 0) {
        return null
    }
    return { name: value.name, price: value.price }
}

function dispatchPayloadMatches(
    value: Prisma.JsonValue,
    input: {
        operationId: string
        cardNumber: string
        customerId: string
        amount: number
    }
): boolean {
    if (!isObject(value)) return false
    return value.operationId === input.operationId &&
        value.type === 'CONFIRM_PURCHASE' &&
        value.cardNumber === input.cardNumber &&
        value.customerId === input.customerId &&
        value.queueTarget === 'CUSTOMER' &&
        typeof value.amount === 'number' &&
        sameMobileRenewalMinorAmount(value.amount, input.amount)
}

async function holdMobileRenewalPaymentReview(
    tx: Prisma.TransactionClient,
    input: {
        operationId: string
        customerId: string
        cardNumber: string
        reasonCode: string
    }
): Promise<void> {
    const operationUpdate = await tx.operation.updateMany({
        where: {
            id: input.operationId,
            type: 'RENEW',
            customerId: input.customerId,
            cardNumber: input.cardNumber,
        },
        data: {
            status: 'REVIEW_REQUIRED',
            responseMessage: input.reasonCode,
        },
    })
    if (operationUpdate.count !== 1) {
        throw new Error('MOBILE_RENEWAL_OPERATION_LINK_MISMATCH')
    }

    await tx.operationDispatch.updateMany({
        where: {
            operationId: input.operationId,
            jobType: 'CONFIRM_PURCHASE',
            status: 'PENDING',
        },
        data: {
            status: 'REVIEW_REQUIRED',
            lastError: input.reasonCode,
        },
    })
}

async function ensureReplayDispatch(
    tx: Prisma.TransactionClient,
    input: {
        operationId: string
        cardNumber: string
        customerId: string
        amount: number
    }
): Promise<boolean> {
    const dispatch = await tx.operationDispatch.findUnique({
        where: {
            operationId_jobType_actionRevision: {
                operationId: input.operationId,
                jobType: 'CONFIRM_PURCHASE',
                actionRevision: 0,
            },
        },
        select: { payload: true, status: true },
    })

    if (!dispatch) {
        await createOperationDispatch(tx, {
            operationId: input.operationId,
            type: 'CONFIRM_PURCHASE',
            cardNumber: input.cardNumber,
            customerId: input.customerId,
            amount: input.amount,
            queueTarget: 'CUSTOMER',
        })
        return true
    }

    if (!dispatchPayloadMatches(dispatch.payload, input)) {
        throw new Error('MOBILE_RENEWAL_DISPATCH_LINK_MISMATCH')
    }
    if (dispatch.status === 'PENDING') return true
    if (dispatch.status === 'DISPATCHED') return false
    throw new Error('MOBILE_RENEWAL_DISPATCH_STATE_CONFLICT')
}

export async function finalizeMobileRenewalPayment(
    tx: Prisma.TransactionClient,
    input: { provider: MobileRenewalProviderPayment }
): Promise<MobileRenewalPaymentFinalizationResult> {
    const paymentHint = await tx.payment.findUnique({
        where: { stripePaymentIntentId: input.provider.id },
        select: { id: true, status: true },
    })
    if (!paymentHint) throw new Error('MOBILE_RENEWAL_PAYMENT_NOT_FOUND')

    const providerMetadata = parseMobileRenewalMetadata(input.provider.metadata)
    if (!providerMetadata?.operationId) {
        throw new Error('MOBILE_RENEWAL_PROVIDER_LINK_MISMATCH')
    }

    const operationHint = await tx.operation.findUnique({
        where: { id: providerMetadata.operationId },
        select: { id: true, cardNumber: true, status: true },
    })
    if (!operationHint) throw new Error('MOBILE_RENEWAL_OPERATION_NOT_FOUND')

    const terminalPayment = ['REFUNDED', 'PARTIALLY_REFUNDED', 'CANCELLED'].includes(
        paymentHint.status
    )
    const completedReplay = paymentHint.status === 'SUCCEEDED' &&
        operationHint.status === 'COMPLETED'
    const reservation = terminalPayment || completedReplay
        ? null
        : await acquireCardLifecycleReservation(tx, {
            operationId: operationHint.id,
            cardNumber: operationHint.cardNumber,
        })
    const reservationOwned = reservation === null ||
        reservation.status === 'ACQUIRED' ||
        reservation.status === 'ALREADY_HELD'

    await tx.$queryRaw`SELECT id FROM "operations" WHERE id = ${operationHint.id} FOR UPDATE`
    await tx.$queryRaw`SELECT id FROM "payments" WHERE id = ${paymentHint.id} FOR UPDATE`

    const [operation, payment] = await Promise.all([
        tx.operation.findUnique({
            where: { id: operationHint.id },
            select: {
                id: true,
                type: true,
                customerId: true,
                cardNumber: true,
                amount: true,
                status: true,
                selectedPackage: true,
            },
        }),
        tx.payment.findUnique({
            where: { id: paymentHint.id },
            select: {
                id: true,
                customerId: true,
                stripePaymentIntentId: true,
                amount: true,
                currency: true,
                status: true,
                type: true,
                metadata: true,
                order: { select: { id: true } },
                subscription: { select: { id: true } },
            },
        }),
    ])

    const selectedPackage = parsePackageSnapshot(operation?.selectedPackage || null)
    const localMetadata = parseMobileRenewalMetadata(payment?.metadata || null)
    const localBeinPrice = Number(localMetadata?.beinPrice)
    const localCustomerPrice = Number(localMetadata?.customerPrice)
    if (
        !operation ||
        !payment ||
        operation.type !== 'RENEW' ||
        !operation.customerId ||
        payment.type !== 'SUBSCRIPTION' ||
        payment.order !== null ||
        payment.subscription !== null ||
        payment.customerId !== operation.customerId ||
        payment.stripePaymentIntentId !== input.provider.id ||
        localMetadata?.source !== 'mobile_renewal' ||
        localMetadata.operationId !== operation.id ||
        localMetadata.customerId !== operation.customerId ||
        !localMetadata.packageName ||
        !Number.isFinite(localBeinPrice) ||
        localBeinPrice <= 0 ||
        !Number.isFinite(localCustomerPrice) ||
        !sameMobileRenewalMinorAmount(localCustomerPrice, payment.amount)
    ) {
        throw new Error('MOBILE_RENEWAL_PAYMENT_LINK_MISMATCH')
    }

    const expectedMetadata = buildMobileRenewalMetadata({
        operationId: operation.id,
        customerId: operation.customerId,
        packageName: localMetadata.packageName,
        beinPrice: localBeinPrice,
        customerPrice: payment.amount,
    })
    if (
        !mobileRenewalMetadataMatches(payment.metadata, expectedMetadata) ||
        !isExactMobileRenewalProviderPayment({
            provider: input.provider,
            operationId: operation.id,
            customerId: operation.customerId,
            packageName: localMetadata.packageName,
            beinPrice: localBeinPrice,
            customerPrice: payment.amount,
            currency: payment.currency,
            requireSucceeded: true,
        })
    ) {
        throw new Error('MOBILE_RENEWAL_PROVIDER_LINK_MISMATCH')
    }

    let transition = decideMobileRenewalPaymentTransition({
        paymentStatus: payment.status,
        operationStatus: operation.status,
    })
    const currentOperationMatchesPayment = !!selectedPackage &&
        selectedPackage.name === localMetadata.packageName &&
        sameMobileRenewalMinorAmount(selectedPackage.price, localBeinPrice) &&
        sameMobileRenewalMinorAmount(operation.amount, payment.amount)
    if (
        !currentOperationMatchesPayment &&
        transition !== 'IGNORE_TERMINAL_PAYMENT' &&
        transition !== 'RECORD_SUCCESS_REVIEW'
    ) {
        transition = 'RECORD_SUCCESS_REVIEW'
    }

    if (transition === 'IGNORE_TERMINAL_PAYMENT') {
        return {
            result: 'TERMINAL_PAYMENT_IGNORED',
            operationId: operation.id,
            shouldDispatch: false,
        }
    }
    if (transition === 'CONFLICT') {
        throw new Error('MOBILE_RENEWAL_PAYMENT_STATE_CONFLICT')
    }
    if (transition === 'REPLAY_TERMINAL') {
        return {
            result: 'ALREADY_FINALIZED',
            operationId: operation.id,
            shouldDispatch: false,
        }
    }
    if (
        transition === 'RECORD_SUCCESS_REVIEW' ||
        ((transition === 'FINALIZE' || transition === 'REPLAY_DISPATCH') && !reservationOwned)
    ) {
        if (PRETERMINAL_MOBILE_PAYMENT_STATUSES.has(payment.status)) {
            const paymentUpdate = await tx.payment.updateMany({
                where: {
                    id: payment.id,
                    stripePaymentIntentId: input.provider.id,
                    customerId: operation.customerId,
                    status: { in: [...PRETERMINAL_MOBILE_PAYMENT_STATUSES] },
                },
                data: { status: 'SUCCEEDED', failureMessage: null },
            })
            if (paymentUpdate.count !== 1) {
                throw new Error('MOBILE_RENEWAL_PAYMENT_STATE_CONFLICT')
            }
        }
        await holdMobileRenewalPaymentReview(tx, {
            operationId: operation.id,
            customerId: operation.customerId,
            cardNumber: operation.cardNumber,
            reasonCode: 'MOBILE_RENEWAL_PAYMENT_STATE_REVIEW',
        })
        return {
            result: 'REVIEW_REQUIRED',
            operationId: operation.id,
            shouldDispatch: false,
        }
    }
    if (transition === 'REPLAY_DISPATCH') {
        return {
            result: 'ALREADY_FINALIZED',
            operationId: operation.id,
            shouldDispatch: await ensureReplayDispatch(tx, {
                operationId: operation.id,
                cardNumber: operation.cardNumber,
                customerId: operation.customerId,
                amount: payment.amount,
            }),
        }
    }

    const existingDispatch = await tx.operationDispatch.findUnique({
        where: {
            operationId_jobType_actionRevision: {
                operationId: operation.id,
                jobType: 'CONFIRM_PURCHASE',
                actionRevision: 0,
            },
        },
        select: { id: true },
    })
    if (existingDispatch) throw new Error('MOBILE_RENEWAL_DISPATCH_STATE_CONFLICT')

    const paymentUpdate = await tx.payment.updateMany({
        where: {
            id: payment.id,
            stripePaymentIntentId: input.provider.id,
            customerId: operation.customerId,
            status: { in: [...PRETERMINAL_MOBILE_PAYMENT_STATUSES] },
        },
        data: { status: 'SUCCEEDED', failureMessage: null },
    })
    const operationUpdate = await tx.operation.updateMany({
        where: {
            id: operation.id,
            type: 'RENEW',
            customerId: operation.customerId,
            cardNumber: operation.cardNumber,
            status: 'AWAITING_FINAL_CONFIRM',
        },
        data: { status: 'COMPLETING' },
    })
    if (paymentUpdate.count !== 1 || operationUpdate.count !== 1) {
        throw new Error('MOBILE_RENEWAL_PAYMENT_STATE_CONFLICT')
    }

    await createOperationDispatch(tx, {
        operationId: operation.id,
        type: 'CONFIRM_PURCHASE',
        cardNumber: operation.cardNumber,
        customerId: operation.customerId,
        amount: payment.amount,
        queueTarget: 'CUSTOMER',
    })

    return { result: 'FINALIZED', operationId: operation.id, shouldDispatch: true }
}

export async function persistMobileRenewalPaymentIntent(
    tx: Prisma.TransactionClient,
    input: {
        provider: MobileRenewalProviderPayment
        operationId: string
        customerId: string
        cardNumber: string
        packageName: string
        beinPrice: number
        customerPrice: number
        currency: string
    }
): Promise<MobileRenewalPaymentPersistenceResult> {
    if (!isExactMobileRenewalProviderPayment({
        provider: input.provider,
        operationId: input.operationId,
        customerId: input.customerId,
        packageName: input.packageName,
        beinPrice: input.beinPrice,
        customerPrice: input.customerPrice,
        currency: input.currency,
        requireSucceeded: false,
    })) {
        throw new Error('MOBILE_RENEWAL_PROVIDER_LINK_MISMATCH')
    }

    const operationHint = await tx.operation.findUnique({
        where: { id: input.operationId },
        select: { id: true },
    })
    if (!operationHint) throw new Error('MOBILE_RENEWAL_OPERATION_NOT_FOUND')
    const reservation = await acquireCardLifecycleReservation(tx, {
        operationId: input.operationId,
        cardNumber: input.cardNumber,
    })
    const reservationOwned = reservation.status === 'ACQUIRED' ||
        reservation.status === 'ALREADY_HELD'

    await tx.$queryRaw`SELECT id FROM "operations" WHERE id = ${input.operationId} FOR UPDATE`

    const operation = await tx.operation.findUnique({
        where: { id: input.operationId },
        select: {
            id: true,
            type: true,
            customerId: true,
            cardNumber: true,
            amount: true,
            status: true,
            selectedPackage: true,
        },
    })
    if (
        !operation ||
        operation.type !== 'RENEW' ||
        operation.customerId !== input.customerId ||
        operation.cardNumber !== input.cardNumber
    ) {
        throw new Error('MOBILE_RENEWAL_OPERATION_LINK_MISMATCH')
    }

    const expectedMetadata = buildMobileRenewalMetadata(input)
    const selectedPackage = parsePackageSnapshot(operation.selectedPackage)
    const canAttach = reservationOwned &&
        operation.status === 'AWAITING_FINAL_CONFIRM' &&
        !!selectedPackage &&
        selectedPackage.name === input.packageName &&
        sameMobileRenewalMinorAmount(selectedPackage.price, input.beinPrice)
    const existingPayment = await tx.payment.findUnique({
        where: { stripePaymentIntentId: input.provider.id },
        select: {
            customerId: true,
            stripePaymentIntentId: true,
            amount: true,
            currency: true,
            type: true,
            metadata: true,
            order: { select: { id: true } },
            subscription: { select: { id: true } },
        },
    })
    if (existingPayment) {
        if (
            existingPayment.customerId !== input.customerId ||
            existingPayment.type !== 'SUBSCRIPTION' ||
            existingPayment.order !== null ||
            existingPayment.subscription !== null ||
            existingPayment.stripePaymentIntentId !== input.provider.id ||
            !sameMobileRenewalMinorAmount(existingPayment.amount, input.customerPrice) ||
            existingPayment.currency !== input.currency ||
            !mobileRenewalMetadataMatches(existingPayment.metadata, expectedMetadata)
        ) {
            throw new Error('MOBILE_RENEWAL_PAYMENT_LINK_MISMATCH')
        }
        if (canAttach && sameMobileRenewalMinorAmount(operation.amount, input.customerPrice)) {
            return 'ALREADY_PERSISTED'
        }
        await holdMobileRenewalPaymentReview(tx, {
            operationId: operation.id,
            customerId: input.customerId,
            cardNumber: input.cardNumber,
            reasonCode: 'MOBILE_RENEWAL_PAYMENT_PERSISTENCE_REVIEW',
        })
        return 'RECORDED_REVIEW_REQUIRED'
    }

    if (canAttach) {
        const operationUpdate = await tx.operation.updateMany({
            where: {
                id: operation.id,
                type: 'RENEW',
                customerId: input.customerId,
                cardNumber: input.cardNumber,
                status: 'AWAITING_FINAL_CONFIRM',
            },
            data: { amount: input.customerPrice },
        })
        if (operationUpdate.count !== 1) {
            throw new Error('MOBILE_RENEWAL_PAYMENT_STATE_CONFLICT')
        }
    }

    await tx.payment.create({
        data: {
            customerId: input.customerId,
            stripePaymentIntentId: input.provider.id,
            amount: input.customerPrice,
            currency: input.currency,
            status: 'PENDING',
            type: 'SUBSCRIPTION',
            metadata: expectedMetadata,
        },
    })

    if (!canAttach) {
        await holdMobileRenewalPaymentReview(tx, {
            operationId: operation.id,
            customerId: input.customerId,
            cardNumber: input.cardNumber,
            reasonCode: 'MOBILE_RENEWAL_PAYMENT_PERSISTENCE_REVIEW',
        })
    }

    return canAttach ? 'PERSISTED' : 'RECORDED_REVIEW_REQUIRED'
}
