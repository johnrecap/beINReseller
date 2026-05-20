'use client'

import { useState, useEffect } from 'react'
import { Save, Loader2, AlertTriangle, Bell, Code } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from '@/hooks/useTranslation'
import {
    DEFAULT_BEIN_LOGIN_FAILURE_THRESHOLD,
    MAX_BEIN_LOGIN_FAILURE_THRESHOLD,
    MIN_BEIN_LOGIN_FAILURE_THRESHOLD,
} from '@/lib/bein-login-failure-threshold'

export default function SettingsForm() {
    const { t } = useTranslation()
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [settings, setSettings] = useState<Record<string, string>>({})

    useEffect(() => {
        fetch('/api/settings')
            .then(res => res.json())
            .then(data => {
                setSettings(data)
                setLoading(false)
            })
            .catch(() => {
                toast.error(t.admin.settings.messages.loadError)
                setLoading(false)
            })
    }, [t])

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        setSaving(true)

        const formData = new FormData(e.currentTarget)
        const data = Object.fromEntries(formData.entries())

        // Checkbox handling
        if (!formData.get('maintenance_mode')) {
            data['maintenance_mode'] = 'false'
            data['maintenance_pause_until'] = ''
        } else {
            data['maintenance_mode'] = 'true'
            const durationValue = Number(formData.get('maintenance_pause_duration_value') || 0)
            const durationUnit = String(formData.get('maintenance_pause_duration_unit') || 'hours')

            if (Number.isFinite(durationValue) && durationValue > 0) {
                const multiplier = durationUnit === 'days' ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000
                data['maintenance_pause_until'] = new Date(Date.now() + durationValue * multiplier).toISOString()
            }
        }

        if (!formData.get('installment_dev_mode')) {
            data['installment_dev_mode'] = 'false'
        } else {
            data['installment_dev_mode'] = 'true'
        }

        try {
            const res = await fetch('/api/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            })

            if (!res.ok) throw new Error(t.admin.settings.messages.saveError)

            toast.success(t.admin.settings.messages.saveSuccess)
        } catch {
            toast.error(t.admin.settings.messages.saveError)
        } finally {
            setSaving(false)
        }
    }

    if (loading) return <div className="p-8 text-center text-muted-foreground">{t.common.loading}...</div>

    return (
        <form onSubmit={handleSubmit} className="space-y-8 max-w-4xl mx-auto pb-12">

            {/* System Settings */}
            <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
                <div className="bg-amber-50/50 dark:bg-amber-900/20 p-4 border-b border-amber-100 dark:border-amber-800 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                    <h3 className="font-bold text-foreground">{t.admin.settings.sections.system}</h3>
                </div>
                <div className="p-6 space-y-6">
                    <div className="flex items-center gap-3 p-4 bg-secondary rounded-lg">
                        <input
                            name="maintenance_mode"
                            type="checkbox"
                            id="maintenance_mode"
                            defaultChecked={settings.maintenance_mode === 'true'}
                            className="w-5 h-5 text-amber-600 rounded focus:ring-amber-500"
                        />
                        <label htmlFor="maintenance_mode" className="font-medium text-foreground cursor-pointer select-none">
                            {t.admin.settings.fields.maintenanceMode}
                        </label>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-foreground mb-1">{t.admin.settings.fields.maintenanceMsg}</label>
                        <textarea
                            name="maintenance_message"
                            rows={2}
                            defaultValue={settings.maintenance_message}
                            className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground"
                            placeholder={t.admin.settings.fields.maintenancePlaceholder}
                        />
                    </div>

                    <div className="stitch-glass rounded-lg p-4">
                        <div className="mb-4">
                            <span className="stitch-label text-[#9ffb06]">Operation Pause Timer</span>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Set the countdown shown on the maintenance waiting screen.
                            </p>
                        </div>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            <label className="text-sm font-medium text-foreground">
                                Duration
                                <input
                                    name="maintenance_pause_duration_value"
                                    type="number"
                                    min={1}
                                    defaultValue={settings.maintenance_pause_duration_value || '4'}
                                    className="mt-2 w-full rounded-lg border border-white/10 bg-[#0e0e14] px-4 py-3 font-mono text-foreground outline-none focus:border-[#571bc1] focus:ring-1 focus:ring-[#571bc1]"
                                />
                            </label>
                            <label className="text-sm font-medium text-foreground">
                                Unit
                                <select
                                    name="maintenance_pause_duration_unit"
                                    defaultValue={settings.maintenance_pause_duration_unit || 'hours'}
                                    className="mt-2 w-full rounded-lg border border-white/10 bg-[#0e0e14] px-4 py-3 text-foreground outline-none focus:border-[#571bc1] focus:ring-1 focus:ring-[#571bc1]"
                                >
                                    <option value="hours">Hours</option>
                                    <option value="days">Days</option>
                                </select>
                            </label>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-foreground mb-1 flex items-center gap-2">
                            <Bell className="w-4 h-4 text-muted-foreground" />
                            {t.admin.settings.fields.notificationMsg}
                        </label>
                        <textarea
                            name="notification_message"
                            rows={2}
                            defaultValue={settings.notification_message}
                            className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground"
                            placeholder={t.admin.settings.fields.notificationPlaceholder}
                        />
                    </div>
                </div>
            </div>

            {/* Feature Toggles */}
            <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
                <div className="bg-blue-50/50 dark:bg-blue-900/20 p-4 border-b border-blue-100 dark:border-blue-800 flex items-center gap-2">
                    <Code className="w-5 h-5 text-blue-600" />
                    <h3 className="font-bold text-foreground">{t.admin.settings.sections.features || 'Feature Toggles'}</h3>
                </div>
                <div className="p-6 space-y-6">
                    <div className="flex items-center gap-3 p-4 bg-secondary rounded-lg">
                        <input
                            name="installment_dev_mode"
                            type="checkbox"
                            id="installment_dev_mode"
                            defaultChecked={settings.installment_dev_mode === 'true'}
                            className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                        />
                        <label htmlFor="installment_dev_mode" className="font-medium text-foreground cursor-pointer select-none">
                            {t.admin.settings.fields.installmentDevMode || 'Installment Section Dev Mode (Blur effect)'}
                        </label>
                    </div>

                    <div className="space-y-2">
                        <label
                            htmlFor="worker_bein_login_failure_threshold"
                            className="block text-sm font-medium text-foreground"
                        >
                            beIN login failure threshold
                        </label>
                        <input
                            id="worker_bein_login_failure_threshold"
                            name="worker_bein_login_failure_threshold"
                            type="number"
                            min={MIN_BEIN_LOGIN_FAILURE_THRESHOLD}
                            max={MAX_BEIN_LOGIN_FAILURE_THRESHOLD}
                            required
                            defaultValue={
                                settings.worker_bein_login_failure_threshold ||
                                String(DEFAULT_BEIN_LOGIN_FAILURE_THRESHOLD)
                            }
                            className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground"
                        />
                        <p className="text-sm text-muted-foreground">
                            Consecutive failed beIN logins before an account is flagged for password update.
                        </p>
                    </div>
                </div>
            </div>

            {/* Save Button */}
            <button
                type="submit"
                disabled={saving}
                className="fixed bottom-6 left-6 z-40 flex items-center gap-2 bg-[#00A651] text-white px-8 py-3 rounded-full shadow-2xl hover:bg-[#008f45] transition-all hover:scale-105 active:scale-95 disabled:opacity-70 disabled:hover:scale-100"
            >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                <span>{t.admin.settings.actions.save}</span>
            </button>

        </form>
    )
}
