/**
 * Announcement Domain — Zod Validation Schemas
 * ===============================================
 * Shared between admin API routes and (optionally) the admin form.
 */

import { z } from 'zod'
import {
    ANIMATION_TYPES,
    TEXT_SIZES,
    POSITIONS,
    MESSAGE_MAX_LENGTH,
    IMAGE_ALT_MAX_LENGTH,
} from './constants'

/* ── Base field schemas ──────────────────────────────── */

const messageField = z
    .string()
    .max(MESSAGE_MAX_LENGTH, `Message must be under ${MESSAGE_MAX_LENGTH} characters`)
    .transform(v => v.trim())

const imageUrlField = z
    .string()
    .refine(v => v.trim().length === 0 || v.startsWith('/uploads/'), 'Invalid image URL')
    .transform(v => {
        const trimmed = v.trim()
        return trimmed.length > 0 ? trimmed : null
    })
    .nullable()
    .optional()

const imageAltField = z
    .string()
    .max(IMAGE_ALT_MAX_LENGTH, `Image alt text must be under ${IMAGE_ALT_MAX_LENGTH} characters`)
    .transform(v => {
        const trimmed = v.trim()
        return trimmed.length > 0 ? trimmed : null
    })
    .nullable()
    .optional()

const animationTypeField = z.enum(ANIMATION_TYPES)
const textSizeField = z.enum(TEXT_SIZES)
const positionField = z.enum(POSITIONS)

const colorsField = z
    .array(z.string())
    .default([])

const dateField = z
    .string()
    .nullable()
    .optional()
    .transform(v => {
        if (!v || v.trim().length === 0) return null
        const d = new Date(v)
        return isNaN(d.getTime()) ? null : d
    })

/* ── Create Schema ──────────────────────────────────── */

export const createAnnouncementSchema = z
    .object({
        message: messageField.default(''),
        imageUrl: imageUrlField,
        imageAlt: imageAltField,
        isActive: z.boolean().default(true),
        animationType: animationTypeField.default('gradient'),
        colors: colorsField,
        textSize: textSizeField.default('medium'),
        position: positionField.default('top'),
        startDate: dateField,
        endDate: dateField,
    })
    .refine(
        data => {
            const msg = data.message?.trim() || ''
            const img = typeof data.imageUrl === 'string' ? data.imageUrl.trim() : ''
            return msg.length > 0 || img.length > 0
        },
        { message: 'Provide announcement text or image', path: ['message'] }
    )
    .refine(
        data => {
            if (data.startDate && data.endDate) {
                return data.endDate >= data.startDate
            }
            return true
        },
        { message: 'End date must be after start date', path: ['endDate'] }
    )

export type CreateAnnouncementInput = z.input<typeof createAnnouncementSchema>

/* ── Update Schema (all fields optional) ────────────── */

export const updateAnnouncementSchema = z
    .object({
        message: messageField.optional(),
        imageUrl: imageUrlField,
        imageAlt: imageAltField,
        isActive: z.boolean().optional(),
        animationType: animationTypeField.optional(),
        colors: colorsField.optional(),
        textSize: textSizeField.optional(),
        position: positionField.optional(),
        startDate: dateField,
        endDate: dateField,
    })

export type UpdateAnnouncementInput = z.input<typeof updateAnnouncementSchema>

/* ── Public DTO type ────────────────────────────────── */

export interface PublicAnnouncementBanner {
    id: string
    message: string
    imageUrl: string | null
    imageAlt: string | null
    animationType: string
    colors: string[]
    textSize: string
    position: string
    updatedAt: string
}
