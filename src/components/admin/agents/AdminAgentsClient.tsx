'use client'

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, RefreshCw, ShieldCheck, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTranslation } from '@/hooks/useTranslation'
import { normalizeWhatsAppGroupInviteUrl } from '@/lib/whatsapp/group-invite-url'

type AgentProfile = {
    displayName: string
    whapiGroupId: string
    whapiGroupName: string
    whatsappHandoffGroupUrl: string
    whatsappHandoffPhone: string
    whatsappHandoffLabel: string
    whatsappNotificationsEnabled: boolean
    defaultSourceGroup: string
    isActive: boolean
}

type AgentItem = {
    id: string
    username: string
    isActive: boolean
    profile: AgentProfile
}

type UserItem = {
    id: string
    username: string
    balance: number
    isActive: boolean
    managerOwned: boolean
    ownershipToken: string
    activeAssignment: { id: string; agentId: string; sourceGroup: string | null; whatsappGroupUrl: string | null } | null
}

type AssignmentItem = {
    id: string
    sourceGroup: string | null
    whatsappGroupUrl: string | null
    ownershipToken: string
    createdAt: string
    agent: { id: string; username: string; displayName: string }
    user: { id: string; username: string; balance: number; isActive: boolean; managerOwned: boolean }
}

type ApiData = {
    agents: AgentItem[]
    users: UserItem[]
    assignments: AssignmentItem[]
}

type ProfileDraft = AgentProfile

