'use client'

import { useEffect, useState } from 'react'
import { WalletCards } from 'lucide-react'
import QuickActionTile from '@/components/dashboard/QuickActionTile'

export default function RequestCreditEntry({ userRole }: { userRole: string }) {
    const [visible, setVisible] = useState(false)

    useEffect(() => {
        if (userRole !== 'USER') return

        let cancelled = false

        fetch('/api/credit-requests', { cache: 'no-store' })
            .then((response) => response.ok ? response.json() : null)
            .then((payload) => {
                if (!cancelled) {
                    setVisible(Boolean(payload?.eligibility?.canRequest))
                }
            })
            .catch(() => {
                if (!cancelled) setVisible(false)
            })

        return () => {
            cancelled = true
        }
    }, [userRole])

    if (!visible) return null

    return (
        <QuickActionTile
            href="/dashboard/credit-requests"
            icon={WalletCards}
            iconColor="#f59e0b"
            iconBgColor="rgba(245, 158, 11, 0.15)"
            title="Request Credit"
            description="Send a balance request to your assigned agent"
        />
    )
}
