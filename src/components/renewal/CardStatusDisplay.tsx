'use client'

import { useTranslation } from '@/hooks/useTranslation'
import { Crown, Cpu, Calendar, Wallet, Zap } from 'lucide-react'

interface CardStatusProps {
    isPremium: boolean
    smartCardSerial: string
    stbNumber: string
    expiryDate: string
    walletBalance: number
    activateCount: { current: number; max: number }
}

/**
 * CardStatusDisplay - Shows beIN card status after check
 * Displays Premium badge, STB, expiry, balance, and activation count
 */
export function CardStatusDisplay({
    isPremium,
    smartCardSerial,
    stbNumber,
    expiryDate,
    walletBalance,
    activateCount
}: CardStatusProps) {
    const { t } = useTranslation()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sr = (t as any).signalRefresh || {}

    return (
        <div className="bg-gradient-to-r from-yellow-100 to-yellow-50 dark:from-yellow-900/30 dark:to-yellow-800/20 border border-yellow-300 dark:border-yellow-700 rounded-xl p-6 space-y-4">
            {/* Premium Badge */}
            {isPremium && (
                <div className="flex items-center gap-2">
                    <Crown className="w-5 h-5 text-yellow-500" />
                    <span className="font-bold text-yellow-700 dark:text-yellow-400">
                        Premium ⭐
                    </span>
                </div>
            )}

            {/* Card & STB Info */}
            <div className="flex items-start gap-3">
                <Cpu className="w-5 h-5 text-gray-500 mt-1" />
                <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                        {sr.smartCard || 'Smart Card Serial'}
                    </p>
                    <p className="font-mono font-medium text-gray-900 dark:text-white">
                        {smartCardSerial}
                        {stbNumber && (
                            <span className="text-gray-500">
                                {' → STB: '}{stbNumber}
                            </span>
                        )}
                    </p>
                </div>
            </div>

            {/* Expiry Date */}
            <div className="flex items-start gap-3">
                <Calendar className="w-5 h-5 text-green-500 mt-1" />
                <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                        {sr.expiryDate || 'Expiry Date'}
                    </p>
                    <p className="font-medium text-green-700 dark:text-green-400">
                        ✅ {sr.validUntil || 'Valid until'} {expiryDate}
                    </p>
                </div>
            </div>

            {/* Wallet Balance */}
            <div className="flex items-start gap-3">
                <Wallet className="w-5 h-5 text-blue-500 mt-1" />
                <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                        {sr.walletBalance || 'Wallet Balance'}
                    </p>
                    <p className="font-medium text-blue-700 dark:text-blue-400">
                        ${walletBalance}
                    </p>
                </div>
            </div>

            {/* Activation Count */}
            <div className="flex items-start gap-3">
                <Zap className="w-5 h-5 text-purple-500 mt-1" />
                <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                        {sr.activationsToday || 'Activations Today'}
                    </p>
                    <p className="font-medium text-purple-700 dark:text-purple-400">
                        {activateCount.current} / {activateCount.max}
                    </p>
                    {activateCount.current >= activateCount.max && (
                        <p className="text-xs text-red-500 mt-1">
                            {sr.limitReached || 'Daily limit reached'}
                        </p>
                    )}
                </div>
            </div>
        </div>
    )
}

export default CardStatusDisplay
