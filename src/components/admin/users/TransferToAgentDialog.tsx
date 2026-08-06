'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { useTranslation } from '@/hooks/useTranslation'

type TransferUser = {
    id: string
    username: string
    ownershipToken: string
}

type AgentOption = {
    id: string
    username: string
    isActive: boolean
    profile: {
        displayName: string
        defaultSourceGroup: string | null
        whatsappHandoffGroupUrl: string
        isActive: boolean
    }
}

type AssignmentUser = {
    id: string
    ownershipToken: string
    activeAssignment: {
        agentId: string
        sourceGroup: string | null
        whatsappGroupUrl: string | null
    } | null
}

interface TransferToAgentDialogProps {
    isOpen: boolean
    onClose: () => void
    onSuccess: () => void
    user: TransferUser | null
}

export default function TransferToAgentDialog({ isOpen, onClose, onSuccess, user }: TransferToAgentDialogProps) {
    const { t } = useTranslation()
    const [agents, setAgents] = useState<AgentOption[]>([])
    const [assignmentUser, setAssignmentUser] = useState<AssignmentUser | null>(null)
    const [agentId, setAgentId] = useState('')
    const [sourceGroup, setSourceGroup] = useState('')
    const [whatsappGroupUrl, setWhatsappGroupUrl] = useState('')
    const [sourceGroupTouched, setSourceGroupTouched] = useState(false)
    const [whatsappGroupUrlTouched, setWhatsappGroupUrlTouched] = useState(false)
    const [loadingAgents, setLoadingAgents] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [ownershipChanged, setOwnershipChanged] = useState(false)

    const selectedAgent = useMemo(
        () => agents.find((agent) => agent.id === agentId) || null,
        [agents, agentId]
    )
    const isSameAgentTarget = assignmentUser?.activeAssignment?.agentId === selectedAgent?.id

    useEffect(() => {
        if (!isOpen) return

        let cancelled = false
        async function loadAgents() {
            setLoadingAgents(true)
            setError(null)

            try {
                const response = await fetch('/api/admin/agent-assignments', { cache: 'no-store' })
                const payload = await response.json().catch(() => null)
                if (!response.ok) {
                    throw new Error(payload?.error || 'Failed to load agents')
                }

                if (cancelled) return
                const activeAgents = (payload.agents || []).filter((agent: AgentOption) => agent.isActive && agent.profile?.isActive !== false)
                const latestUser = (payload.users || []).find((item: AssignmentUser) => item.id === user?.id) || null
                const initialAgentId = activeAgents.some((agent: AgentOption) => agent.id === latestUser?.activeAssignment?.agentId)
                    ? latestUser?.activeAssignment?.agentId || ''
                    : activeAgents[0]?.id || ''
                setAgents(activeAgents)
                setAssignmentUser(latestUser)
                setAgentId(initialAgentId)
                setOwnershipChanged(false)
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : 'Failed to load agents')
                }
            } finally {
                if (!cancelled) setLoadingAgents(false)
            }
        }

        loadAgents()
        return () => {
            cancelled = true
        }
    }, [isOpen, user])

    useEffect(() => {
        const activeAssignment = assignmentUser?.activeAssignment ?? null
        const sameAgentAssignment = activeAssignment?.agentId === selectedAgent?.id
            ? activeAssignment
            : null
        setSourceGroup(sameAgentAssignment ? sameAgentAssignment.sourceGroup ?? '' : selectedAgent?.profile.defaultSourceGroup ?? '')
        setWhatsappGroupUrl(sameAgentAssignment?.whatsappGroupUrl ?? '')
        setSourceGroupTouched(false)
        setWhatsappGroupUrlTouched(false)
    }, [assignmentUser, selectedAgent])

    async function submitTransfer(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        if (!user || !agentId) return

        setSubmitting(true)
        setError(null)

        try {
            const requestBody: Record<string, unknown> = {
                userId: user.id,
                agentId,
                replaceExisting: true,
                expectedOwnershipToken: assignmentUser?.ownershipToken || user.ownershipToken,
            }
            if (sourceGroupTouched) requestBody.sourceGroup = sourceGroup
            if (whatsappGroupUrlTouched) requestBody.whatsappGroupUrl = whatsappGroupUrl

            const response = await fetch('/api/admin/agent-assignments', {
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
                throw new Error(payload?.error || payload?.reason || 'Failed to transfer user')
            }

            onSuccess()
            onClose()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to transfer user')
        } finally {
            setSubmitting(false)
        }
    }

    if (!isOpen || !user) return null

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-border bg-card shadow-xl animate-in fade-in zoom-in duration-200">
                <div className="flex justify-between items-center p-4 border-b border-border">
                    <h3 className="font-bold text-foreground">Transfer to Agent: {user.username}</h3>
                    <button onClick={onClose} title="Close" className="p-1 hover:bg-secondary rounded-lg text-muted-foreground">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={submitTransfer} className="p-4 space-y-4">
                    <label className="block space-y-2">
                        <span className="text-sm font-medium text-foreground">Agent</span>
                        <select
                            value={agentId}
                            onChange={(event) => {
                                setAgentId(event.target.value)
                            }}
                            disabled={loadingAgents}
                            className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:border-purple-500 bg-background text-foreground text-sm"
                        >
                            <option value="">Select agent</option>
                            {agents.map((agent) => (
                                <option key={agent.id} value={agent.id}>
                                    {agent.profile.displayName || agent.username}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="block space-y-2">
                        <span className="text-sm font-medium text-foreground">Source Group</span>
                        <input
                            value={sourceGroup}
                            onChange={(event) => {
                                setSourceGroup(event.target.value)
                                setSourceGroupTouched(true)
                            }}
                            maxLength={120}
                            placeholder={isSameAgentTarget
                                ? t.common.withoutGroup
                                : selectedAgent?.profile.defaultSourceGroup || t.common.withoutGroup}
                            className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:border-purple-500 bg-background text-foreground text-sm"
                        />
                        <span className="block text-xs text-muted-foreground">
                            {t.common.agentDefaultSourceGroupHint}
                        </span>
                    </label>

                    <label className="block space-y-2">
                        <span className="text-sm font-medium text-foreground">WhatsApp Group Link</span>
                        <input
                            value={whatsappGroupUrl}
                            onChange={(event) => {
                                setWhatsappGroupUrl(event.target.value)
                                setWhatsappGroupUrlTouched(true)
                            }}
                            maxLength={500}
                            placeholder="https://chat.whatsapp.com/..."
                            className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:border-purple-500 bg-background text-foreground text-sm"
                        />
                        <span className="block text-xs text-muted-foreground">
                            {t.common.whatsappAssignmentHint}
                        </span>
                    </label>

                    <p className="text-xs text-muted-foreground">
                        {t.common.transferPreservesAccountData}
                    </p>

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
                            ) : null}
                        </div>
                    )}

                    <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2 text-sm font-medium text-muted-foreground bg-secondary rounded-lg hover:bg-secondary/80"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={submitting || loadingAgents || !agentId || ownershipChanged}
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
