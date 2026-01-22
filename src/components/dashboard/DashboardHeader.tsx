'use client'

import { useTranslation } from '@/hooks/useTranslation'
import { Button } from '@/components/ui/button'
import { Home } from 'lucide-react'
import Link from 'next/link'
import { motion } from 'framer-motion'

interface DashboardHeaderProps {
    username: string
    role: 'ADMIN' | 'RESELLER'
}

export default function DashboardHeader({ username, role }: DashboardHeaderProps) {
    const { t } = useTranslation()

    return (
        <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="flex items-center justify-between mb-8"
        >
            {/* Welcome Message - Right side in RTL */}
            <div>
                <h2 className="flex items-center gap-2 text-[var(--color-text-primary)]">
                    <span className="text-[16px] text-[var(--color-text-secondary)]">
                        {t.dashboard.welcome}،
                    </span>
                    <span className="text-[16px] font-semibold text-white">
                        {username}
                    </span>
                </h2>
                <p className="text-[14px] text-[var(--color-text-muted)] mt-1">
                    {role === 'ADMIN' ? t.dashboard.adminWelcome : t.dashboard.resellerWelcome}
                </p>
            </div>

            {/* Home Button - Left side in RTL */}
            <Link href="/dashboard">
                <Button
                    variant="primary"
                    className="flex items-center gap-2 bg-gradient-to-l from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white shadow-lg"
                >
                    <Home className="w-4 h-4" />
                    <span>الرئيسية</span>
                </Button>
            </Link>
        </motion.div>
    )
}
