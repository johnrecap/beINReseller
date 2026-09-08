'use client'

import { usePanelRequest, usePanelCommand, readPanelJson } from '@/hooks/usePanelRequest'
import { PanelLoadError, PanelCommandWarning } from '@/components/ui/PanelLoadError'
import { useTranslation } from '@/hooks/useTranslation'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { withRequestDeadline } from '@/lib/request-deadline'
import { RefreshCw, Save, ShieldCheck } from 'lucide-react'

type Effect = 'allow' | 'deny'
type RoleName = 'ADMIN' | 'MANAGER' | 'AGENT' | 'USER'

interface CatalogPermission {
    key: string
    category: string
    label: string
    description: string
    riskLevel: string
}

interface RolePermissionRow {
    key: string
    defaultEffect: Effect
    configuredEffect: Effect | null
    effectiveEffect: Effect
    reason: string | null
}

interface RolePermissions {
    role: RoleName
    permissions: RolePermissionRow[]
}

interface AuditEvent {
    id: string
    actorUserId: string | null
    targetType: string
    targetId: string
    permissionKey: string | null
    result: string
    reason: string | null
    createdAt: string
}

const roles: RoleName[] = ['ADMIN', 'MANAGER', 'AGENT', 'USER']

export default function AdminPermissionsClient() {
    const { t: tableText, language } = useTranslation()
    const t = tableText
    const { run, loading, error: readError, cancel } = usePanelRequest()
    const { request: command, hasUnconfirmed: unconfirmed, isUnconfirmed, uncertainKeys, reconcile } = usePanelCommand()
    const mutationPending = useRef(false)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    const [catalog, setCatalog] = useState<CatalogPermission[]>([])
    const [roleData, setRoleData] = useState<RolePermissions[]>([])
    const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([])
    const [selectedRole, setSelectedRole] = useState<RoleName>('MANAGER')
    const [globalFreezeEnabled, setGlobalFreezeEnabled] = useState(false)
    const [globalFreezeReason, setGlobalFreezeReason] = useState('')
    const [roleReasons, setRoleReasons] = useState<Record<string, string>>({})
    const [overrideUserId, setOverrideUserId] = useState('')
    const [overridePermissionKey, setOverridePermissionKey] = useState('')
    const [overrideEffect, setOverrideEffect] = useState<Effect>('deny')
    const [overrideReason, setOverrideReason] = useState('')

    const selectedRoleData = roleData.find((role) => role.role === selectedRole)
    const permissionByKey = useMemo(
        () => new Map(catalog.map((permission) => [permission.key, permission])),
        [catalog]
    )

    const loadData = useCallback(async () => {
        setCatalog([])
        setRoleData([])
        setAuditEvents([])
        return run(signal => Promise.all([
            readPanelJson<{ permissions: CatalogPermission[] }>('/api/admin/permissions/catalog', signal),
            readPanelJson<{ roles: RolePermissions[] }>('/api/admin/permissions/roles', signal),
            readPanelJson<{ settings?: { panel_user_creation_freeze?: { enabled?: boolean; reason?: string } } }>('/api/admin/permissions/global', signal),
            readPanelJson<{ events: AuditEvent[] }>('/api/admin/permissions/audit?limit=25', signal),
        ]), ([catalogBody, rolesBody, globalBody, auditBody]) => {
            setCatalog(catalogBody.permissions || [])
            setRoleData(rolesBody.roles || [])
            const freeze = globalBody.settings?.panel_user_creation_freeze
            setGlobalFreezeEnabled(Boolean(freeze?.enabled))
            setGlobalFreezeReason(freeze?.reason || '')
            setAuditEvents(auditBody.events || [])
            setOverridePermissionKey(current => current || catalogBody.permissions?.[0]?.key || '')
        })
    }, [run])

    useEffect(() => {
        const timer = setTimeout(() => void loadData(), 0)
        return () => { clearTimeout(timer); cancel() }
    }, [loadData, cancel])

    async function saveGlobalFreeze() {
        const commandKey = 'global:freeze'
        if (isUnconfirmed(commandKey) || mutationPending.current || loading || readError !== null) return
        mutationPending.current = true
        setSaving(true)
        setError(null)
        setSuccess(null)
        try {
            const response = await command('/api/admin/permissions/global/panel-user-creation-freeze', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    enabled: globalFreezeEnabled,
                    reason: globalFreezeReason || null,
                }),
            }, commandKey)
            const body = await response.json()
            if (!response.ok) throw new Error(body?.error || t.panelUi.operationalCopy.saveGlobalFailed)
            setSuccess(t.panelUi.operationalCopy.savedGlobal)
            await loadData()
        } catch (err) {
            setError(err instanceof Error ? err.message : t.panelUi.operationalCopy.saveGlobalFailed)
        } finally {
            mutationPending.current = false
            setSaving(false)
        }
    }

    async function saveRolePermission(permissionKey: string, effect: Effect | 'default') {
        const commandKey = `role:${selectedRole}:${permissionKey}`
        if (isUnconfirmed(commandKey) || mutationPending.current || loading || readError !== null) return
        mutationPending.current = true
        setSaving(true)
        setError(null)
        setSuccess(null)
        try {
            const reason = roleReasons[`${selectedRole}:${permissionKey}`] || null
            const response = effect === 'default'
                ? await command(`/api/admin/permissions/roles/${selectedRole}?permissionKey=${encodeURIComponent(permissionKey)}`, {
                    method: 'DELETE',
                }, commandKey)
                : await command(`/api/admin/permissions/roles/${selectedRole}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ permissionKey, effect, reason }),
                }, commandKey)
            const body = await response.json()
            if (!response.ok) throw new Error(body?.error || t.panelUi.operationalCopy.saveRoleFailed)
            setSuccess(t.panelUi.operationalCopy.savedRole)
            await loadData()
        } catch (err) {
            setError(err instanceof Error ? err.message : t.panelUi.operationalCopy.saveRoleFailed)
        } finally {
            mutationPending.current = false
            setSaving(false)
        }
    }

    async function saveUserOverride() {
        const commandKey = `user:${overrideUserId.trim()}:${overridePermissionKey}`
        if (!overrideUserId.trim()) {
            setError(t.panelUi.operationalCopy.userIdRequired)
            return
        }

        if (isUnconfirmed(commandKey) || mutationPending.current || loading || readError !== null) return
        mutationPending.current = true
        setSaving(true)
        setError(null)
        setSuccess(null)
        try {
            const response = await command(`/api/admin/permissions/users/${encodeURIComponent(overrideUserId.trim())}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    permissionKey: overridePermissionKey,
                    effect: overrideEffect,
                    reason: overrideReason || null,
                }),
            }, commandKey)
            const body = await response.json()
            if (!response.ok) throw new Error(body?.error || t.panelUi.operationalCopy.saveOverrideFailed)
            setSuccess(t.panelUi.operationalCopy.savedOverride)
            await loadData()
        } catch (err) {
            setError(err instanceof Error ? err.message : t.panelUi.operationalCopy.saveOverrideFailed)
        } finally {
            mutationPending.current = false
            setSaving(false)
        }
    }

    async function removeUserOverride() {
        const commandKey = `user:${overrideUserId.trim()}:${overridePermissionKey}`
        if (!overrideUserId.trim()) {
            setError(t.panelUi.operationalCopy.userIdRequired)
            return
        }

        if (isUnconfirmed(commandKey) || mutationPending.current || loading || readError !== null) return
        mutationPending.current = true
        setSaving(true)
        setError(null)
        setSuccess(null)
        try {
            const response = await command(
                `/api/admin/permissions/users/${encodeURIComponent(overrideUserId.trim())}?permissionKey=${encodeURIComponent(overridePermissionKey)}`,
                { method: 'DELETE' }, commandKey
            )
            const body = await response.json()
            if (!response.ok) throw new Error(body?.error || t.panelUi.operationalCopy.removeOverrideFailed)
            setSuccess(t.panelUi.operationalCopy.removedOverride)
            await loadData()
        } catch (err) {
            setError(err instanceof Error ? err.message : t.panelUi.operationalCopy.removeOverrideFailed)
        } finally {
            mutationPending.current = false
            setSaving(false)
        }
    }

    async function reviewCurrentValues() {
        if (mutationPending.current || loading) return
        mutationPending.current = true
        setSaving(true)
        setError(null)
        const keys = [...uncertainKeys]
        const reviewedUser = overrideUserId.trim()
        const reviewedPermission = overridePermissionKey
        try {
            await reconcile(keys, async () => {
                const users = [...new Set(keys.filter(key => key.startsWith('user:')).map(key => key.split(':')[1]))]
                for (const userId of users) {
                    const result = await withRequestDeadline(signal => readPanelJson<{ userId: string; overrides: Array<{ permissionKey: string; effect: Effect; reason: string | null }> }>(`/api/admin/permissions/users/${encodeURIComponent(userId)}`, signal), 15_000)
                    if (result.userId !== userId || !Array.isArray(result.overrides)) return false
                    if (userId === reviewedUser) {
                        const entry = result.overrides.find(item => item.permissionKey === reviewedPermission)
                        setOverrideEffect(entry?.effect ?? 'deny')
                        setOverrideReason(entry?.reason ?? '')
                    }
                }
                return loadData()
            })
        } catch {
            setError(tableText.panelUi.loadFailed)
        } finally {
            mutationPending.current = false
            setSaving(false)
        }
    }

    return (
        <fieldset disabled={saving} className="container mx-auto min-w-0 p-6 space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <p className="text-sm text-muted-foreground">{t.panelUi.operationalCopy.adminConfiguration}</p>
                    <h1 className="text-3xl font-bold flex items-center gap-2">
                        <ShieldCheck className="h-7 w-7 text-purple-400" />
                        {t.panelUi.operationalCopy.permissionControls}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        {t.panelUi.operationalCopy.permissionsDescription}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={loadData}
                    disabled={loading || saving}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-secondary disabled:opacity-60"
                >
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    {t.common.refresh}
                </button>
            </div>

            {readError !== null && <PanelLoadError status={readError} retry={() => void loadData()} />}
            {loading && <p role="status">{tableText.common.loading}</p>}
            <PanelCommandWarning show={unconfirmed} reviewing={saving || loading} onReview={() => { void reviewCurrentValues() }} />            {error && <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}
            {success && <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{success}</div>}

            {!loading && readError === null && <>
            <section className="rounded-lg border border-border bg-card p-5 space-y-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h2 className="text-xl font-semibold">{t.panelUi.operationalCopy.creationFreeze}</h2>
                        <p className="text-sm text-muted-foreground">{t.panelUi.operationalCopy.creationFreezeHint}</p>
                    </div>
                    <label className="inline-flex items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={globalFreezeEnabled}
                            onChange={(event) => setGlobalFreezeEnabled(event.target.checked)}
                            className="h-4 w-4"
                        />
                        {t.panelUi.operationalCopy.enabled}
                    </label>
                </div>
                <div className="flex flex-col gap-3 md:flex-row">
                    <input
                        value={globalFreezeReason}
                        onChange={(event) => setGlobalFreezeReason(event.target.value)}
                        placeholder={t.panelUi.operationalCopy.optionalReason}
                        className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    />
                    <button
                        type="button"
                        onClick={saveGlobalFreeze}
                        disabled={isUnconfirmed('global:freeze') || saving}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                    >
                        <Save className="h-4 w-4" />
                        {t.common.save}
                    </button>
                </div>
            </section>

            <section className="rounded-lg border border-border bg-card p-5 space-y-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h2 className="text-xl font-semibold">{t.panelUi.operationalCopy.rolePermissions}</h2>
                        <p className="text-sm text-muted-foreground">{t.panelUi.operationalCopy.rolePermissionsHint}</p>
                    </div>
                    <select
                        value={selectedRole}
                        onChange={(event) => setSelectedRole(event.target.value as RoleName)}
                        className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    >
                        {roles.map((role) => <option key={role} value={role}>{({ADMIN:t.admin.users.roles.admin,MANAGER:t.admin.users.roles.manager,USER:t.admin.users.roles.user,AGENT:t.common.ownerAgent} as Record<string, string>)[role] || role}</option>)}
                    </select>
                </div>
                <div className="overflow-x-auto">
                    <Table panel density="compact" className="w-full text-sm">
                        <TableHeader className="border-b border-border text-muted-foreground">
                            <TableRow>
                                <TableHead className="py-3 text-left">{tableText.panelTable.permission}</TableHead>
                                <TableHead className="py-3 text-left">{tableText.panelTable.category}</TableHead>
                                <TableHead className="py-3 text-left">{tableText.panelTable.effective}</TableHead>
                                <TableHead className="py-3 text-left">{tableText.panelTable.reason}</TableHead>
                                <TableHead className="py-3 text-right">{tableText.admin.logs.table.action}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody className="divide-y divide-border">
                            {selectedRoleData?.permissions.map((row) => {
                                const permission = permissionByKey.get(row.key)
                                const reasonKey = `${selectedRole}:${row.key}`
                                return (
                                    <TableRow key={row.key}>
                                        <TableCell className="py-3 pr-4">
                                            <p className="font-medium">{permission?.label || row.key}</p>
                                            <p className="text-xs text-muted-foreground">{row.key}</p>
                                        </TableCell>
                                        <TableCell className="py-3 pr-4">{permission?.category || '-'}</TableCell>
                                        <TableCell className="py-3 pr-4">
                                            <span className={`rounded-full px-2 py-1 text-xs ${row.effectiveEffect === 'allow' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'}`}>
                                                {t.panelUi.operationalCopy[row.effectiveEffect === 'allow' ? 'allow' : 'deny'] + (row.configuredEffect ? '' : ` (${t.panelUi.operationalCopy.defaultValue})`)}
                                            </span>
                                        </TableCell>
                                        <TableCell className="py-3 pr-4">
                                            <input
                                                value={roleReasons[reasonKey] ?? row.reason ?? ''}
                                                onChange={(event) => setRoleReasons((current) => ({
                                                    ...current,
                                                    [reasonKey]: event.target.value,
                                                }))}
                                                placeholder={t.panelUi.operationalCopy.optionalReason}
                                                className="w-full min-w-48 rounded-lg border border-border bg-background px-3 py-2 text-xs"
                                            />
                                        </TableCell>
                                        <TableCell className="py-3">
                                            <div className="flex justify-end gap-2">
                                                <button type="button" onClick={() => saveRolePermission(row.key, 'allow')} disabled={isUnconfirmed(`role:${selectedRole}:${row.key}`) || saving} className="rounded-lg border border-emerald-500/40 px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-60">{t.panelUi.operationalCopy.allow}</button>
                                                <button type="button" onClick={() => saveRolePermission(row.key, 'deny')} disabled={isUnconfirmed(`role:${selectedRole}:${row.key}`) || saving} className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-60">{t.panelUi.operationalCopy.deny}</button>
                                                <button type="button" onClick={() => saveRolePermission(row.key, 'default')} disabled={isUnconfirmed(`role:${selectedRole}:${row.key}`) || saving || !row.configuredEffect} className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-secondary disabled:opacity-50">{t.panelUi.operationalCopy.defaultValue}</button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )
                            })}
                        </TableBody>
                    </Table>
                </div>
            </section>

            <section className="rounded-lg border border-border bg-card p-5 space-y-4">
                <div>
                    <h2 className="text-xl font-semibold">{t.panelUi.operationalCopy.userOverride}</h2>
                    <p className="text-sm text-muted-foreground">{t.panelUi.operationalCopy.userOverrideHint}</p>
                </div>
                <div className="grid gap-3 md:grid-cols-[1fr_1fr_140px]">
                    <input value={overrideUserId} onChange={(event) => setOverrideUserId(event.target.value)} placeholder={t.panelUi.operationalCopy.userId} className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                    <select value={overridePermissionKey} onChange={(event) => setOverridePermissionKey(event.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
                        {catalog.map((permission) => <option key={permission.key} value={permission.key}>{permission.label}</option>)}
                    </select>
                    <select value={overrideEffect} onChange={(event) => setOverrideEffect(event.target.value as Effect)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
                        <option value="deny">{t.panelUi.operationalCopy.deny}</option>
                        <option value="allow">{t.panelUi.operationalCopy.allow}</option>
                    </select>
                </div>
                <div className="flex flex-col gap-3 md:flex-row">
                    <input value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} placeholder={t.panelUi.operationalCopy.optionalReason} className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                    <button type="button" onClick={saveUserOverride} disabled={isUnconfirmed(`user:${overrideUserId.trim()}:${overridePermissionKey}`) || saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">{t.panelUi.operationalCopy.saveOverride}</button>
                    <button type="button" onClick={removeUserOverride} disabled={isUnconfirmed(`user:${overrideUserId.trim()}:${overridePermissionKey}`) || saving} className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-secondary disabled:opacity-60">{t.panelUi.operationalCopy.remove}</button>
                </div>
            </section>

            <section className="rounded-lg border border-border bg-card p-5 space-y-4">
                <div>
                    <h2 className="text-xl font-semibold">{t.panelUi.operationalCopy.auditEvents}</h2>
                    <p className="text-sm text-muted-foreground">{t.panelUi.operationalCopy.auditEventsHint}</p>
                </div>
                <div className="overflow-x-auto">
                    <Table panel density="compact" className="w-full text-sm">
                        <TableHeader className="border-b border-border text-muted-foreground">
                            <TableRow>
                                <TableHead className="py-3 text-left">{tableText.admin.logs.table.time}</TableHead>
                                <TableHead className="py-3 text-left">{tableText.panelTable.target}</TableHead>
                                <TableHead className="py-3 text-left">{tableText.panelTable.permission}</TableHead>
                                <TableHead className="py-3 text-left">{tableText.history.result}</TableHead>
                                <TableHead className="py-3 text-left">{tableText.panelTable.reason}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody className="divide-y divide-border">
                            {auditEvents.length === 0 ? (
                                <TableRow><TableCell colSpan={5} className="py-6 text-center text-muted-foreground">{t.panelUi.operationalCopy.noAuditEvents}</TableCell></TableRow>
                            ) : auditEvents.map((event) => (
                                <TableRow key={event.id}>
                                    <TableCell className="py-3 pr-4 whitespace-nowrap">{new Date(event.createdAt).toLocaleString(language)}</TableCell>
                                    <TableCell className="py-3 pr-4">{event.targetType}:{event.targetId}</TableCell>
                                    <TableCell className="py-3 pr-4">{event.permissionKey || '-'}</TableCell>
                                    <TableCell className="py-3 pr-4">{event.result}</TableCell>
                                    <TableCell className="py-3">{event.reason || '-'}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </section>
            </>}
        </fieldset>
    )
}
