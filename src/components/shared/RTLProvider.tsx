'use client'

import { ReactNode } from 'react'

interface RTLProviderProps {
    children: ReactNode
}

/**
 * RTL Provider Component
 * Wraps the application with RTL (Right-to-Left) support for Arabic language
 */
export function RTLProvider({ children }: RTLProviderProps) {
    return (
        <div dir="rtl" lang="ar" className="font-arabic min-h-screen">
            {children}
        </div>
    )
}

export default RTLProvider