function formatDate(value: string) {
    return new Intl.DateTimeFormat('en', {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(new Date(value))
}

function emptyProfile(): ProfileDraft {
    return {
        displayName: '',
        whapiGroupId: '',
        whapiGroupName: '',
        whatsappHandoffGroupUrl: '',
        whatsappHandoffPhone: '',
        whatsappHandoffLabel: '',
        whatsappNotificationsEnabled: false,
        defaultSourceGroup: '',
        isActive: true,
    }
}

export default function AdminAgentsClient() {
    const { t } = useTranslation()
    const [data, setData] = useState<ApiData | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    const [selectedAgentId, setSelectedAgentId] = useState('')
    const [selectedUserId, setSelectedUserId] = useState('')
    const [sourceGroup, setSourceGroup] = useState('')
    const [whatsappGroupUrl, setWhatsappGroupUrl] = useState('')
    const [sourceGroupTouched, setSourceGroupTouched] = useState(false)
    const [whatsappGroupUrlTouched, setWhatsappGroupUrlTouched] = useState(false)
    const [profileDraft, setProfileDraft] = useState<ProfileDraft>(emptyProfile())
    const [busy, setBusy] = useState<string | null>(null)

    const selectedAgent = useMemo(
        () => data?.agents.find((agent) => agent.id === selectedAgentId) || null,
        [data?.agents, selectedAgentId]
    )

    const eligibleUsers = useMemo(
        () => data?.users || [],
        [data?.users]
    )
    const selectedUser = useMemo(
        () => data?.users.find((user) => user.id === selectedUserId) || null,
        [data?.users, selectedUserId]
    )
    const isSameAgentTarget = selectedUser?.activeAssignment?.agentId === selectedAgent?.id

    const loadData = useCallback(async () => {
        setLoading(true)
        setError(null)

        try {
            const response = await fetch('/api/admin/agent-assignments', { cache: 'no-store' })
            const payload = await response.json().catch(() => null)
            if (!response.ok) {
                throw new Error(payload?.error || 'Failed to load agents')
            }

            setData(payload)
            setSelectedAgentId((current) => current || payload.agents[0]?.id || '')
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load agents')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        loadData()
    }, [loadData])

    useEffect(() => {
        if (!selectedAgent) return

        setProfileDraft({
            displayName: selectedAgent.profile.displayName,
            whapiGroupId: selectedAgent.profile.whapiGroupId,
            whapiGroupName: selectedAgent.profile.whapiGroupName,
            whatsappHandoffGroupUrl: selectedAgent.profile.whatsappHandoffGroupUrl,
            whatsappHandoffPhone: selectedAgent.profile.whatsappHandoffPhone,
            whatsappHandoffLabel: selectedAgent.profile.whatsappHandoffLabel,
            whatsappNotificationsEnabled: selectedAgent.profile.whatsappNotificationsEnabled,
            defaultSourceGroup: selectedAgent.profile.defaultSourceGroup,
            isActive: selectedAgent.profile.isActive,
        })
        const sameAgentAssignment = selectedUser?.activeAssignment?.agentId === selectedAgent.id
            ? selectedUser.activeAssignment
            : null
        setSourceGroup(sameAgentAssignment ? sameAgentAssignment.sourceGroup ?? '' : selectedAgent.profile.defaultSourceGroup || '')
        setWhatsappGroupUrl(sameAgentAssignment?.whatsappGroupUrl ?? '')
        setSourceGroupTouched(false)
        setWhatsappGroupUrlTouched(false)
    }, [selectedAgent, selectedUser])

    async function saveProfile(event: FormEvent) {
        event.preventDefault()
        if (!selectedAgentId) return

        setBusy('profile')
        setError(null)
        setSuccess(null)

        try {
            const response = await fetch(`/api/admin/agents/${selectedAgentId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(profileDraft),
            })
            const payload = await response.json().catch(() => null)
            if (!response.ok) {
                throw new Error(payload?.error || 'Failed to save agent profile')
            }

            setSuccess('Agent settings saved.')
            await loadData()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save agent profile')
        } finally {
            setBusy(null)
        }
    }

    async function assignUser(event: FormEvent) {
        event.preventDefault()
        if (!selectedAgentId || !selectedUserId || !selectedUser) return

        setBusy('assignment')
        setError(null)
        setSuccess(null)

        try {
            const requestBody: Record<string, unknown> = {
                agentId: selectedAgentId,
                userId: selectedUserId,
                replaceExisting: true,
                expectedOwnershipToken: selectedUser.ownershipToken,
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
                await loadData()
                setError(t.common.ownershipChanged)
                return
            }
            if (!response.ok) {
                throw new Error(payload?.error || 'Failed to assign user')
            }

            const mode = payload?.transfer?.mode
            setSuccess(mode === 'transferred' ? 'User transferred to agent.' : 'User assigned to agent.')
            setSelectedUserId('')
            setWhatsappGroupUrl('')
            await loadData()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to assign user')
        } finally {
            setBusy(null)
        }
    }

    async function endAssignment(assignment: AssignmentItem) {
        const assignmentId = assignment.id
        setBusy(assignmentId)
        setError(null)
        setSuccess(null)

        try {
            const response = await fetch('/api/admin/agent-assignments', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    assignmentId,
                    expectedOwnershipToken: assignment.ownershipToken,
                }),
            })
            const payload = await response.json().catch(() => null)
            if (response.status === 409) {
                await loadData()
                setError(t.common.ownershipChanged)
                return
            }
            if (!response.ok) {
                throw new Error(payload?.error || 'Failed to end assignment')
            }

            setSuccess('Assignment ended.')
            await loadData()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to end assignment')
        } finally {
            setBusy(null)
        }
    }

    return (
        <div className="mx-auto max-w-7xl space-y-6 p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                    <p className="text-sm text-muted-foreground">Admin configuration</p>
                    <h1 className="text-3xl font-bold text-foreground">Agents</h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                        Manage agent profile, manual WhatsApp handoff targets, and assigned users.
                    </p>
                </div>
                <Button type="button" variant="outline" onClick={loadData} disabled={loading} className="gap-2">
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                </Button>
            </div>

            {error && (
                <div className="rounded-lg border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200" role="alert">
                    {error}
                </div>
            )}
            {success && (
                <div className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-200" role="status">
                    {success}
                </div>
            )}

            <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-lg border border-border bg-card p-4">
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Agents</span>
                        <Users className="h-5 w-5 text-sky-300" />
                    </div>
                    <div className="mt-3 text-3xl font-bold">{data?.agents.length ?? 0}</div>
                </div>
                <div className="rounded-lg border border-border bg-card p-4">
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Active Assignments</span>
                        <ShieldCheck className="h-5 w-5 text-emerald-300" />
                    </div>
                    <div className="mt-3 text-3xl font-bold">{data?.assignments.length ?? 0}</div>
                </div>
                <div className="rounded-lg border border-border bg-card p-4">
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Manager-Owned Users</span>
                        <AlertTriangle className="h-5 w-5 text-amber-300" />
                    </div>
                    <div className="mt-3 text-3xl font-bold">{data?.users.filter((user) => user.managerOwned).length ?? 0}</div>
                </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
                <section className="rounded-lg border border-border bg-card p-4">
                    <h2 className="text-xl font-semibold">Agent Settings</h2>
                    <form className="mt-4 space-y-4" onSubmit={saveProfile}>
                        <label className="block space-y-2">
                            <span className="text-sm text-muted-foreground">Agent</span>
                            <select
                                value={selectedAgentId}
                                onChange={(event) => setSelectedAgentId(event.target.value)}
                                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            >
                                <option value="">Select agent</option>
                                {data?.agents.map((agent) => (
                                    <option key={agent.id} value={agent.id}>
                                        {agent.profile.displayName || agent.username}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="block space-y-2">
                            <span className="text-sm text-muted-foreground">Display Name</span>
                            <Input
                                value={profileDraft.displayName}
                                onChange={(event) => setProfileDraft((draft) => ({ ...draft, displayName: event.target.value }))}
                            />
                        </label>
                        <label className="block space-y-2">
                            <span className="text-sm text-muted-foreground">Default Source Group</span>
                            <Input
                                value={profileDraft.defaultSourceGroup}
                                onChange={(event) => setProfileDraft((draft) => ({ ...draft, defaultSourceGroup: event.target.value }))}
                                maxLength={120}
                            />
                        </label>
                        <label className="block space-y-2">
                            <span className="text-sm text-muted-foreground">WhatsApp Group Link</span>
                            <Input
                                value={profileDraft.whatsappHandoffGroupUrl}
                                onChange={(event) => setProfileDraft((draft) => ({ ...draft, whatsappHandoffGroupUrl: event.target.value }))}
                                placeholder="https://chat.whatsapp.com/..."
                            />
                        </label>
                        <label className="block space-y-2">
                            <span className="text-sm text-muted-foreground">WhatsApp User Phone</span>
                            <Input
                                value={profileDraft.whatsappHandoffPhone}
                                onChange={(event) => setProfileDraft((draft) => ({ ...draft, whatsappHandoffPhone: event.target.value }))}
                                placeholder="201001234567"
                            />
                        </label>
                        <label className="block space-y-2">
                            <span className="text-sm text-muted-foreground">WhatsApp Destination Label</span>
                            <Input
                                value={profileDraft.whatsappHandoffLabel}
                                onChange={(event) => setProfileDraft((draft) => ({ ...draft, whatsappHandoffLabel: event.target.value }))}
                                placeholder="Agent group name"
                            />
                        </label>
                        <label className="flex items-center gap-3 text-sm">
                            <input
                                type="checkbox"
                                checked={profileDraft.isActive}
                                onChange={(event) => setProfileDraft((draft) => ({ ...draft, isActive: event.target.checked }))}
                            />
                            Active agent profile
                        </label>
                        <label className="flex items-center gap-3 text-sm">
                            <input
                                type="checkbox"
                                checked={profileDraft.whatsappNotificationsEnabled}
                                onChange={(event) => setProfileDraft((draft) => ({ ...draft, whatsappNotificationsEnabled: event.target.checked }))}
                            />
                            Use this agent profile for handoff destinations
                        </label>
                        <div className="flex flex-wrap gap-2">
                            <Button type="submit" disabled={!selectedAgentId || busy === 'profile'}>
                                Save Agent
                            </Button>
                        </div>
                    </form>
                </section>

                <section className="rounded-lg border border-border bg-card p-4">
                    <h2 className="text-xl font-semibold">Assign User</h2>
                    <form className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr_1fr_auto]" onSubmit={assignUser}>
                        <label className="block space-y-2">
                            <span className="text-sm text-muted-foreground">User</span>
                            <select
                                value={selectedUserId}
                                onChange={(event) => setSelectedUserId(event.target.value)}
                                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            >
                                <option value="">Select user</option>
                                {eligibleUsers.map((user) => (
                                    <option key={user.id} value={user.id}>
                                        {user.username}
                                        {user.managerOwned ? ' (manager-owned)' : user.activeAssignment ? ' (assigned)' : ' (direct)'}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="block space-y-2">
                            <span className="text-sm text-muted-foreground">Source Group</span>
                            <Input
                                value={sourceGroup}
                                onChange={(event) => {
                                    setSourceGroup(event.target.value)
                                    setSourceGroupTouched(true)
                                }}
                                maxLength={120}
                                placeholder={isSameAgentTarget
                                    ? t.common.withoutGroup
                                    : selectedAgent?.profile.defaultSourceGroup || t.common.withoutGroup}
                            />
                            <span className="text-xs text-muted-foreground">{t.common.agentDefaultSourceGroupHint}</span>
                        </label>
                        <label className="block space-y-2">
                            <span className="text-sm text-muted-foreground">WhatsApp Group Link</span>
                            <Input
                                value={whatsappGroupUrl}
                                onChange={(event) => {
                                    setWhatsappGroupUrl(event.target.value)
                                    setWhatsappGroupUrlTouched(true)
                                }}
                                maxLength={500}
                                placeholder="https://chat.whatsapp.com/..."
                            />
                            <span className="text-xs text-muted-foreground">{t.common.whatsappAssignmentHint}</span>
                        </label>
                        <div className="flex items-end">
                            <Button type="submit" disabled={!selectedAgentId || !selectedUserId || busy === 'assignment'}>
                                Assign
                            </Button>
                        </div>
                    </form>
                    <p className="mt-3 text-xs text-muted-foreground">
                        {t.common.transferPreservesAccountData}
                    </p>

                    <div className="mt-6 overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/40 text-muted-foreground">
                                <tr>
                                    <th className="px-4 py-3 text-start font-medium">User</th>
                                    <th className="px-4 py-3 text-start font-medium">Agent</th>
                                    <th className="px-4 py-3 text-start font-medium">Group</th>
                                    <th className="px-4 py-3 text-start font-medium">WhatsApp Link</th>
                                    <th className="px-4 py-3 text-start font-medium">Assigned</th>
                                    <th className="px-4 py-3 text-start font-medium">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data?.assignments.map((assignment) => {
                                    const safeWhatsappGroupUrl = normalizeWhatsAppGroupInviteUrl(
                                        assignment.whatsappGroupUrl
                                    )
                                    return (
                                    <tr key={assignment.id} className="border-t border-border">
                                        <td className="px-4 py-3 font-semibold">{assignment.user.username}</td>
                                        <td className="px-4 py-3">{assignment.agent.displayName}</td>
                                        <td className="px-4 py-3 text-muted-foreground">
                                            {assignment.sourceGroup || t.common.withoutGroup}
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground">
                                            {safeWhatsappGroupUrl ? (
                                                <a
                                                    href={safeWhatsappGroupUrl}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="text-sky-300 underline"
                                                >
                                                    {t.common.openLink}
                                                </a>
                                            ) : '-'}
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground">{formatDate(assignment.createdAt)}</td>
                                        <td className="px-4 py-3">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => endAssignment(assignment)}
                                                disabled={busy === assignment.id}
                                            >
                                                End
                                            </Button>
                                        </td>
                                    </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                </section>
            </div>

            {loading && (
                <div className="rounded-lg border border-border bg-card p-6 text-center text-muted-foreground">
                    Loading agents...
                </div>
            )}
        </div>
    )
}
