'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
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
    const [loading, setLoading] = useState(true)
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
        setLoading(true)
        setError(null)
        try {
            const [catalogRes, rolesRes, globalRes, auditRes] = await Promise.all([
                fetch('/api/admin/permissions/catalog', { cache: 'no-store' }),
                fetch('/api/admin/permissions/roles', { cache: 'no-store' }),
                fetch('/api/admin/permissions/global', { cache: 'no-store' }),
                fetch('/api/admin/permissions/audit?limit=25', { cache: 'no-store' }),
            ])

            const [catalogBody, rolesBody, globalBody, auditBody] = await Promise.all([
                catalogRes.json(),
                rolesRes.json(),
                globalRes.json(),
                auditRes.json(),
            ])

            if (!catalogRes.ok) throw new Error(catalogBody?.error || 'Failed to load permission catalog')
            if (!rolesRes.ok) throw new Error(rolesBody?.error || 'Failed to load role permissions')
            if (!globalRes.ok) throw new Error(globalBody?.error || 'Failed to load global settings')
            if (!auditRes.ok) throw new Error(auditBody?.error || 'Failed to load audit log')

            setCatalog(catalogBody.permissions || [])
            setRoleData(rolesBody.roles || [])
            const freeze = globalBody.settings?.panel_user_creation_freeze
            setGlobalFreezeEnabled(Boolean(freeze?.enabled))
            setGlobalFreezeReason(freeze?.reason || '')
            setAuditEvents(auditBody.events || [])
            if (!overridePermissionKey && catalogBody.permissions?.[0]?.key) {
                setOverridePermissionKey(catalogBody.permissions[0].key)
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load permissions')
        } finally {
            setLoading(false)
        }
    }, [overridePermissionKey])

    useEffect(() => {
        loadData()
    }, [loadData])

    async function saveGlobalFreeze() {
        setSaving(true)
        setError(null)
        setSuccess(null)
        try {
            const response = await fetch('/api/admin/permissions/global/panel-user-creation-freeze', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    enabled: globalFreezeEnabled,
                    reason: globalFreezeReason || null,
                }),
            })
            const body = await response.json()
            if (!response.ok) throw new Error(body?.error || 'Failed to save global setting')
            setSuccess('Global user creation setting saved.')
            await loadData()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save global setting')
        } finally {
            setSaving(false)
        }
    }

    async function saveRolePermission(permissionKey: string, effect: Effect | 'default') {
        setSaving(true)
        setError(null)
        setSuccess(null)
        try {
            const reason = roleReasons[`${selectedRole}:${permissionKey}`] || null
            const response = effect === 'default'
                ? await fetch(`/api/admin/permissions/roles/${selectedRole}?permissionKey=${encodeURIComponent(permissionKey)}`, {
                    method: 'DELETE',
                })
                : await fetch(`/api/admin/permissions/roles/${selectedRole}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ permissionKey, effect, reason }),
                })
            const body = await response.json()
            if (!response.ok) throw new Error(body?.error || 'Failed to save role permission')
            setSuccess('Role permission saved.')
            await loadData()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save role permission')
        } finally {
            setSaving(false)
        }
    }

    async function saveUserOverride() {
        if (!overrideUserId.trim()) {
            setError('Enter a user id first.')
            return
        }

        setSaving(true)
        setError(null)
        setSuccess(null)
        try {
            const response = await fetch(`/api/admin/permissions/users/${encodeURIComponent(overrideUserId.trim())}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    permissionKey: overridePermissionKey,
                    effect: overrideEffect,
                    reason: overrideReason || null,
                }),
            })
            const body = await response.json()
            if (!response.ok) throw new Error(body?.error || 'Failed to save user override')
            setSuccess('User override saved.')
            await loadData()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save user override')
        } finally {
            setSaving(false)
        }
    }

    async function removeUserOverride() {
        if (!overrideUserId.trim()) {
            setError('Enter a user id first.')
            return
        }

        setSaving(true)
        setError(null)
        setSuccess(null)
        try {
            const response = await fetch(
                `/api/admin/permissions/users/${encodeURIComponent(overrideUserId.trim())}?permissionKey=${encodeURIComponent(overridePermissionKey)}`,
                { method: 'DELETE' }
            )
            const body = await response.json()
            if (!response.ok) throw new Error(body?.error || 'Failed to remove user override')
            setSuccess('User override removed.')
            await loadData()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to remove user override')
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="container mx-auto p-6 space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <p className="text-sm text-muted-foreground">Admin configuration</p>
                    <h1 className="text-3xl font-bold flex items-center gap-2">
                        <ShieldCheck className="h-7 w-7 text-purple-400" />
                        Permission Controls
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Control user creation, manager actions, balance transfers, and per-user exceptions.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={loadData}
                    disabled={loading || saving}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-secondary disabled:opacity-60"
                >
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                </button>
            </div>

            {error && <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}
            {success && <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{success}</div>}

            <section className="rounded-lg border border-border bg-card p-5 space-y-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h2 className="text-xl font-semibold">Global user creation freeze</h2>
                        <p className="text-sm text-muted-foreground">Blocks creating panel users for admins and managers.</p>
                    </div>
                    <label className="inline-flex items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={globalFreezeEnabled}
                            onChange={(event) => setGlobalFreezeEnabled(event.target.checked)}
                            className="h-4 w-4"
                        />
                        Enabled
                    </label>
                </div>
                <div className="flex flex-col gap-3 md:flex-row">
                    <input
                        value={globalFreezeReason}
                        onChange={(event) => setGlobalFreezeReason(event.target.value)}
                        placeholder="Optional reason"
                        className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    />
                    <button
                        type="button"
                        onClick={saveGlobalFreeze}
                        disabled={saving}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                    >
                        <Save className="h-4 w-4" />
                        Save
                    </button>
                </div>
            </section>

            <section className="rounded-lg border border-border bg-card p-5 space-y-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h2 className="text-xl font-semibold">Role permissions</h2>
                        <p className="text-sm text-muted-foreground">Deny or allow actions for a whole role.</p>
                    </div>
                    <select
                        value={selectedRole}
                        onChange={(event) => setSelectedRole(event.target.value as RoleName)}
                        className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    >
                        {roles.map((role) => <option key={role} value={role}>{role}</option>)}
                    </select>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="border-b border-border text-muted-foreground">
                            <tr>
                                <th className="py-3 text-left">Permission</th>
                                <th className="py-3 text-left">Category</th>
                                <th className="py-3 text-left">Effective</th>
                                <th className="py-3 text-left">Reason</th>
                                <th className="py-3 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {selectedRoleData?.permissions.map((row) => {
                                const permission = permissionByKey.get(row.key)
                                const reasonKey = `${selectedRole}:${row.key}`
                                return (
                                    <tr key={row.key}>
                                        <td className="py-3 pr-4">
                                            <p className="font-medium">{permission?.label || row.key}</p>
                                            <p className="text-xs text-muted-foreground">{row.key}</p>
                                        </td>
                                        <td className="py-3 pr-4">{permission?.category || '-'}</td>
                                        <td className="py-3 pr-4">
                                            <span className={`rounded-full px-2 py-1 text-xs ${row.effectiveEffect === 'allow' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'}`}>
                                                {row.configuredEffect ? row.effectiveEffect : `${row.defaultEffect} default`}
                                            </span>
                                        </td>
                                        <td className="py-3 pr-4">
                                            <input
                                                value={roleReasons[reasonKey] ?? row.reason ?? ''}
                                                onChange={(event) => setRoleReasons((current) => ({
                                                    ...current,
                                                    [reasonKey]: event.target.value,
                                                }))}
                                                placeholder="Optional reason"
                                                className="w-full min-w-48 rounded-lg border border-border bg-background px-3 py-2 text-xs"
                                            />
                                        </td>
                                        <td className="py-3">
                                            <div className="flex justify-end gap-2">
                                                <button type="button" onClick={() => saveRolePermission(row.key, 'allow')} disabled={saving} className="rounded-lg border border-emerald-500/40 px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-60">Allow</button>
                                                <button type="button" onClick={() => saveRolePermission(row.key, 'deny')} disabled={saving} className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-60">Deny</button>
                                                <button type="button" onClick={() => saveRolePermission(row.key, 'default')} disabled={saving || !row.configuredEffect} className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-secondary disabled:opacity-50">Default</button>
                                            </div>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </section>

            <section className="rounded-lg border border-border bg-card p-5 space-y-4">
                <div>
                    <h2 className="text-xl font-semibold">User override</h2>
                    <p className="text-sm text-muted-foreground">Apply an exception to one account by user id.</p>
                </div>
                <div className="grid gap-3 md:grid-cols-[1fr_1fr_140px]">
                    <input value={overrideUserId} onChange={(event) => setOverrideUserId(event.target.value)} placeholder="User id" className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                    <select value={overridePermissionKey} onChange={(event) => setOverridePermissionKey(event.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
                        {catalog.map((permission) => <option key={permission.key} value={permission.key}>{permission.label}</option>)}
                    </select>
                    <select value={overrideEffect} onChange={(event) => setOverrideEffect(event.target.value as Effect)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
                        <option value="deny">Deny</option>
                        <option value="allow">Allow</option>
                    </select>
                </div>
                <div className="flex flex-col gap-3 md:flex-row">
                    <input value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} placeholder="Optional reason" className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                    <button type="button" onClick={saveUserOverride} disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">Save override</button>
                    <button type="button" onClick={removeUserOverride} disabled={saving} className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-secondary disabled:opacity-60">Remove</button>
                </div>
            </section>

            <section className="rounded-lg border border-border bg-card p-5 space-y-4">
                <div>
                    <h2 className="text-xl font-semibold">Recent audit events</h2>
                    <p className="text-sm text-muted-foreground">Latest permission changes and rejected safety actions.</p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="border-b border-border text-muted-foreground">
                            <tr>
                                <th className="py-3 text-left">Time</th>
                                <th className="py-3 text-left">Target</th>
                                <th className="py-3 text-left">Permission</th>
                                <th className="py-3 text-left">Result</th>
                                <th className="py-3 text-left">Reason</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {auditEvents.length === 0 ? (
                                <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">No audit events yet.</td></tr>
                            ) : auditEvents.map((event) => (
                                <tr key={event.id}>
                                    <td className="py-3 pr-4 whitespace-nowrap">{new Date(event.createdAt).toLocaleString()}</td>
                                    <td className="py-3 pr-4">{event.targetType}:{event.targetId}</td>
                                    <td className="py-3 pr-4">{event.permissionKey || '-'}</td>
                                    <td className="py-3 pr-4">{event.result}</td>
                                    <td className="py-3">{event.reason || '-'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    )
}
