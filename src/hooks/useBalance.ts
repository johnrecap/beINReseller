'use client'

import { useState, useEffect, useCallback } from 'react'

interface BalanceData {
    balance: number
    loading: boolean
    refetch: () => Promise<void>
}

export function useBalance(): BalanceData {
    const [balance, setBalance] = useState<number>(0)
    const [loading, setLoading] = useState(true)

    const fetchBalance = useCallback(async () => {
        try {
            const res = await fetch('/api/user/stats')
            if (res.ok) {
                const data = await res.json()
                setBalance(data.balance || 0)
            }
        } catch (error) {
            console.error('Failed to fetch balance:', error)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchBalance()
    }, [fetchBalance])

    return { balance, loading, refetch: fetchBalance }
}
