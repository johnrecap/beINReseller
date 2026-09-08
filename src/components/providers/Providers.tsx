'use client'

import { SessionProvider } from 'next-auth/react'
import { ThemeProvider } from 'next-themes'
import { ReactNode, useEffect } from 'react'
import { useTranslation } from '@/hooks/useTranslation'
import { usePathname } from 'next/navigation'

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
    const isPanelLogin = usePathname() === '/login'
    return (
        <SessionProvider
            key={isPanelLogin ? 'panel-login' : 'application'}
            session={isPanelLogin ? null : undefined}
            refetchOnWindowFocus={!isPanelLogin}
        >
            <ThemeProvider
                attribute="class"
                defaultTheme="dark"
                forcedTheme="dark"
                enableSystem={false}
                disableTransitionOnChange={false}
            >
                <LanguageSync />
                {children}
            </ThemeProvider>
        </SessionProvider>
    )
}

