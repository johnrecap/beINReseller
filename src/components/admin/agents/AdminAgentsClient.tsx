'use client'

import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, RefreshCw, ShieldCheck, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { usePanelRequest, usePanelCommand } from '@/hooks/usePanelRequest'
import { PanelLoadError, PanelCommandWarning } from '@/components/ui/PanelLoadError'
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

function formatDate(value: string, language: string) {
    return new Intl.DateTimeFormat(language, {
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
    const { t: tableText } = useTranslation()
    const { t, language } = useTranslation()
    const [data, setData] = useState<ApiData | null>(null)
    const { load, loading, error: readError, cancel } = usePanelRequest()
    const { request: command, hasUnconfirmed: unconfirmed, isUnconfirmed, uncertainKeys, reconcile } = usePanelCommand()
    const mutationPending = useRef(false)
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
        setData(null)
        return load<ApiData>('/api/admin/agent-assignments', payload => {
            setData(payload)
            setSelectedAgentId(current => payload.agents.some(agent => agent.id === current) ? current : payload.agents[0]?.id || '')
        })
    }, [load])

    useEffect(() => {
        const timer = setTimeout(() => void loadData(), 0)
        return () => { clearTimeout(timer); cancel() }
    }, [loadData, cancel])

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
        const commandKey = `profile:${selectedAgentId}`
        event.preventDefault()
        if (isUnconfirmed(commandKey) || !selectedAgentId || mutationPending.current) return
        mutationPending.current = true

        setBusy('profile')
        setError(null)
        setSuccess(null)

        try {
            const response = await command(`/api/admin/agents/${selectedAgentId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(profileDraft),
            }, commandKey)
            const payload = await response.json().catch(() => null)
            if (!response.ok) {
                throw new Error(payload?.error || t.panelUi.operationalCopy.saveAgentFailed)
            }

            setSuccess(t.panelUi.operationalCopy.savedAgent)
            await loadData()
        } catch (err) {
            setError(err instanceof Error ? err.message : t.panelUi.operationalCopy.saveAgentFailed)
        } finally {
            mutationPending.current = false
            setBusy(null)
        }
    }

    async function assignUser(event: FormEvent) {
        const commandKey = `ownership:${selectedUserId}`
        event.preventDefault()
        if (isUnconfirmed(commandKey) || !selectedAgentId || !selectedUserId || !selectedUser || mutationPending.current) return
        mutationPending.current = true

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

            const response = await command('/api/admin/agent-assignments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            }, commandKey)
            const payload = await response.json().catch(() => null)
            if (response.status === 409) {
                await loadData()
                setError(t.common.ownershipChanged)
                return
            }
            if (!response.ok) {
                throw new Error(payload?.error || t.panelUi.operationalCopy.assignUserFailed)
            }

            const mode = payload?.transfer?.mode
            setSuccess(mode === 'transferred' ? t.panelUi.operationalCopy.transferredUser : t.panelUi.operationalCopy.assignedUser)
            setSelectedUserId('')
            setWhatsappGroupUrl('')
            await loadData()
        } catch (err) {
            setError(err instanceof Error ? err.message : t.panelUi.operationalCopy.assignUserFailed)
        } finally {
            mutationPending.current = false
            setBusy(null)
        }
    }

    async function endAssignment(assignment: AssignmentItem) {
        const commandKey = `ownership:${assignment.user.id}`
        if (isUnconfirmed(commandKey) || mutationPending.current) return
        mutationPending.current = true
        const assignmentId = assignment.id
        setBusy(assignmentId)
        setError(null)
        setSuccess(null)

        try {
            const response = await command('/api/admin/agent-assignments', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    assignmentId,
                    expectedOwnershipToken: assignment.ownershipToken,
                }),
            }, commandKey)
            const payload = await response.json().catch(() => null)
            if (response.status === 409) {
                await loadData()
                setError(t.common.ownershipChanged)
                return
            }
            if (!response.ok) {
                throw new Error(payload?.error || t.panelUi.operationalCopy.endAssignmentFailed)
            }

            setSuccess(t.panelUi.operationalCopy.endedAssignment)
            await loadData()
        } catch (err) {
            setError(err instanceof Error ? err.message : t.panelUi.operationalCopy.endAssignmentFailed)
        } finally {
            mutationPending.current = false
            setBusy(null)
        }
    }

    return (
        <div className="mx-auto max-w-7xl space-y-6 p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                    <p className="text-sm text-muted-foreground">{t.panelUi.operationalCopy.adminConfiguration}</p>
                    <h1 className="text-3xl font-bold text-foreground">{t.panelUi.agents}</h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                        {t.panelUi.operationalCopy.agentsDescription}
                    </p>
                </div>
                <Button type="button" variant="outline" onClick={loadData} disabled={loading} className="gap-2">
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    {t.common.refresh}
                </Button>
            </div>

            {readError !== null && <PanelLoadError status={readError} retry={() => void loadData()} />}
            <PanelCommandWarning show={unconfirmed} reviewing={loading || busy !== null} onReview={() => { void reconcile([...uncertainKeys], loadData) }} />            {error && (
                <div className="rounded-lg border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200" role="alert">
                    {error}
                </div>
            )}
            {success && (
                <div className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-200" role="status">
                    {success}
                </div>
            )}

            {data && <>
            <div className="grid gap-4 md:grid-cols-3">
                <div className="min-w-0 rounded-lg border border-border bg-card p-4">
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">{t.panelUi.agents}</span>
                        <Users className="h-5 w-5 text-sky-300" />
                    </div>
                    <div className="mt-3 text-3xl font-bold">{data?.agents.length ?? 0}</div>
                </div>
                <div className="min-w-0 rounded-lg border border-border bg-card p-4">
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">{t.panelUi.operationalCopy.activeAssignments}</span>
                        <ShieldCheck className="h-5 w-5 text-emerald-300" />
                    </div>
                    <div className="mt-3 text-3xl font-bold">{data?.assignments.length ?? 0}</div>
                </div>
                <div className="min-w-0 rounded-lg border border-border bg-card p-4">
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">{t.panelUi.operationalCopy.managerOwnedUsers}</span>
                        <AlertTriangle className="h-5 w-5 text-amber-300" />
                    </div>
                    <div className="mt-3 text-3xl font-bold">{data?.users.filter((user) => user.managerOwned).length ?? 0}</div>
                </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
                <section className="min-w-0 rounded-lg border border-border bg-card p-4">
                    <h2 className="text-xl font-semibold">{t.panelUi.operationalCopy.agentSettings}</h2>
                    <form className="mt-4 space-y-4" onSubmit={saveProfile}>
                        <label className="block space-y-2">
                            <span className="text-sm text-muted-foreground">{t.common.ownerAgent}</span>
                            <select
                                value={selectedAgentId}
                                onChange={(event) => setSelectedAgentId(event.target.value)}
                                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            >
                                <option value="">{t.panelUi.operationalCopy.selectAgent}</option>
                                {data?.agents.map((agent) => (
                                    <option key={agent.id} value={agent.id}>
                                        {agent.profile.displayName || agent.username}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="block space-y-2">
                            <span className="text-sm text-muted-foreground">{t.panelUi.operationalCopy.displayName}</span>
                            <Input
                                value={profileDraft.displayName}
                                onChange={(event) => setProfileDraft((draft) => ({ ...draft, displayName: event.target.value }))}
                            />
                        </label>
                        <label className="block space-y-2">
                            <span className="text-sm text-muted-foreground">{t.panelUi.operationalCopy.defaultSourceGroup}</span>
                            <Input
                                value={profileDraft.defaultSourceGroup}
                                onChange={(event) => setProfileDraft((draft) => ({ ...draft, defaultSourceGroup: event.target.value }))}
                                maxLength={120}
                            />
                        </label>
                        <label className="block space-y-2">
                            <span className="text-sm text-muted-foreground">{t.panelUi.operationalCopy.whatsappGroupLink}</span>
                            <Input
                                value={profileDraft.whatsappHandoffGroupUrl}
                                onChange={(event) => setProfileDraft((draft) => ({ ...draft, whatsappHandoffGroupUrl: event.target.value }))}
                                placeholder="https://chat.whatsapp.com/..."
                            />
                        </label>
                        <label className="block space-y-2">
                            <span className="text-sm text-muted-foreground">{t.panelUi.operationalCopy.whatsappUserPhone}</span>
                            <Input
                                value={profileDraft.whatsappHandoffPhone}
                                onChange={(event) => setProfileDraft((draft) => ({ ...draft, whatsappHandoffPhone: event.target.value }))}
                                placeholder="201001234567"
                            />
                        </label>
                        <label className="block space-y-2">
                            <span className="text-sm text-muted-foreground">{t.panelUi.operationalCopy.whatsappDestination}</span>
                            <Input
                                value={profileDraft.whatsappHandoffLabel}
                                onChange={(event) => setProfileDraft((draft) => ({ ...draft, whatsappHandoffLabel: event.target.value }))}
                                placeholder={t.panelUi.operationalCopy.agentGroupName}
                            />
                        </label>
                        <label className="flex items-center gap-3 text-sm">
                            <input
                                type="checkbox"
                                checked={profileDraft.isActive}
                                onChange={(event) => setProfileDraft((draft) => ({ ...draft, isActive: event.target.checked }))}
                            />
                            {t.panelUi.operationalCopy.activeAgentProfile}
                        </label>
                        <label className="flex items-center gap-3 text-sm">
                            <input
                                type="checkbox"
                                checked={profileDraft.whatsappNotificationsEnabled}
                                onChange={(event) => setProfileDraft((draft) => ({ ...draft, whatsappNotificationsEnabled: event.target.checked }))}
                            />
                            {t.panelUi.operationalCopy.agentHandoffHint}
                        </label>
                        <div className="flex flex-wrap gap-2">
                            <Button type="submit" disabled={isUnconfirmed(`profile:${selectedAgentId}`) || !selectedAgentId || busy !== null}>
                                {t.panelUi.operationalCopy.saveAgent}
                            </Button>
                        </div>
                    </form>
                </section>

                <section className="min-w-0 rounded-lg border border-border bg-card p-4">
                    <h2 className="text-xl font-semibold">{t.panelUi.operationalCopy.assignUser}</h2>
                    <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={assignUser}>
                        <label className="block space-y-2">
                            <span className="text-sm text-muted-foreground">{t.admin.users.roles.user}</span>
                            <select
                                value={selectedUserId}
                                onChange={(event) => setSelectedUserId(event.target.value)}
                                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            >
                                <option value="">{t.panelUi.operationalCopy.selectUser}</option>
                                {eligibleUsers.map((user) => (
                                    <option key={user.id} value={user.id}>
                                        {user.username}
                                        {user.managerOwned ? t.panelUi.operationalCopy.managerOwnedSuffix : user.activeAssignment ? t.panelUi.operationalCopy.assignedSuffix : t.panelUi.operationalCopy.directSuffix}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="block space-y-2">
                            <span className="text-sm text-muted-foreground">{t.panelUi.operationalCopy.sourceGroup}</span>
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
                            <span className="text-sm text-muted-foreground">{t.panelUi.operationalCopy.whatsappGroupLink}</span>
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
                            <Button type="submit" disabled={isUnconfirmed(`ownership:${selectedUserId}`) || !selectedAgentId || !selectedUserId || busy !== null}>
                                {t.panelUi.operationalCopy.assign}
                            </Button>
                        </div>
                    </form>
                    <p className="mt-3 text-xs text-muted-foreground">
                        {t.common.transferPreservesAccountData}
                    </p>

                    <div className="mt-6 overflow-x-auto">
                        <Table panel density="compact" className="w-full text-sm">
                            <TableHeader className="bg-muted/40 text-muted-foreground">
                                <TableRow>
                                    <TableHead className="px-4 py-3 text-start font-medium">{tableText.activity.table.user}</TableHead>
                                    <TableHead className="px-4 py-3 text-start font-medium">{tableText.common.ownerAgent}</TableHead>
                                    <TableHead className="px-4 py-3 text-start font-medium">{tableText.panelTable.group}</TableHead>
                                    <TableHead className="px-4 py-3 text-start font-medium">{tableText.panelTable.whatsappLink}</TableHead>
                                    <TableHead className="px-4 py-3 text-start font-medium">{tableText.panelTable.assigned}</TableHead>
                                    <TableHead className="px-4 py-3 text-start font-medium">{tableText.admin.logs.table.action}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {data?.assignments.map((assignment) => {
                                    const safeWhatsappGroupUrl = normalizeWhatsAppGroupInviteUrl(
                                        assignment.whatsappGroupUrl
                                    )
                                    return (
                                    <TableRow key={assignment.id} className="border-t border-border">
                                        <TableCell className="px-4 py-3 font-semibold">{assignment.user.username}</TableCell>
                                        <TableCell className="px-4 py-3">{assignment.agent.displayName}</TableCell>
                                        <TableCell className="px-4 py-3 text-muted-foreground">
                                            {assignment.sourceGroup || t.common.withoutGroup}
                                        </TableCell>
                                        <TableCell className="px-4 py-3 text-muted-foreground">
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
                                        </TableCell>
                                        <TableCell className="px-4 py-3 text-muted-foreground">{formatDate(assignment.createdAt, language)}</TableCell>
                                        <TableCell className="px-4 py-3">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => endAssignment(assignment)}
                                                disabled={isUnconfirmed(`ownership:${assignment.user.id}`) || busy !== null}
                                            >
                                                {t.panelUi.operationalCopy.end}
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                    )
                                })}
                            </TableBody>
                        </Table>
                    </div>
                </section>
            </div>

            </>}
            {loading && (
                <div className="rounded-lg border border-border bg-card p-6 text-center text-muted-foreground">
                    {t.common.loading}
                </div>
            )}
        </div>
    )
}
