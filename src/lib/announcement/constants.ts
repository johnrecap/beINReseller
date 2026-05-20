/**
 * Announcement Domain — Shared Constants
 * ========================================
 * Single source of truth for all announcement-related
 * literals, limits, and defaults.
 */

/* ── Allowed Values ──────────────────────────────────── */

export const ANIMATION_TYPES = ['gradient', 'typing', 'glow', 'slide', 'marquee', 'none'] as const
export type AnimationType = (typeof ANIMATION_TYPES)[number]

export const TEXT_SIZES = ['small', 'medium', 'large'] as const
export type TextSize = (typeof TEXT_SIZES)[number]

export const POSITIONS = ['top', 'bottom', 'floating'] as const
export type BannerPosition = (typeof POSITIONS)[number]

export const DISPLAY_MODES = ['banner', 'slider', 'mixed'] as const
export type AnnouncementDisplayMode = (typeof DISPLAY_MODES)[number]

export const IMAGE_FITS = ['cover', 'contain'] as const
export type AnnouncementImageFit = (typeof IMAGE_FITS)[number]

export const TICKER_SPEEDS = ['slow', 'normal', 'fast'] as const
export type AnnouncementTickerSpeed = (typeof TICKER_SPEEDS)[number]

export const TICKER_DIRECTIONS = ['auto', 'rtl', 'ltr'] as const
export type AnnouncementTickerDirection = (typeof TICKER_DIRECTIONS)[number]

export const TICKER_POSITIONS = ['top', 'below', 'bottom'] as const
export type AnnouncementTickerPosition = (typeof TICKER_POSITIONS)[number]

/* ── Limits ──────────────────────────────────────────── */

export const MESSAGE_MAX_LENGTH = 500
export const IMAGE_ALT_MAX_LENGTH = 120
export const SLIDE_TITLE_MAX_LENGTH = 120
export const SLIDE_DESCRIPTION_MAX_LENGTH = 240
export const SLIDE_LINK_LABEL_MAX_LENGTH = 40
export const TICKER_TEXT_MAX_LENGTH = 500
export const MAX_ANNOUNCEMENT_SLIDES = 20
export const MIN_SLIDER_INTERVAL_MS = 3000
export const MAX_SLIDER_INTERVAL_MS = 15000

export const ANNOUNCEMENT_IMAGE_PURPOSES = ['main', 'slide'] as const
export type AnnouncementImagePurpose = (typeof ANNOUNCEMENT_IMAGE_PURPOSES)[number]

export const ANNOUNCEMENT_IMAGE_DIMENSION_RULES = {
    main: {
        minWidth: 1200,
        minHeight: 300,
        recommendedWidth: 1600,
        recommendedHeight: 400,
        aspectRatio: 4,
    },
    slide: {
        minWidth: 800,
        minHeight: 450,
        recommendedWidth: 1200,
        recommendedHeight: 675,
        aspectRatio: 16 / 9,
    },
} as const

/* ── Default Colors ──────────────────────────────────── */

export const DEFAULT_GRADIENT_COLORS = ['#ff0080', '#ff8c00', '#40e0d0', '#ff0080']

export const PRESET_GRADIENTS = [
    { name: 'Matrix', nameAr: 'ماتريكس', colors: ['#00ff00', '#00cc00', '#00ff00'] },
    { name: 'Fire', nameAr: 'ناري', colors: ['#ff0080', '#ff8c00', '#ffff00'] },
    { name: 'Ocean', nameAr: 'بحري', colors: ['#00d2ff', '#3a7bd5', '#00d2ff'] },
    { name: 'Neon', nameAr: 'نيون', colors: ['#00ff87', '#60efff', '#00ff87'] },
    { name: 'Rainbow', nameAr: 'قوس قزح', colors: ['#ff0080', '#ff8c00', '#40e0d0', '#8e2de2', '#ff0080'] },
] as const

/* ── UI Option Lists ────────────────────────────────── */

export const ANIMATION_TYPE_OPTIONS = [
    { value: 'gradient' as const, labelEn: 'Gradient', labelAr: 'تدرج' },
    { value: 'typing' as const, labelEn: 'Typing', labelAr: 'كتابة' },
    { value: 'glow' as const, labelEn: 'Glow', labelAr: 'توهج' },
    { value: 'slide' as const, labelEn: 'Slide', labelAr: 'انزلاق' },
    { value: 'marquee' as const, labelEn: 'Marquee', labelAr: 'شريط متحرك' },
    { value: 'none' as const, labelEn: 'None', labelAr: 'بدون' },
]

export const TEXT_SIZE_OPTIONS = [
    { value: 'small' as const, labelEn: 'Small', labelAr: 'صغير' },
    { value: 'medium' as const, labelEn: 'Medium', labelAr: 'متوسط' },
    { value: 'large' as const, labelEn: 'Large', labelAr: 'كبير' },
]

export const POSITION_OPTIONS = [
    { value: 'top' as const, labelEn: 'Top', labelAr: 'أعلى' },
    { value: 'bottom' as const, labelEn: 'Bottom', labelAr: 'أسفل' },
    { value: 'floating' as const, labelEn: 'Floating', labelAr: 'عائم' },
]

export const DISPLAY_MODE_OPTIONS = [
    { value: 'banner' as const, labelEn: 'Banner' },
    { value: 'slider' as const, labelEn: 'Slider' },
    { value: 'mixed' as const, labelEn: 'Banner and slider' },
]

export const IMAGE_FIT_OPTIONS = [
    { value: 'cover' as const, labelEn: 'Cover' },
    { value: 'contain' as const, labelEn: 'Contain' },
]

export const TICKER_SPEED_OPTIONS = [
    { value: 'slow' as const, labelEn: 'Slow' },
    { value: 'normal' as const, labelEn: 'Normal' },
    { value: 'fast' as const, labelEn: 'Fast' },
]

export const TICKER_DIRECTION_OPTIONS = [
    { value: 'auto' as const, labelEn: 'Auto' },
    { value: 'rtl' as const, labelEn: 'Right to left' },
    { value: 'ltr' as const, labelEn: 'Left to right' },
]

export const TICKER_POSITION_OPTIONS = [
    { value: 'top' as const, labelEn: 'Top' },
    { value: 'below' as const, labelEn: 'Below announcement' },
    { value: 'bottom' as const, labelEn: 'Bottom' },
]

/* ── Text Size CSS Classes ──────────────────────────── */

export const TEXT_SIZE_CLASSES: Record<TextSize, string> = {
    small: 'text-sm',
    medium: 'text-base',
    large: 'text-lg md:text-xl',
}


