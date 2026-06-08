'use client'

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, RefreshCw, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { CreditRequestListItem } from '@/lib/credit-requests/types'

type Eligibility = {
    canRequest: boolean
    reason: string
    ownerType: string | null
    ownerLabel: string | null
    agentName: string | null
    sourceGroup: string | null
}

type CreditRequestsResponse = {
    eligibility: Eligibility
    requests: CreditRequestListItem[]
}

const blockedMessages: Record<string, string> = {
    NOT_USER: 'Credit requests are available only for customer accounts.',
    INACTIVE_USER: 'This account cannot request credit right now.',
    MANAGER_OWNED: 'Credit requests are not available for users managed by a manager.',
    UNOWNED: 'Credit requests are not available until this account is assigned to admin or an agent.',
    NO_ACTIVE_AGENT_ASSIGNMENT: 'Credit requests are available only for users assigned to an agent.',
}

function ownerDescription(eligibility: Eligibility | undefined) {
    if (!eligibility) return ''
    if (eligibility.ownerType === 'AGENT') {
        return `Agent: ${eligibility.agentName || eligibility.ownerLabel || '-'} | Group: ${eligibility.sourceGroup || '-'}`
    }

    return `Owner: ${eligibility.ownerLabel || 'Admin direct'}`
}

function formatDate(value: string) {
    return new Intl.DateTimeFormat('en', {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(new Date(value))
}

function StatusBadge({ status }: { status: string }) {
    const className = status === 'PENDING'
        ? 'border-yellow-500/40 bg-yellow-500/10 text-yellow-300'
        : status === 'APPROVED'
            ? 'border-green-500/40 bg-green-500/10 text-green-300'
            : 'border-red-500/40 bg-red-500/10 text-red-300'

    return (
        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${className}`}>
            {status}
        </span>
    )
}

export default function RequestCreditForm() {
    const [data, setData] = useState<CreditRequestsResponse | null>(null)
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [amountUsd, setAmountUsd] = useState('')
    const [paymentMethod, setPaymentMethod] = useState('')
    const [notes, setNotes] = useState('')
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

    const loadData = useCallback(async () => {
        setLoading(true)
        try {
            const response = await fetch('/api/credit-requests', { cache: 'no-store' })
            const payload = await response.json()

            if (!response.ok) {
                throw new Error(payload.error || 'Failed to load credit requests')
            }

            setData(payload)
        } catch (error) {
            setMessage({
                type: 'error',
                text: error instanceof Error ? error.message : 'Failed to load credit requests',
            })
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        void loadData()
    }, [loadData])

    const blockedMessage = useMemo(() => {
        if (!data || data.eligibility.canRequest) return null
        return blockedMessages[data.eligibility.reason] || 'Credit request is not available for this account.'
    }, [data])

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        setSubmitting(true)
        setMessage(null)

        try {
            const response = await fetch('/api/credit-requests', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amountUsd,
                    paymentMethod,
                    notes,
                }),
            })
            const payload = await response.json()

            if (!response.ok) {
                if (payload.reason === 'PENDING_REQUEST_EXISTS' && payload.existingRequest) {
                    throw new Error(
                        `You already have a pending request (${payload.existingRequest.requestNumber}) for USD ${Number(payload.existingRequest.amountUsd).toFixed(2)}. Please wait for admin review before submitting another request.`
                    )
                }
                throw new Error(payload.error || 'Failed to submit credit request')
            }

            setAmountUsd('')
            setPaymentMethod('')
            setNotes('')
            setMessage({
                type: 'success',
                text: 'Credit request submitted and is pending admin review.',
            })
            await loadData()
        } catch (error) {
            setMessage({
                type: 'error',
                text: error instanceof Error ? error.message : 'Failed to submit credit request',
            })
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white">Request Credit</h1>
                    <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                        Submit a balance request for admin review.
                    </p>
                </div>
                <Button variant="outline" onClick={() => void loadData()} loading={loading}>
                    <RefreshCw className="h-4 w-4" />
                    Refresh
                </Button>
            </div>

            {message && (
                <div className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${
                    message.type === 'success'
                        ? 'border-green-500/40 bg-green-500/10 text-green-300'
                        : 'border-red-500/40 bg-red-500/10 text-red-300'
                }`}>
                    {message.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                    {message.text}
                </div>
            )}

            {loading && !data ? (
                <Card>
                    <CardContent className="pt-6 text-sm text-[var(--color-text-secondary)]">
                        Loading...
                    </CardContent>
                </Card>
            ) : blockedMessage ? (
                <Card>
                    <CardContent className="flex items-center gap-3 pt-6 text-sm text-yellow-300">
                        <AlertCircle className="h-5 w-5" />
                        {blockedMessage}
                    </CardContent>
                </Card>
            ) : (
                <Card>
                    <CardHeader>
                        <CardTitle>New Credit Request</CardTitle>
                        <CardDescription>
                            {ownerDescription(data?.eligibility)}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-3">
                            <div className="space-y-2">
                                <Label htmlFor="amountUsd">Amount USD</Label>
                                <Input
                                    id="amountUsd"
                                    type="number"
                                    min="1"
                                    step="0.01"
                                    value={amountUsd}
                                    onChange={(event) => setAmountUsd(event.target.value)}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="paymentMethod">Payment Method</Label>
                                <Input
                                    id="paymentMethod"
                                    value={paymentMethod}
                                    onChange={(event) => setPaymentMethod(event.target.value)}
                                    maxLength={80}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="notes">Notes</Label>
                                <Input
                                    id="notes"
                                    value={notes}
                                    onChange={(event) => setNotes(event.target.value)}
                                    maxLength={500}
                                />
                            </div>
                            <div className="md:col-span-3">
                                <Button type="submit" loading={submitting}>
                                    <Send className="h-4 w-4" />
                                    Submit Request
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            )}

            <Card>
                <CardHeader>
                    <CardTitle>Recent Requests</CardTitle>
                </CardHeader>
                <CardContent>
                    {!data?.requests.length ? (
                        <div className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-6 text-center text-sm text-[var(--color-text-secondary)]">
                            No credit requests yet.
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="border-b border-white/10 text-[var(--color-text-secondary)]">
                                    <tr>
                                        <th className="py-3 text-start">Order ID</th>
                                        <th className="py-3 text-start">Amount</th>
                                        <th className="py-3 text-start">Payment</th>
                                        <th className="py-3 text-start">Owner</th>
                                        <th className="py-3 text-start">Status</th>
                                        <th className="py-3 text-start">Notification</th>
                                        <th className="py-3 text-start">Created</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.requests.map((request) => (
                                        <tr key={request.id} className="border-b border-white/5">
                                            <td className="py-3 font-mono text-xs">{request.requestNumber}</td>
                                            <td className="py-3 font-semibold">USD {request.amountUsd.toFixed(2)}</td>
                                            <td className="py-3">{request.paymentMethod}</td>
                                            <td className="py-3">{request.ownerLabel || request.agentName || '-'}</td>
                                            <td className="py-3"><StatusBadge status={request.status} /></td>
                                            <td className="py-3">{request.notificationStatus || '-'}</td>
                                            <td className="py-3 text-[var(--color-text-secondary)]">{formatDate(request.createdAt)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
