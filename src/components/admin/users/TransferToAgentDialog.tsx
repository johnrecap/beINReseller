'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, X } from 'lucide-react'

type TransferUser = {
    id: string
    username: string
}

type AgentOption = {
    id: string
    username: string
    isActive: boolean
    profile: {
        displayName: string
        defaultSourceGroup: string
        whatsappHandoffGroupUrl: string
        isActive: boolean
    }
}

interface TransferToAgentDialogProps {
    isOpen: boolean
    onClose: () => void
    onSuccess: () => void
    user: TransferUser | null
}

export default function TransferToAgentDialog({ isOpen, onClose, onSuccess, user }: TransferToAgentDialogProps) {
    const [agents, setAgents] = useState<AgentOption[]>([])
    const [agentId, setAgentId] = useState('')
    const [sourceGroup, setSourceGroup] = useState('')
    const [whatsappGroupUrl, setWhatsappGroupUrl] = useState('')
    const [loadingAgents, setLoadingAgents] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const selectedAgent = useMemo(
        () => agents.find((agent) => agent.id === agentId) || null,
        [agents, agentId]
    )

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
                setAgents(activeAgents)
                setAgentId(activeAgents[0]?.id || '')
                setSourceGroup(activeAgents[0]?.profile?.defaultSourceGroup || '')
                setWhatsappGroupUrl(activeAgents[0]?.profile?.whatsappHandoffGroupUrl || '')
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
    }, [isOpen])

    useEffect(() => {
        if (!selectedAgent) return
        setSourceGroup((current) => current || selectedAgent.profile.defaultSourceGroup || '')
        setWhatsappGroupUrl((current) => current || selectedAgent.profile.whatsappHandoffGroupUrl || '')
    }, [selectedAgent])

    async function submitTransfer(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        if (!user || !agentId) return

        setSubmitting(true)
        setError(null)

        try {
            const response = await fetch('/api/admin/agent-assignments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: user.id,
                    agentId,
                    sourceGroup,
                    whatsappGroupUrl,
                    replaceExisting: true,
                }),
            })
            const payload = await response.json().catch(() => null)
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
            <div className="bg-card rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200 border border-border">
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
                                const nextAgentId = event.target.value
                                const nextAgent = agents.find((agent) => agent.id === nextAgentId)
                                setAgentId(nextAgentId)
                                setSourceGroup(nextAgent?.profile.defaultSourceGroup || '')
                                setWhatsappGroupUrl(nextAgent?.profile.whatsappHandoffGroupUrl || '')
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
                            onChange={(event) => setSourceGroup(event.target.value)}
                            placeholder={selectedAgent?.profile.defaultSourceGroup || 'main-group'}
                            className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:border-purple-500 bg-background text-foreground text-sm"
                        />
                    </label>

                    <label className="block space-y-2">
                        <span className="text-sm font-medium text-foreground">WhatsApp Group Link</span>
                        <input
                            value={whatsappGroupUrl}
                            onChange={(event) => setWhatsappGroupUrl(event.target.value)}
                            placeholder="https://chat.whatsapp.com/..."
                            className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:border-purple-500 bg-background text-foreground text-sm"
                        />
                    </label>

                    <p className="text-xs text-muted-foreground">
                        This will remove manager/admin ownership and make the selected agent the active owner for future workflows.
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
                            disabled={submitting || loadingAgents || !agentId}
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
