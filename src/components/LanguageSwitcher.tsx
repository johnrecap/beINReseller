'use client'
import { useStore } from '@/store/useStore'
import { languages } from '@/i18n/config'

export default function LanguageSwitcher() {
    const { language, setLanguage } = useStore()

    return (
        <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            aria-label="اختيار اللغة"
            className="bg-transparent border border-gray-600 rounded px-2 py-1 text-sm bg-gray-800 focus:outline-none focus:border-brand"
        >
            {Object.entries(languages).map(([code, lang]) => (
                <option key={code} value={code} className="bg-gray-800">
                    {lang.flag} {lang.name}
                </option>
            ))}
        </select>
    )
}
