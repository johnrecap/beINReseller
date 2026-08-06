'use client'

import { FormEvent, useCallback, useEffect, useState } from 'react'
import { RefreshCw, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cairoDateTimeLocalToUtcIso, utcIsoToCairoDateTimeLocal } from '@/lib/egypt-time'
import { POINTS_SETTINGS_COPY } from '@/lib/points/settings-copy'
import { useTranslation } from '@/hooks/useTranslation'

type PersonRate = {
    id: string
    username: string
    name?: string
    isActive: boolean
    overridePointsPerThousand: number | null
}

type PointsSettingsData = {
    settings: {
        pointsEnabled: boolean
        pointsStartAt: string | null
        cashConversionPoints: number
        cashConversionAmountUsd: number
        managerOwnedUserPointsEnabled: boolean
    }
    defaults: {
        userGlobalPointsPerThousand: number
        managerOwnedUserPointsPerThousand: number
        agentDefaultPointsPerThousand: number
        managerDefaultPointsPerThousand: number
    }
    agents: PersonRate[]
    managers: PersonRate[]
}

type DefaultsDraft = PointsSettingsData['defaults']
type ProgramDraft = PointsSettingsData['settings']
type OverrideDraft = Record<string, string>

function toRate(value: string) {
    const parsed = Number(value)
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

export default function AdminPointsSettingsClient() {
    const { t } = useTranslation()
    const [data, setData] = useState<PointsSettingsData | null>(null)
    const [defaults, setDefaults] = useState<DefaultsDraft>({
        userGlobalPointsPerThousand: 0,
        managerOwnedUserPointsPerThousand: 0,
        agentDefaultPointsPerThousand: 0,
        managerDefaultPointsPerThousand: 0,
    })
    const [program, setProgram] = useState<ProgramDraft>({
        pointsEnabled: false,
        pointsStartAt: null,
        cashConversionPoints: 100,
        cashConversionAmountUsd: 10,
        managerOwnedUserPointsEnabled: false,
    })
    const [agentOverrides, setAgentOverrides] = useState<OverrideDraft>({})
    const [managerOverrides, setManagerOverrides] = useState<OverrideDraft>({})
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)

    const loadData = useCallback(async (): Promise<boolean> => {
        setLoading(true)
        setError(null)

        try {
            const response = await fetch('/api/admin/points/settings', { cache: 'no-store' })
            const payload = await response.json().catch(() => null)
            if (!response.ok) {
                throw new Error(payload?.error || 'Failed to load point settings')
            }

            setData(payload)
            setDefaults({
                userGlobalPointsPerThousand: payload.defaults?.userGlobalPointsPerThousand
                    ?? payload.defaults?.userPointsPerThousand
                    ?? 0,
                managerOwnedUserPointsPerThousand: payload.defaults?.managerOwnedUserPointsPerThousand ?? 0,
                agentDefaultPointsPerThousand: payload.defaults?.agentDefaultPointsPerThousand
                    ?? payload.defaults?.agentPointsPerThousand
                    ?? 0,
                managerDefaultPointsPerThousand: payload.defaults?.managerDefaultPointsPerThousand
                    ?? payload.defaults?.managerPointsPerThousand
                    ?? 0,
            })
            setProgram({
                pointsEnabled: payload.settings?.pointsEnabled ?? false,
                pointsStartAt: utcIsoToCairoDateTimeLocal(payload.settings?.pointsStartAt ?? null) || null,
                cashConversionPoints: payload.settings?.cashConversionPoints ?? 100,
                cashConversionAmountUsd: payload.settings?.cashConversionAmountUsd ?? 10,
                managerOwnedUserPointsEnabled: payload.settings?.managerOwnedUserPointsEnabled ?? false,
            })
            setAgentOverrides(Object.fromEntries(
                payload.agents.map((agent: PersonRate) => [
                    agent.id,
                    agent.overridePointsPerThousand === null ? '' : agent.overridePointsPerThousand.toString(),
                ])
            ))
            setManagerOverrides(Object.fromEntries(
                payload.managers.map((manager: PersonRate) => [
                    manager.id,
                    manager.overridePointsPerThousand === null ? '' : manager.overridePointsPerThousand.toString(),
                ])
            ))
            return true
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load point settings')
            return false
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
                pointsEnabled: program.pointsEnabled,
                pointsStartAt: program.pointsStartAt ? cairoDateTimeLocalToUtcIso(program.pointsStartAt) : null,
                cashConversionPoints: program.cashConversionPoints,
                cashConversionAmountUsd: program.cashConversionAmountUsd,
                managerOwnedUserPointsEnabled: program.managerOwnedUserPointsEnabled,
                userGlobalPointsPerThousand: defaults.userGlobalPointsPerThousand,
                managerOwnedUserPointsPerThousand: defaults.managerOwnedUserPointsPerThousand,
                agentDefaultPointsPerThousand: defaults.agentDefaultPointsPerThousand,
                managerDefaultPointsPerThousand: defaults.managerDefaultPointsPerThousand,
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

            const reloaded = await loadData()
            if (!reloaded) {
                throw new Error('Point settings saved, but failed to reload saved values.')
            }
            setSuccess('Point settings saved.')
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
                        Configure spend-based points and instant point-to-balance conversion.
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
                    <h2 className="text-xl font-semibold">Program</h2>
                    <div className="mt-4 grid gap-4 md:grid-cols-5">
                        <label className="flex items-center gap-3 rounded-lg border border-border p-3">
                            <input
                                type="checkbox"
                                checked={program.pointsEnabled}
                                onChange={(event) => setProgram((draft) => ({
                                    ...draft,
                                    pointsEnabled: event.target.checked,
                                }))}
                                className="h-4 w-4"
                            />
                            <span>
                                <span className="block text-sm font-medium">Enabled</span>
                                <span className="mt-1 block text-xs text-muted-foreground">
                                    {t.admin.pointsSettings[POINTS_SETTINGS_COPY.programEnabled]}
                                </span>
                            </span>
                        </label>
                        <label className="block space-y-2">
                            <span className="text-sm text-muted-foreground">Start date</span>
                            <Input
                                type="datetime-local"
                                value={program.pointsStartAt ?? ''}
                                onChange={(event) => setProgram((draft) => ({
                                    ...draft,
                                    pointsStartAt: event.target.value || null,
                                }))}
                            />
                        </label>
                        <label className="block space-y-2">
                            <span className="text-sm text-muted-foreground">Conversion points</span>
                            <Input
                                type="number"
                                min="0.0001"
                                step="0.0001"
                                value={program.cashConversionPoints}
                                onChange={(event) => setProgram((draft) => ({
                                    ...draft,
                                    cashConversionPoints: toRate(event.target.value),
                                }))}
                            />
                        </label>
                        <label className="block space-y-2">
                            <span className="text-sm text-muted-foreground">Conversion balance USD</span>
                            <Input
                                type="number"
                                min="0.0001"
                                step="0.0001"
                                value={program.cashConversionAmountUsd}
                                onChange={(event) => setProgram((draft) => ({
                                    ...draft,
                                    cashConversionAmountUsd: toRate(event.target.value),
                                }))}
                            />
                        </label>
                        <label className="flex items-center gap-3 rounded-lg border border-border p-3">
                            <input
                                type="checkbox"
                                checked={program.managerOwnedUserPointsEnabled}
                                onChange={(event) => setProgram((draft) => ({
                                    ...draft,
                                    managerOwnedUserPointsEnabled: event.target.checked,
                                }))}
                                className="h-4 w-4"
                            />
                            <span>
                                <span className="block text-sm font-medium">Manager-owned user points</span>
                                <span className="mt-1 block text-xs text-muted-foreground">
                                    {t.admin.pointsSettings[POINTS_SETTINGS_COPY.managerOwnedUserToggle]}
                                </span>
                            </span>
                        </label>
                    </div>
                </section>

                <section className="rounded-lg border border-border bg-card p-4">
                    <h2 className="text-xl font-semibold">Default Rules</h2>
                    <div className="mt-4 grid gap-4 md:grid-cols-4">
                        <label className="block space-y-2">
                            <span className="text-sm text-muted-foreground">Normal user points per 1000 USD</span>
                            <span className="block text-xs text-muted-foreground">
                                {t.admin.pointsSettings[POINTS_SETTINGS_COPY.normalUserRate]}
                            </span>
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
                            <span className="text-sm text-muted-foreground">Manager-owned user points per 1000 USD</span>
                            <span className="block text-xs text-muted-foreground">
                                {t.admin.pointsSettings[POINTS_SETTINGS_COPY.managerOwnedUserRate]}
                            </span>
                            <Input
                                type="number"
                                min="0"
                                step="0.0001"
                                value={defaults.managerOwnedUserPointsPerThousand}
                                onChange={(event) => setDefaults((draft) => ({
                                    ...draft,
                                    managerOwnedUserPointsPerThousand: toRate(event.target.value),
                                }))}
                            />
                        </label>
                        <label className="block space-y-2">
                            <span className="text-sm text-muted-foreground">Agent points per 1000 USD</span>
                            <span className="block text-xs text-muted-foreground">
                                {t.admin.pointsSettings[POINTS_SETTINGS_COPY.agentRate]}
                            </span>
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
                            <span className="text-sm text-muted-foreground">Manager points per 1000 USD</span>
                            <span className="block text-xs text-muted-foreground">
                                {t.admin.pointsSettings[POINTS_SETTINGS_COPY.managerRate]}
                            </span>
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
