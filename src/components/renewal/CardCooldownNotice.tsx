'use client'

import { Clock } from 'lucide-react'
import { useTranslation } from '@/hooks/useTranslation'

export function CardCooldownNotice({ cardNumber, remainingSeconds }: { cardNumber: string; remainingSeconds: number }) {
    const { t } = useTranslation()
    if (remainingSeconds <= 0) return null
    const time = `${Math.floor(remainingSeconds / 60).toString().padStart(2, '0')}:${(remainingSeconds % 60).toString().padStart(2, '0')}`
    return (
        <div className="my-4 flex flex-wrap items-center gap-3 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-4">
            <Clock className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0 flex-1">
                <p className="font-medium">{t.operations.cardCooldownActive} <bdi className="font-mono">{cardNumber}</bdi></p>
                <p className="text-sm text-muted-foreground">{t.operations.cardCooldownHelp}</p>
            </div>
            <span role="timer" aria-live="off" aria-label={t.operations.cardCooldownRemaining}
                className="font-mono text-xl font-semibold tabular-nums" dir="ltr">{time}</span>
        </div>
    )
}
