'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useTranslation } from '@/hooks/useTranslation'
import { buildOwnershipTransferRequest } from '@/lib/users/ownership-transfer-request'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'

type TransferUser = {
    id: string
    username: string
    currentOwner: {
        type: string
        id: string | null
        ownershipToken: string
        agentAssignment: {
            sourceGroup: string | null
            whatsappConfigured: boolean
        } | null
    }
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

const targetTypeOptions: TargetType[] = ['ADMIN', 'MANAGER', 'AGENT']

function optionsForType(targets: TargetsResponse['targets'] | null, type: TargetType): OwnerTarget[] {
    if (!targets) return []
    if (type === 'ADMIN') return targets.admins
    if (type === 'MANAGER') return targets.managers
    return targets.agents
}

export default function TransferOwnershipDialog({ isOpen, onClose, onSuccess, user }: TransferOwnershipDialogProps) {
    const { t } = useTranslation()
    const [targets, setTargets] = useState<TargetsResponse['targets'] | null>(null)
    const [targetOwnerType, setTargetOwnerType] = useState<TargetType>('ADMIN')
    const [targetOwnerId, setTargetOwnerId] = useState('')
    const [sourceGroup, setSourceGroup] = useState('')
    const [whatsappGroupUrl, setWhatsappGroupUrl] = useState('')
    const [sourceGroupTouched, setSourceGroupTouched] = useState(false)
    const [whatsappGroupUrlTouched, setWhatsappGroupUrlTouched] = useState(false)
    const [reason, setReason] = useState('')
    const [loadingTargets, setLoadingTargets] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [ownershipChanged, setOwnershipChanged] = useState(false)
    const [loadAttempt, setLoadAttempt] = useState(0)

    const ownerOptions = useMemo(
        () => optionsForType(targets, targetOwnerType),
        [targets, targetOwnerType]
    )
    const selectedOwner = useMemo(
        () => ownerOptions.find((target) => target.id === targetOwnerId) || null,
        [ownerOptions, targetOwnerId]
    )
    const isSameAgentTarget = targetOwnerType === 'AGENT'
        && user?.currentOwner.type === 'AGENT'
        && user.currentOwner.id === selectedOwner?.id

    useEffect(() => {
        if (!isOpen) return

        let cancelled = false
        async function loadTargets() {
            setLoadingTargets(true)
            setError(null)
            setTargets(null)

            try {
                const response = await fetch('/api/admin/user-ownership/targets', { cache: 'no-store' })
                if (!response.ok) {
                    throw new Error(t.common.loadTransferTargetsFailed)
                }

                const payload = await response.json()

                if (cancelled) return
                setTargets(payload.targets)
                setTargetOwnerType('ADMIN')
                setTargetOwnerId('')
                setSourceGroup('')
                setWhatsappGroupUrl('')
                setSourceGroupTouched(false)
                setWhatsappGroupUrlTouched(false)
                setReason('')
                setOwnershipChanged(false)
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : t.common.loadTransferTargetsFailed)
                }
            } finally {
                if (!cancelled) setLoadingTargets(false)
            }
        }

        void loadTargets()
        return () => {
            cancelled = true
        }
    }, [isOpen, loadAttempt, t.common.loadTransferTargetsFailed])

    useEffect(() => {
        if (targetOwnerId && !ownerOptions.some((target) => target.id === targetOwnerId)) {
            setTargetOwnerId('')
        }
    }, [ownerOptions, targetOwnerId])

    useEffect(() => {
        if (targetOwnerType !== 'AGENT' || !user) {
            setSourceGroup('')
            setWhatsappGroupUrl('')
            setSourceGroupTouched(false)
            setWhatsappGroupUrlTouched(false)
            return
        }

        const sameAgentAssignment = isSameAgentTarget
            ? user.currentOwner.agentAssignment
            : null
        setSourceGroup(sameAgentAssignment ? sameAgentAssignment.sourceGroup ?? '' : selectedOwner?.defaultSourceGroup ?? '')
        setWhatsappGroupUrl('')
        setSourceGroupTouched(false)
        setWhatsappGroupUrlTouched(false)
    }, [isSameAgentTarget, selectedOwner, targetOwnerType, user])

    async function submitTransfer(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        if (!user || !targetOwnerId) return

        setSubmitting(true)
        setError(null)
        setOwnershipChanged(false)

        try {
            const requestBody = buildOwnershipTransferRequest({
                userId: user.id,
                targetOwnerType,
                targetOwnerId,
                expectedOwnershipToken: user.currentOwner.ownershipToken,
                reason,
                sourceGroup,
                whatsappGroupUrl,
                sourceGroupTouched,
                whatsappGroupUrlTouched,
            })

            const response = await fetch('/api/admin/user-ownership', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            })
            const payload = await response.json().catch(() => null)
            if (response.status === 409) {
                setOwnershipChanged(true)
                setError(t.common.ownershipChanged)
                return
            }
            if (!response.ok) {
                if (payload?.error === 'INVALID_WHATSAPP_GROUP_URL') {
                    throw new Error(t.common.invalidWhatsappGroupLink)
                }
                throw new Error(t.common.transferOwnershipFailed)
            }

            onSuccess()
            onClose()
        } catch (err) {
            setError(err instanceof Error ? err.message : t.common.transferOwnershipFailed)
        } finally {
            setSubmitting(false)
        }
    }

    if (!isOpen || !user) return null

    const targetTypeLabel = (type: TargetType) => {
        if (type === 'ADMIN') return t.common.ownerAdmin
        if (type === 'MANAGER') return t.common.ownerManager
        return t.common.ownerAgent
    }

    return (
        <Dialog
            open={isOpen}
            onOpenChange={(open) => {
                if (!open && !submitting) onClose()
            }}
        >
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{t.common.transferOwner}: {user.username}</DialogTitle>
                    <DialogDescription>{t.common.transferPreservesAccountData}</DialogDescription>
                </DialogHeader>

                <form onSubmit={submitTransfer} className="space-y-4">
                    <label className="block space-y-2">
                        <span className="text-sm font-medium text-foreground">{t.common.targetType}</span>
                        <select
                            value={targetOwnerType}
                            onChange={(event) => setTargetOwnerType(event.target.value as TargetType)}
                            disabled={loadingTargets}
                            className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:border-purple-500 bg-background text-foreground text-sm"
                        >
                            {targetTypeOptions.map((option) => (
                                <option key={option} value={option}>{targetTypeLabel(option)}</option>
                            ))}
                        </select>
                    </label>

                    <label className="block space-y-2">
                        <span className="text-sm font-medium text-foreground">{t.common.targetOwner}</span>
                        <select
                            value={targetOwnerId}
                            onChange={(event) => setTargetOwnerId(event.target.value)}
                            disabled={loadingTargets}
                            className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:border-purple-500 bg-background text-foreground text-sm"
                        >
                            <option value="">
                                {loadingTargets
                                    ? t.common.loading
                                    : ownerOptions.length === 0
                                        ? t.common.noTransferTargets
                                        : t.common.selectOwner}
                            </option>
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
                                <span className="text-sm font-medium text-foreground">{t.common.sourceGroupLabel}</span>
                                <input
                                    value={sourceGroup}
                                    onChange={(event) => {
                                        setSourceGroup(event.target.value)
                                        setSourceGroupTouched(true)
                                    }}
                                    maxLength={120}
                                    placeholder={isSameAgentTarget
                                        ? t.common.withoutGroup
                                        : selectedOwner?.defaultSourceGroup || t.common.withoutGroup}
                                    className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:border-purple-500 bg-background text-foreground text-sm"
                                />
                                <span className="block text-xs text-muted-foreground">
                                    {t.common.agentDefaultSourceGroupHint}
                                </span>
                            </label>

                            <label className="block space-y-2">
                                <span className="text-sm font-medium text-foreground">{t.common.whatsappGroupLinkLabel}</span>
                                <input
                                    type="url"
                                    dir="ltr"
                                    value={whatsappGroupUrl}
                                    onChange={(event) => {
                                        setWhatsappGroupUrl(event.target.value)
                                        setWhatsappGroupUrlTouched(true)
                                    }}
                                    maxLength={500}
                                    placeholder="https://chat.whatsapp.com/..."
                                    className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:border-purple-500 bg-background text-foreground text-sm"
                                />
                                {isSameAgentTarget
                                    && user.currentOwner.agentAssignment?.whatsappConfigured
                                    && !whatsappGroupUrlTouched ? (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setWhatsappGroupUrl('')
                                                setWhatsappGroupUrlTouched(true)
                                            }}
                                            className="text-xs font-medium text-red-400 hover:text-red-300"
                                        >
                                            {t.common.clearSavedWhatsappLink}
                                        </button>
                                    ) : null}
                                <span className="block text-xs text-muted-foreground">
                                    {t.common.whatsappAssignmentHint}
                                </span>
                            </label>
                        </>
                    )}

                    <label className="block space-y-2">
                        <span className="text-sm font-medium text-foreground">{t.common.transferReason}</span>
                        <input
                            value={reason}
                            onChange={(event) => setReason(event.target.value)}
                            placeholder={t.common.optionalNote}
                            className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:border-purple-500 bg-background text-foreground text-sm"
                        />
                    </label>

                    {error && (
                        <div className="space-y-2 rounded-lg bg-red-50 p-3 text-xs text-red-600 dark:bg-red-900/20 dark:text-red-400" role="alert">
                            {error}
                            {ownershipChanged ? (
                                <button
                                    type="button"
                                    onClick={() => {
                                        onSuccess()
                                        onClose()
                                    }}
                                    className="block font-semibold underline underline-offset-2"
                                >
                                    {t.common.refreshAndReconfirm}
                                </button>
                            ) : !targets && !loadingTargets ? (
                                <button
                                    type="button"
                                    onClick={() => setLoadAttempt((attempt) => attempt + 1)}
                                    className="block font-semibold underline underline-offset-2"
                                >
                                    {t.common.retry}
                                </button>
                            ) : null}
                        </div>
                    )}

                    <DialogFooter className="gap-3 pt-2 sm:space-x-0">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2 text-sm font-medium text-muted-foreground bg-secondary rounded-lg hover:bg-secondary/80"
                        >
                            {t.common.cancel}
                        </button>
                        <button
                            type="submit"
                            disabled={submitting || loadingTargets || !targetOwnerId || ownershipChanged}
                            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-60 flex items-center justify-center gap-2"
                        >
                            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                            {t.common.transferAction}
                        </button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
