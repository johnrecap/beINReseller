'use client'

import { SessionProvider } from 'next-auth/react'
import { ReactNode, useEffect } from 'react'
import { useTranslation } from '@/hooks/useTranslation'

interface ProvidersProps {
    children: ReactNode
}

function LanguageSync() {
    const { language, dir } = useTranslation()

    useEffect(() => {
        document.documentElement.lang = language
        document.documentElement.dir = dir
    }, [language, dir])

    return null
}

export default function Providers({ children }: ProvidersProps) {
    return (
        <SessionProvider>
            <LanguageSync />
            {children}
        </SessionProvider>
    )
}
