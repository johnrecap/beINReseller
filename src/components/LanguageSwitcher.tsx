'use client'
import { useState, useRef, useEffect } from 'react'
import { useStore } from '@/store/useStore'
import { languages } from '@/i18n/config'
import { Globe, ChevronDown, Check } from 'lucide-react'
import { useTranslation } from '@/hooks/useTranslation'

export default function LanguageSwitcher() {
    const { language, setLanguage } = useStore()
    const [isOpen, setIsOpen] = useState(false)
    const dropdownRef = useRef<HTMLDivElement>(null)
    const { dir } = useTranslation()

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const currentLang = languages[language as keyof typeof languages]

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-200 transition-colors bg-gray-800/50 hover:bg-gray-800 rounded-lg border border-gray-700 hover:border-gray-600 focus:outline-none focus:ring-2 focus:ring-brand/50"
                aria-label="Select Language"
            >
                <Globe className="w-4 h-4 text-gray-400" />
                <span className="hidden sm:inline-block">{currentLang?.name}</span>
                <span className="sm:hidden">{currentLang?.flag}</span>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div
                    className={`absolute mt-2 w-48 py-1 bg-gray-900 rounded-lg shadow-xl border border-gray-800 z-50 ${dir === 'rtl' ? 'left-0' : 'right-0'}`}
                >
                    {Object.entries(languages).map(([code, lang]) => (
                        <button
                            key={code}
                            onClick={() => {
                                setLanguage(code)
                                setIsOpen(false)
                            }}
                            className={`w-full flex items-center justify-between px-4 py-2.5 text-sm transition-colors hover:bg-gray-800 ${language === code ? 'text-brand font-medium bg-gray-800/50' : 'text-gray-300'
                                }`}
                        >
                            <span className="flex items-center gap-3">
                                <span className="text-lg">{lang.flag}</span>
                                <span>{lang.name}</span>
                            </span>
                            {language === code && <Check className="w-4 h-4 text-brand" />}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}
