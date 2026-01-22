'use client'

import { SessionProvider } from 'next-auth/react'
import { ThemeProvider } from 'next-themes'
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
            <ThemeProvider
                attribute="class"
                defaultTheme="dark"
                enableSystem
                disableTransitionOnChange={false}
            >
                <LanguageSync />
                {children}
            </ThemeProvider>
        </SessionProvider>
    )
}

