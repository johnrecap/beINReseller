'use client'
import { useStore } from '@/store/useStore'
import { ar, en, bn } from '@/i18n/translations'

const translations = { ar, en, bn }

export function useTranslation() {
    const { language } = useStore()
    // English (en) is the fallback language for any missing translations
    const t = translations[language as keyof typeof translations] || en

    return {
        t,
        language,
        locale: language,
        dir: language === 'ar' ? 'rtl' : 'ltr'
    }
}
