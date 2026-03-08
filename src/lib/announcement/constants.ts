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

/* ── Limits ──────────────────────────────────────────── */

export const MESSAGE_MAX_LENGTH = 500
export const IMAGE_ALT_MAX_LENGTH = 120

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

/* ── Text Size CSS Classes ──────────────────────────── */

export const TEXT_SIZE_CLASSES: Record<TextSize, string> = {
    small: 'text-sm',
    medium: 'text-base',
    large: 'text-lg md:text-xl',
}

/* ── Dismiss ────────────────────────────────────────── */

export const DISMISS_DURATION_MS = 24 * 60 * 60 * 1000 // 24 hours
