'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Loader2, X } from 'lucide-react'

type TransferUser = {
    id: string
    username: string
}

type TargetType = 'ADMIN' | 'MANAGER' | 'AGENT'

type OwnerTarget = {
    id: string
    label: string
    username: string
    defaultSourceGroup?: string | null
}

type TargetsResponse = {
    targets: {
        admins: OwnerTarget[]
        managers: OwnerTarget[]
        agents: OwnerTarget[]
    }
}

interface TransferOwnershipDialogProps {
    isOpen: boolean
    onClose: () => void
    onSuccess: () => void
    user: TransferUser | null
}

const targetTypeOptions: Array<{ value: TargetType; label: string }> = [
    { value: 'ADMIN', label: 'Admin' },
    { value: 'MANAGER', label: 'Manager' },
    { value: 'AGENT', label: 'Agent' },
]

function optionsForType(targets: TargetsResponse['targets'] | null, type: TargetType): OwnerTarget[] {
    if (!targets) return []
    if (type === 'ADMIN') return targets.admins
    if (type === 'MANAGER') return targets.managers
    return targets.agents
}

export default function TransferOwnershipDialog({ isOpen, onClose, onSuccess, user }: TransferOwnershipDialogProps) {
    const [targets, setTargets] = useState<TargetsResponse['targets'] | null>(null)
    const [targetOwnerType, setTargetOwnerType] = useState<TargetType>('ADMIN')
    const [targetOwnerId, setTargetOwnerId] = useState('')
    const [sourceGroup, setSourceGroup] = useState('')
    const [whatsappGroupUrl, setWhatsappGroupUrl] = useState('')
    const [reason, setReason] = useState('')
    const [loadingTargets, setLoadingTargets] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const ownerOptions = useMemo(
        () => optionsForType(targets, targetOwnerType),
        [targets, targetOwnerType]
    )
    const selectedOwner = useMemo(
        () => ownerOptions.find((target) => target.id === targetOwnerId) || null,
        [ownerOptions, targetOwnerId]
    )

    useEffect(() => {
        if (!isOpen) return

        let cancelled = false
        async function loadTargets() {
            setLoadingTargets(true)
            setError(null)

            try {
                const response = await fetch('/api/admin/user-ownership/targets', { cache: 'no-store' })
                const payload = await response.json().catch(() => null)
                if (!response.ok) {
                    throw new Error(payload?.error || 'Failed to load transfer targets')
                }

                if (cancelled) return
                setTargets(payload.targets)
                const firstAdmin = payload.targets?.admins?.[0]
                setTargetOwnerType('ADMIN')
                setTargetOwnerId(firstAdmin?.id || '')
                setSourceGroup('')
                setWhatsappGroupUrl('')
                setReason('')
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : 'Failed to load transfer targets')
                }
            } finally {
                if (!cancelled) setLoadingTargets(false)
            }
        }

        void loadTargets()
        return () => {
            cancelled = true
        }
    }, [isOpen])

    useEffect(() => {
        const firstOption = ownerOptions[0]
        if (!ownerOptions.some((target) => target.id === targetOwnerId)) {
            setTargetOwnerId(firstOption?.id || '')
        }
    }, [ownerOptions, targetOwnerId])

    useEffect(() => {
        if (targetOwnerType !== 'AGENT') {
            setSourceGroup('')
            setWhatsappGroupUrl('')
            return
        }

        setSourceGroup((current) => current || selectedOwner?.defaultSourceGroup || '')
    }, [selectedOwner, targetOwnerType])

    async function submitTransfer(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        if (!user || !targetOwnerId) return

        setSubmitting(true)
        setError(null)

        try {
            const response = await fetch('/api/admin/user-ownership', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: user.id,
                    targetOwnerType,
                    targetOwnerId,
                    sourceGroup,
                    whatsappGroupUrl,
                    reason,
                }),
            })
            const payload = await response.json().catch(() => null)
            if (!response.ok) {
                throw new Error(payload?.error || 'Failed to transfer ownership')
            }

            onSuccess()
            onClose()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to transfer ownership')
        } finally {
            setSubmitting(false)
        }
    }

    if (!isOpen || !user) return null

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-card rounded-xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200 border border-border">
                <div className="flex justify-between items-center p-4 border-b border-border">
                    <h3 className="font-bold text-foreground">Transfer owner: {user.username}</h3>
                    <button onClick={onClose} title="Close" className="p-1 hover:bg-secondary rounded-lg text-muted-foreground">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={submitTransfer} className="p-4 space-y-4">
                    <label className="block space-y-2">
                        <span className="text-sm font-medium text-foreground">Target type</span>
                        <select
                            value={targetOwnerType}
                            onChange={(event) => setTargetOwnerType(event.target.value as TargetType)}
                            disabled={loadingTargets}
                            className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:border-purple-500 bg-background text-foreground text-sm"
                        >
                            {targetTypeOptions.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                    </label>

                    <label className="block space-y-2">
                        <span className="text-sm font-medium text-foreground">Target owner</span>
                        <select
                            value={targetOwnerId}
                            onChange={(event) => setTargetOwnerId(event.target.value)}
                            disabled={loadingTargets}
                            className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:border-purple-500 bg-background text-foreground text-sm"
                        >
                            <option value="">Select owner</option>
                            {ownerOptions.map((target) => (
                                <option key={target.id} value={target.id}>
                                    {target.label}
                                </option>
                            ))}
                        </select>
                    </label>

                    {targetOwnerType === 'AGENT' && (
                        <>
                            <label className="block space-y-2">
                                <span className="text-sm font-medium text-foreground">Source group</span>
                                <input
                                    value={sourceGroup}
                                    onChange={(event) => setSourceGroup(event.target.value)}
                                    placeholder={selectedOwner?.defaultSourceGroup || 'main-group'}
                                    className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:border-purple-500 bg-background text-foreground text-sm"
                                />
                            </label>

                            <label className="block space-y-2">
                                <span className="text-sm font-medium text-foreground">WhatsApp group link</span>
                                <input
                                    value={whatsappGroupUrl}
                                    onChange={(event) => setWhatsappGroupUrl(event.target.value)}
                                    placeholder="https://chat.whatsapp.com/..."
                                    className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:border-purple-500 bg-background text-foreground text-sm"
                                />
                            </label>
                        </>
                    )}

                    <label className="block space-y-2">
                        <span className="text-sm font-medium text-foreground">Reason</span>
                        <input
                            value={reason}
                            onChange={(event) => setReason(event.target.value)}
                            placeholder="Optional note"
                            className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:border-purple-500 bg-background text-foreground text-sm"
                        />
                    </label>

                    <p className="text-xs text-muted-foreground">
                        The selected owner will replace current admin, manager, or agent ownership for this user.
                    </p>

                    {error && (
                        <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs rounded-lg">
                            {error}
                        </div>
                    )}

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2 text-sm font-medium text-muted-foreground bg-secondary rounded-lg hover:bg-secondary/80"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={submitting || loadingTargets || !targetOwnerId}
                            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-60 flex items-center justify-center gap-2"
                        >
                            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                            Transfer
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
