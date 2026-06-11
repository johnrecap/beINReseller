'use client'

import { Wallet } from 'lucide-react'
import { motion } from 'framer-motion'
import { StatCard } from '@/components/ui/StatCard'
import { useCountUp } from '@/hooks/useCountUp'
import { useTranslation } from '@/hooks/useTranslation'

function AnimatedBalance({ value }: { value: number }) {
    const animatedValue = useCountUp(value, { duration: 1200, decimals: 2, easing: 'easeOut' })

    return (
        <span className="font-bold text-[36px] gradient-text">
            {animatedValue}
        </span>
    )
}

export default function DashboardBalanceCard({ balance }: { balance: number }) {
    const { t } = useTranslation()

    return (
        <motion.div
            className="max-w-md"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
        >
            <StatCard
                title={t.dashboard.myBalance}
                value={<AnimatedBalance value={balance} />}
                icon={Wallet}
                description={t.header.currency}
                isHero
            />
        </motion.div>
    )
}
