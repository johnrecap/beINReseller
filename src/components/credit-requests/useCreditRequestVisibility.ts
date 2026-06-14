'use client'

import { useEffect, useState } from 'react'

export function useCreditRequestVisibility(userRole?: string | null) {
    const [canRequest, setCanRequest] = useState(false)

    useEffect(() => {
        if (userRole !== 'USER') return

        let cancelled = false

        fetch('/api/credit-requests', { cache: 'no-store' })
            .then((response) => response.ok ? response.json() : null)
            .then((payload) => {
                if (!cancelled) {
                    const reason = payload?.eligibility?.reason
                    setCanRequest(Boolean(payload?.eligibility?.canRequest)
                        || reason === 'CREDIT_LIMIT_NOT_CONFIGURED'
                        || reason === 'CREDIT_LIMIT_EXCEEDED'
                    )
                }
            })
            .catch(() => {
                if (!cancelled) setCanRequest(false)
            })

        return () => {
            cancelled = true
        }
    }, [userRole])

    return userRole === 'USER' && canRequest
}
