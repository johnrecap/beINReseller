'use client'

import { useState, useEffect } from 'react'
import { OPERATION_PRICES } from '@/lib/constants'

type Prices = typeof OPERATION_PRICES

export function usePrices() {
    const [prices, setPrices] = useState<Prices>(OPERATION_PRICES)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const fetchPrices = async () => {
            try {
                const res = await fetch('/api/prices')
                if (!res.ok) throw new Error('Failed to fetch prices')
                const data = await res.json()
                setPrices(data)
                setLoading(false)
            } catch (err) {
                console.error('Error fetching prices:', err)
                setError('Failed to load prices')
                setLoading(false)
            }
        }

        fetchPrices()
    }, [])

    const getPrice = (key: keyof Prices) => {
        return prices[key] || OPERATION_PRICES[key]
    }

    return { prices, loading, error, getPrice }
}
