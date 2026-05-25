import { Prisma } from '@prisma/client'

type HandoffTx = Prisma.TransactionClient

type CreateHandoffInput = {
    creditRequestId: string
    requestNumber: string
    username: string
    amountUsd: number
    userId: string
    agentId: string | null
    agentName: string | null
    sourceGroup: string | null
    whatsappGroupUrl: string | null
    adminId: string
    approvedAt?: Date
}

type HandoffDestination = {
    label: string | null
    groupUrl: string | null
    phone: string | null
}

function clean(value: string | null | undefined): string | null {
    const trimmed = value?.trim()
    return trimmed ? trimmed : null
}

function cleanHttpUrl(value: string | null | undefined): string | null {
    const trimmed = clean(value)
    if (!trimmed) return null

    try {
        const url = new URL(trimmed)
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
    } catch {
        return null
    }
}

function normalizePhone(value: string | null): string | null {
    if (!value) return null
    const normalized = value.replace(/[^\d+]/g, '')
    return normalized.length >= 8 ? normalized : null
}

function formatApprovalDate(date: Date): string {
    return new Intl.DateTimeFormat('en-GB', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Africa/Cairo',
    }).format(date)
}

export function buildCreditApprovalWhatsAppMessage(input: {
    username: string
    amountUsd: number
    requestNumber: string
    approvedAt: Date
}): string {
    return [
        'Credit added',
        '',
        `Username: ${input.username}`,
        `Amount: ${input.amountUsd} USD`,
        `Order ID: #${input.requestNumber}`,
        `Date: ${formatApprovalDate(input.approvedAt)}`,
    ].join('\n')
}

export function buildWhatsAppPhoneUrl(phone: string | null, message: string): string | null {
    const normalized = normalizePhone(phone)
    if (!normalized) return null
    return `https://wa.me/${normalized.replace(/^\+/, '')}?text=${encodeURIComponent(message)}`
}

export async function resolveWhatsAppHandoffDestination(
    tx: HandoffTx,
    input: {
        agentId: string | null
        userId?: string | null
        sourceGroup?: string | null
        whatsappGroupUrl?: string | null
    }
): Promise<HandoffDestination> {
    const [activeAssignment, agentProfile, globalSettings] = await Promise.all([
        input.userId
            ? tx.agentAssignment.findFirst({
                where: {
                    userId: input.userId,
                    isActive: true,
                    ...(input.agentId ? { agentId: input.agentId } : {}),
                },
                orderBy: { createdAt: 'desc' },
                select: {
                    sourceGroup: true,
                    whatsappGroupUrl: true,
                },
            })
            : null,
        input.agentId
            ? tx.agentProfile.findUnique({
                where: { agentId: input.agentId },
                select: {
                    whatsappHandoffGroupUrl: true,
                    whatsappHandoffPhone: true,
                    whatsappHandoffLabel: true,
                    whapiGroupName: true,
                    defaultSourceGroup: true,
                },
            })
            : null,
        tx.notificationSetting.findUnique({
            where: { singletonKey: 'default' },
            select: {
                defaultWhatsappGroupUrl: true,
                defaultWhatsappPhone: true,
                defaultWhatsappLabel: true,
            },
        }),
    ])

    const sourceGroup = clean(input.sourceGroup) || clean(activeAssignment?.sourceGroup)

    return {
        groupUrl: cleanHttpUrl(input.whatsappGroupUrl)
            || cleanHttpUrl(activeAssignment?.whatsappGroupUrl)
            || cleanHttpUrl(agentProfile?.whatsappHandoffGroupUrl)
            || cleanHttpUrl(globalSettings?.defaultWhatsappGroupUrl),
        phone: normalizePhone(clean(agentProfile?.whatsappHandoffPhone) || clean(globalSettings?.defaultWhatsappPhone)),
        label: sourceGroup
            || clean(agentProfile?.whatsappHandoffLabel)
            || clean(agentProfile?.whapiGroupName)
            || clean(agentProfile?.defaultSourceGroup)
            || clean(globalSettings?.defaultWhatsappLabel),
    }
}

export async function createWhatsAppHandoffSnapshot(
    tx: HandoffTx,
    input: CreateHandoffInput
) {
    const approvedAt = input.approvedAt || new Date()
    const messageText = buildCreditApprovalWhatsAppMessage({
        username: input.username,
        amountUsd: input.amountUsd,
        requestNumber: input.requestNumber,
        approvedAt,
    })
    const destination = await resolveWhatsAppHandoffDestination(tx, {
        agentId: input.agentId,
        userId: input.userId,
        sourceGroup: input.sourceGroup,
        whatsappGroupUrl: input.whatsappGroupUrl,
    })

    const handoff = await tx.whatsAppHandoffSnapshot.upsert({
        where: { creditRequestId: input.creditRequestId },
        create: {
            creditRequestId: input.creditRequestId,
            agentId: input.agentId,
            destinationLabel: destination.label || input.agentName,
            whatsappGroupUrl: destination.groupUrl,
            whatsappPhone: destination.phone,
            messageText,
            groupOpenAvailable: Boolean(destination.groupUrl),
            phoneOpenAvailable: Boolean(destination.phone),
            createdByAdminId: input.adminId,
        },
        update: {},
        select: {
            id: true,
            destinationLabel: true,
            whatsappGroupUrl: true,
            whatsappPhone: true,
            messageText: true,
            groupOpenAvailable: true,
            phoneOpenAvailable: true,
            createdAt: true,
        },
    })

    return {
        id: handoff.id,
        destinationLabel: handoff.destinationLabel,
        messageText: handoff.messageText,
        groupUrl: handoff.whatsappGroupUrl,
        phoneUrl: buildWhatsAppPhoneUrl(handoff.whatsappPhone, handoff.messageText),
        groupOpenAvailable: handoff.groupOpenAvailable,
        phoneOpenAvailable: handoff.phoneOpenAvailable,
        createdAt: handoff.createdAt.toISOString(),
    }
}
