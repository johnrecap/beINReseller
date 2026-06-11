'use client'

import { WalletCards } from 'lucide-react'
import QuickActionTile from '@/components/dashboard/QuickActionTile'
import { useCreditRequestVisibility } from '@/components/credit-requests/useCreditRequestVisibility'

export default function RequestCreditEntry({ userRole }: { userRole: string }) {
    const visible = useCreditRequestVisibility(userRole)

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
