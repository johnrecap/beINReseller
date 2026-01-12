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
    .min(10, 'رقم الكارت قصير جداً')
    .max(14, 'رقم الكارت طويل جداً')
    .refine(validateCardNumber, 'رقم كارت غير صالح')

export const loginSchema = z.object({
    username: z.string().min(3, 'اسم المستخدم قصير جداً'),
    password: z.string().min(6, 'كلمة المرور قصيرة جداً'),
})

export const createUserSchema = z.object({
    username: z.string().min(3, 'اسم المستخدم قصير جداً'),
    email: z.string().email('البريد الإلكتروني غير صالح'),
    password: z.string().min(6, 'كلمة المرور قصيرة جداً'),
    role: z.enum(['ADMIN', 'RESELLER']).default('RESELLER'),
})

export const operationSchema = z.object({
    type: z.enum(['RENEW', 'CHECK', 'SIGNAL_REFRESH']),
    cardNumber: cardNumberSchema,
    duration: z.string().optional(),
})

export const balanceSchema = z.object({
    amount: z.number().positive('المبلغ يجب أن يكون أكبر من صفر'),
    notes: z.string().optional(),
})

export const updateUserSchema = z.object({
    email: z.string().email('البريد الإلكتروني غير صالح').optional(),
    isActive: z.boolean().optional(),
})

export const changePasswordSchema = z.object({
    currentPassword: z.string().min(6, 'كلمة المرور الحالية قصيرة جداً'),
    newPassword: z.string().min(6, 'كلمة المرور الجديدة قصيرة جداً'),
    confirmPassword: z.string().min(6, 'تأكيد كلمة المرور قصير جداً'),
}).refine((data) => data.newPassword === data.confirmPassword, {
    message: 'كلمة المرور غير متطابقة',
    path: ['confirmPassword'],
})

export const updateSettingsSchema = z.object({
    key: z.string().min(1, 'المفتاح مطلوب'),
    value: z.string(),
})

export const beinConfigSchema = z.object({
    bein_username: z.string().email('البريد الإلكتروني غير صالح').optional(),
    bein_password: z.string().optional(),
    bein_totp_secret: z.string().optional(),
    captcha_2captcha_key: z.string().optional(),
    captcha_enabled: z.enum(['true', 'false']).optional(),
    bein_login_url: z.string().url('رابط غير صالح').optional(),
})

