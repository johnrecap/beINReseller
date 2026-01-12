'use client'
import { useStore } from '@/store/useStore'
import { ar, en, bn } from '@/i18n/translations'

const translations = { ar, en, bn }

export function useTranslation() {
    const { language } = useStore()
    const t = translations[language as keyof typeof translations] || ar

    return {
        t,
        language,
        dir: language === 'ar' ? 'rtl' : 'ltr'
    }
}
