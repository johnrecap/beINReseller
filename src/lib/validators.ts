import { z } from 'zod'

// beIN Card formats: 10-12 digits
export function validateCardNumber(cardNumber: string): boolean {
    const cleaned = cardNumber.replace(/\s|-/g, '')
    return /^\d{10,12}$/.test(cleaned)
}

export function formatCardNumber(cardNumber: string): string {
    const cleaned = cardNumber.replace(/\s|-/g, '')
    return cleaned.match(/.{1,4}/g)?.join('-') || cleaned
}

export const cardNumberSchema = z
    .string()
    .min(10, 'Card number is too short')
    .max(14, 'Card number is too long')
    .refine(validateCardNumber, 'Invalid card number')

export const loginSchema = z.object({
    username: z.string().min(3, 'Username is too short'),
    password: z.string().min(6, 'Password is too short'),
})

export const createUserSchema = z.object({
    username: z.string().min(3, 'Username is too short'),
    email: z.string().email('Invalid email address'),
    password: z.string().min(6, 'Password is too short'),
    role: z.enum(['ADMIN', 'MANAGER', 'USER']).default('USER'),
})

export const operationSchema = z.object({
    type: z.enum(['RENEW', 'CHECK', 'SIGNAL_REFRESH']),
    cardNumber: cardNumberSchema,
    duration: z.string().optional(),
})

export const balanceSchema = z.object({
    amount: z.number().positive('Amount must be greater than zero'),
    notes: z.string().optional(),
})

export const updateUserSchema = z.object({
    email: z.string().email('Invalid email address').optional(),
    isActive: z.boolean().optional(),
})

export const changePasswordSchema = z.object({
    currentPassword: z.string().min(6, 'Current password is too short'),
    newPassword: z.string().min(6, 'New password is too short'),
    confirmPassword: z.string().min(6, 'Confirm password is too short'),
}).refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
})

export const updateSettingsSchema = z.object({
    key: z.string().min(1, 'Key is required'),
    value: z.string(),
})

export const beinConfigSchema = z.object({
    bein_username: z.string().email('Invalid email address').optional(),
    bein_password: z.string().optional(),
    bein_totp_secret: z.string().optional(),
    captcha_2captcha_key: z.string().optional(),
    captcha_enabled: z.enum(['true', 'false']).optional(),
    bein_login_url: z.string().url('Invalid URL').optional(),
})

