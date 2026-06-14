import { z } from 'zod'

export const CREDIT_REQUEST_LIMITS = {
    minAmountUsd: 1,
    maxAmountUsd: 100000,
    maxPaymentMethodLength: 80,
    maxNotesLength: 500,
} as const

export const createCreditRequestSchema = z.object({
    amountUsd: z.coerce
        .number()
        .finite()
        .min(CREDIT_REQUEST_LIMITS.minAmountUsd)
        .max(CREDIT_REQUEST_LIMITS.maxAmountUsd),
    paymentMethod: z.string().trim().min(1).max(CREDIT_REQUEST_LIMITS.maxPaymentMethodLength),
    notes: z.string().trim().max(CREDIT_REQUEST_LIMITS.maxNotesLength).optional().or(z.literal('')),
})

export type CreateCreditRequestInput = z.infer<typeof createCreditRequestSchema>

export const notificationSettingsSchema = z.object({
    telegramEnabled: z.boolean().optional().default(false),
    telegramBotToken: z.string().trim().max(300).optional().or(z.literal('')),
    clearTelegramBotToken: z.boolean().optional().default(false),
    telegramTargetId: z.string().trim().max(120).optional().or(z.literal('')),
    telegramTargetLabel: z.string().trim().max(120).optional().or(z.literal('')),
    defaultWhatsappGroupUrl: z.string().trim().max(500).optional().or(z.literal('')),
    defaultWhatsappPhone: z.string().trim().max(40).optional().or(z.literal('')),
    defaultWhatsappLabel: z.string().trim().max(120).optional().or(z.literal('')),
})

export type NotificationSettingsInput = z.infer<typeof notificationSettingsSchema>

export type CreditRequestEligibilityReason =
    | 'ELIGIBLE'
    | 'UNAUTHENTICATED'
    | 'NOT_USER'
    | 'INACTIVE_USER'
    | 'MANAGER_OWNED'
    | 'UNOWNED'
    | 'NO_ACTIVE_AGENT_ASSIGNMENT'
    | 'CREDIT_LIMIT_NOT_CONFIGURED'
    | 'CREDIT_LIMIT_EXCEEDED'

export type CreditRequestListItem = {
    id: string
    requestNumber: string
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
    amountUsd: number
    paymentMethod: string
    ownerType?: 'ADMIN' | 'MANAGER' | 'AGENT' | 'LEGACY_ADMIN' | 'UNOWNED' | null
    ownerLabel?: string | null
    agentName: string | null
    sourceGroup: string | null
    createdAt: string
    notificationStatus?: 'PENDING' | 'SENT' | 'FAILED' | 'DISABLED'
}
