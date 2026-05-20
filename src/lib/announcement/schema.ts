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
    DISPLAY_MODES,
    IMAGE_FITS,
    TICKER_SPEEDS,
    TICKER_DIRECTIONS,
    TICKER_POSITIONS,
    MESSAGE_MAX_LENGTH,
    IMAGE_ALT_MAX_LENGTH,
    SLIDE_TITLE_MAX_LENGTH,
    SLIDE_DESCRIPTION_MAX_LENGTH,
    SLIDE_LINK_LABEL_MAX_LENGTH,
    TICKER_TEXT_MAX_LENGTH,
    MAX_ANNOUNCEMENT_SLIDES,
    MIN_SLIDER_INTERVAL_MS,
    MAX_SLIDER_INTERVAL_MS,
} from './constants'
import { isSafeAnnouncementLink } from './helpers'

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
const displayModeField = z.enum(DISPLAY_MODES)
const imageFitField = z.enum(IMAGE_FITS)
const tickerSpeedField = z.enum(TICKER_SPEEDS)
const tickerDirectionField = z.enum(TICKER_DIRECTIONS)
const tickerPositionField = z.enum(TICKER_POSITIONS)

const colorsField = z
    .array(z.string())
    .default([])

const hexColorField = z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Invalid color value')

const safeLinkField = z
    .string()
    .trim()
    .refine(isSafeAnnouncementLink, 'Unsafe slide link')
    .transform(v => v.length > 0 ? v : null)
    .nullable()
    .optional()

const dateField = z
    .string()
    .nullable()
    .optional()
    .transform(v => {
        if (!v || v.trim().length === 0) return null
        const d = new Date(v)
        return isNaN(d.getTime()) ? null : d
    })

export const announcementSlideSchema = z.object({
    id: z.string().optional(),
    imageUrl: imageUrlField.refine(Boolean, 'Slide image is required'),
    imageAlt: imageAltField,
    title: z.string().max(SLIDE_TITLE_MAX_LENGTH).transform(v => v.trim()).nullable().optional(),
    description: z.string().max(SLIDE_DESCRIPTION_MAX_LENGTH).transform(v => v.trim()).nullable().optional(),
    linkLabel: z.string().max(SLIDE_LINK_LABEL_MAX_LENGTH).transform(v => v.trim()).nullable().optional(),
    linkUrl: safeLinkField,
    sortOrder: z.number().int().min(0).default(0),
    isActive: z.boolean().default(true),
    imageFit: imageFitField.default('cover'),
})

const slidesField = z
    .array(announcementSlideSchema)
    .max(MAX_ANNOUNCEMENT_SLIDES, `Maximum ${MAX_ANNOUNCEMENT_SLIDES} slides allowed`)
    .default([])

const sliderIntervalField = z
    .number()
    .int()
    .min(MIN_SLIDER_INTERVAL_MS)
    .max(MAX_SLIDER_INTERVAL_MS)

const tickerTextField = z
    .string()
    .max(TICKER_TEXT_MAX_LENGTH, `Ticker text must be under ${TICKER_TEXT_MAX_LENGTH} characters`)
    .transform(v => {
        const trimmed = v.trim()
        return trimmed.length > 0 ? trimmed : null
    })
    .nullable()
    .optional()

function hasRenderableAnnouncementContent(data: {
    message?: string
    imageUrl?: string | null
    slides?: Array<{ isActive?: boolean }>
    tickerEnabled?: boolean
    tickerText?: string | null
}) {
    const msg = data.message?.trim() || ''
    const img = typeof data.imageUrl === 'string' ? data.imageUrl.trim() : ''
    const activeSlides = data.slides?.some(slide => slide.isActive !== false) ?? false
    const ticker = Boolean(data.tickerEnabled && data.tickerText?.trim())
    return msg.length > 0 || img.length > 0 || activeSlides || ticker
}

function tickerHasRequiredText(data: { tickerEnabled?: boolean; tickerText?: string | null }) {
    return !data.tickerEnabled || Boolean(data.tickerText?.trim())
}

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
        isDismissable: z.boolean().default(true),
        displayMode: displayModeField.default('banner'),
        imageFit: imageFitField.default('cover'),
        sliderEnabled: z.boolean().default(false),
        sliderAutoplay: z.boolean().default(false),
        sliderIntervalMs: sliderIntervalField.default(4800),
        sliderCardsDesktop: z.number().int().min(1).max(6).default(3),
        sliderCardsTablet: z.number().int().min(1).max(4).default(2),
        sliderCardsMobile: z.number().int().min(1).max(2).default(1),
        tickerEnabled: z.boolean().default(false),
        tickerText: tickerTextField,
        tickerSpeed: tickerSpeedField.default('normal'),
        tickerDirection: tickerDirectionField.default('auto'),
        tickerPosition: tickerPositionField.default('below'),
        tickerBackgroundColor: hexColorField.default('#111827'),
        tickerTextColor: hexColorField.default('#ffffff'),
        dismissalVersion: z.number().int().min(1).default(1),
        slides: slidesField,
        startDate: dateField,
        endDate: dateField,
    })
    .refine(
        hasRenderableAnnouncementContent,
        { message: 'Provide announcement text, image, slide, or ticker', path: ['message'] }
    )
    .refine(
        tickerHasRequiredText,
        { message: 'Ticker text is required when ticker is enabled', path: ['tickerText'] }
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
        isDismissable: z.boolean().optional(),
        displayMode: displayModeField.optional(),
        imageFit: imageFitField.optional(),
        sliderEnabled: z.boolean().optional(),
        sliderAutoplay: z.boolean().optional(),
        sliderIntervalMs: sliderIntervalField.optional(),
        sliderCardsDesktop: z.number().int().min(1).max(6).optional(),
        sliderCardsTablet: z.number().int().min(1).max(4).optional(),
        sliderCardsMobile: z.number().int().min(1).max(2).optional(),
        tickerEnabled: z.boolean().optional(),
        tickerText: tickerTextField,
        tickerSpeed: tickerSpeedField.optional(),
        tickerDirection: tickerDirectionField.optional(),
        tickerPosition: tickerPositionField.optional(),
        tickerBackgroundColor: hexColorField.optional(),
        tickerTextColor: hexColorField.optional(),
        dismissalVersion: z.number().int().min(1).optional(),
        slides: slidesField.optional(),
        startDate: dateField,
        endDate: dateField,
    })
    .refine(
        tickerHasRequiredText,
        { message: 'Ticker text is required when ticker is enabled', path: ['tickerText'] }
    )

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
    displayMode?: string
    imageFit?: string
    sliderEnabled?: boolean
    sliderAutoplay?: boolean
    sliderIntervalMs?: number
    ticker?: {
        enabled: true
        text: string
        speed: string
        direction: string
        position: string
        backgroundColor: string
        textColor: string
    } | null
    isDismissable?: boolean
    dismissalVersion?: number
    slides?: Array<{
        id: string
        imageUrl: string
        imageAlt: string | null
        title: string | null
        description: string | null
        linkLabel: string | null
        linkUrl: string | null
        sortOrder: number
        imageFit: string
    }>
    updatedAt: string
}
