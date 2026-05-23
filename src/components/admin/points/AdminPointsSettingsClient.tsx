'use client'

import { FormEvent, useCallback, useEffect, useState } from 'react'
import { RefreshCw, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type PersonRate = {
    id: string
    username: string
    name?: string
    isActive: boolean
    overridePointsPerThousand: number | null
}

type PointsSettingsData = {
    defaults: {
        userGlobalPointsPerThousand: number
        agentDefaultPointsPerThousand: number
        managerDefaultPointsPerThousand: number
    }
    agents: PersonRate[]
    managers: PersonRate[]
}

type DefaultsDraft = PointsSettingsData['defaults']
type OverrideDraft = Record<string, string>

function toRate(value: string) {
    const parsed = Number(value)
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

export default function AdminPointsSettingsClient() {
    const [data, setData] = useState<PointsSettingsData | null>(null)
    const [defaults, setDefaults] = useState<DefaultsDraft>({
        userGlobalPointsPerThousand: 0,
        agentDefaultPointsPerThousand: 0,
        managerDefaultPointsPerThousand: 0,
    })
    const [agentOverrides, setAgentOverrides] = useState<OverrideDraft>({})
    const [managerOverrides, setManagerOverrides] = useState<OverrideDraft>({})
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)

    const loadData = useCallback(async () => {
        setLoading(true)
        setError(null)

        try {
            const response = await fetch('/api/admin/points/settings', { cache: 'no-store' })
            const payload = await response.json().catch(() => null)
            if (!response.ok) {
                throw new Error(payload?.error || 'Failed to load point settings')
            }

            setData(payload)
            setDefaults(payload.defaults)
            setAgentOverrides(Object.fromEntries(
                payload.agents.map((agent: PersonRate) => [agent.id, agent.overridePointsPerThousand?.toString() || ''])
            ))
            setManagerOverrides(Object.fromEntries(
                payload.managers.map((manager: PersonRate) => [manager.id, manager.overridePointsPerThousand?.toString() || ''])
            ))
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load point settings')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        loadData()
    }, [loadData])

    async function saveSettings(event: FormEvent) {
        event.preventDefault()
        setSaving(true)
        setError(null)
        setSuccess(null)

        try {
            const payload = {
                ...defaults,
                agentOverrides: Object.entries(agentOverrides)
                    .filter(([, value]) => value.trim() !== '')
                    .map(([agentId, value]) => ({ agentId, pointsPerThousand: toRate(value) })),
                managerOverrides: Object.entries(managerOverrides)
                    .filter(([, value]) => value.trim() !== '')
                    .map(([managerId, value]) => ({ managerId, pointsPerThousand: toRate(value) })),
            }

            const response = await fetch('/api/admin/points/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            })
            const result = await response.json().catch(() => null)
            if (!response.ok) {
                throw new Error(result?.error || 'Failed to save point settings')
            }

            setSuccess('Point settings saved.')
            await loadData()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save point settings')
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="mx-auto max-w-7xl space-y-6 p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                    <p className="text-sm text-muted-foreground">Admin configuration</p>
                    <h1 className="text-3xl font-bold text-foreground">Points Settings</h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                        Configure points per 1000 USD. Approved requests and manager top-ups keep rate snapshots.
                    </p>
                </div>
                <Button type="button" variant="outline" onClick={loadData} disabled={loading} className="gap-2">
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                </Button>
            </div>

            {error && (
                <div className="rounded-lg border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">
                    {error}
                </div>
            )}
            {success && (
                <div className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-200">
                    {success}
                </div>
            )}

            <form className="space-y-6" onSubmit={saveSettings}>
                <section className="rounded-lg border border-border bg-card p-4">
                    <h2 className="text-xl font-semibold">Default Rules</h2>
                    <div className="mt-4 grid gap-4 md:grid-cols-3">
                        <label className="block space-y-2">
                            <span className="text-sm text-muted-foreground">User points per 1000 USD</span>
                            <Input
                                type="number"
                                min="0"
                                step="0.0001"
                                value={defaults.userGlobalPointsPerThousand}
                                onChange={(event) => setDefaults((draft) => ({
                                    ...draft,
                                    userGlobalPointsPerThousand: toRate(event.target.value),
                                }))}
                            />
                        </label>
                        <label className="block space-y-2">
                            <span className="text-sm text-muted-foreground">Default agent points per 1000 USD</span>
                            <Input
                                type="number"
                                min="0"
                                step="0.0001"
                                value={defaults.agentDefaultPointsPerThousand}
                                onChange={(event) => setDefaults((draft) => ({
                                    ...draft,
                                    agentDefaultPointsPerThousand: toRate(event.target.value),
                                }))}
                            />
                        </label>
                        <label className="block space-y-2">
                            <span className="text-sm text-muted-foreground">Default manager points per 1000 USD</span>
                            <Input
                                type="number"
                                min="0"
                                step="0.0001"
                                value={defaults.managerDefaultPointsPerThousand}
                                onChange={(event) => setDefaults((draft) => ({
                                    ...draft,
                                    managerDefaultPointsPerThousand: toRate(event.target.value),
                                }))}
                            />
                        </label>
                    </div>
                </section>

                <div className="grid gap-6 xl:grid-cols-2">
                    <section className="rounded-lg border border-border bg-card p-4">
                        <h2 className="text-xl font-semibold">Agent Overrides</h2>
                        <div className="mt-4 space-y-3">
                            {data?.agents.length === 0 && (
                                <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
                                    No agents found.
                                </div>
                            )}
                            {data?.agents.map((agent) => (
                                <div key={agent.id} className="grid gap-3 rounded-lg border border-border p-3 md:grid-cols-[1fr_180px] md:items-center">
                                    <div>
                                        <div className="font-semibold">{agent.name || agent.username}</div>
                                        <div className="text-xs text-muted-foreground">{agent.username}</div>
                                    </div>
                                    <Input
                                        type="number"
                                        min="0"
                                        step="0.0001"
                                        placeholder="Default"
                                        value={agentOverrides[agent.id] ?? ''}
                                        onChange={(event) => setAgentOverrides((draft) => ({
                                            ...draft,
                                            [agent.id]: event.target.value,
                                        }))}
                                    />
                                </div>
                            ))}
                        </div>
                    </section>

                    <section className="rounded-lg border border-border bg-card p-4">
                        <h2 className="text-xl font-semibold">Manager Overrides</h2>
                        <div className="mt-4 space-y-3">
                            {data?.managers.length === 0 && (
                                <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
                                    No managers found.
                                </div>
                            )}
                            {data?.managers.map((manager) => (
                                <div key={manager.id} className="grid gap-3 rounded-lg border border-border p-3 md:grid-cols-[1fr_180px] md:items-center">
                                    <div>
                                        <div className="font-semibold">{manager.username}</div>
                                        <div className="text-xs text-muted-foreground">{manager.isActive ? 'Active' : 'Inactive'}</div>
                                    </div>
                                    <Input
                                        type="number"
                                        min="0"
                                        step="0.0001"
                                        placeholder="Default"
                                        value={managerOverrides[manager.id] ?? ''}
                                        onChange={(event) => setManagerOverrides((draft) => ({
                                            ...draft,
                                            [manager.id]: event.target.value,
                                        }))}
                                    />
                                </div>
                            ))}
                        </div>
                    </section>
                </div>

                <Button type="submit" disabled={saving || loading} className="gap-2">
                    <Save className="h-4 w-4" />
                    Save Points Settings
                </Button>
            </form>
        </div>
    )
}
