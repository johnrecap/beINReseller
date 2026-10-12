'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CardCooldownSnapshot } from '@/lib/operations/renewal-card-cooldown'

export function cooldownDeadline(snapshot: CardCooldownSnapshot, cardNumber: string, receivedAt: number): number | null {
    if (snapshot.cardNumber !== cardNumber) return null
    if (snapshot.cooldownUntil === null) return 0
    const until = Date.parse(snapshot.cooldownUntil)
    const serverNow = Date.parse(snapshot.serverNow)
    return Number.isFinite(until) && Number.isFinite(serverNow)
        ? receivedAt + Math.max(0, until - serverNow) : null
}

export function cooldownSeconds(deadline: number, now: number): number {
    return Math.max(0, Math.ceil((deadline - now) / 1000))
}

export function useRenewalCardCooldown(cardNumber: string, enabled: boolean, refreshKey: string) {
    const [clock, setClock] = useState(0)
    const [state, setState] = useState({ cardNumber: '', deadline: 0 })
    const generation = useRef(0)
    const requestSequence = useRef(0)
    const accept = useCallback((snapshot: CardCooldownSnapshot) => {
        const now = Date.now()
        const deadline = cooldownDeadline(snapshot, cardNumber, now)
        if (deadline === null) return
        requestSequence.current++
        setState({ cardNumber, deadline })
        setClock(now)
    }, [cardNumber])

    useEffect(() => {
        const current = ++generation.current
        if (!enabled || !/^\d{10,16}$/.test(cardNumber)) return
        const controller = new AbortController()
        const refresh = async () => {
            const request = ++requestSequence.current
            try {
                const response = await fetch(`/api/operations/start-renewal?cardNumber=${encodeURIComponent(cardNumber)}`,
                    { cache: 'no-store', signal: controller.signal })
                if (response.ok) {
                    const snapshot = await response.json()
                    if (generation.current === current && requestSequence.current === request && !controller.signal.aborted) accept(snapshot)
                }
            } catch { /* The creation API remains authoritative when a lookup is unavailable. */ }
        }
        const debounce = setTimeout(refresh, 250)
        const poll = setInterval(refresh, 30_000)
        window.addEventListener('focus', refresh)
        return () => {
            controller.abort()
            clearTimeout(debounce)
            clearInterval(poll)
            window.removeEventListener('focus', refresh)
        }
    }, [cardNumber, enabled, refreshKey, accept])

    useEffect(() => {
        if (!enabled || state.cardNumber !== cardNumber || state.deadline <= Date.now()) return
        const timer = setInterval(() => setClock(Date.now()), 1000)
        return () => clearInterval(timer)
    }, [enabled, state, cardNumber])

    return { remainingSeconds: enabled && state.cardNumber === cardNumber ? cooldownSeconds(state.deadline, clock) : 0,
        acceptCooldown: accept }
}
