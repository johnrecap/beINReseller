'use client'

import { useState, useEffect } from 'react'
import { Save, Loader2, AlertTriangle, Bell, Code } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from '@/hooks/useTranslation'

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
        } else {
            data['maintenance_mode'] = 'true'
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
                    <h3 className="font-bold text-foreground">{(t.admin.settings.sections as any).features || 'التحكم بالميزات'}</h3>
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
                            {(t.admin.settings.fields as any).installmentDevMode || 'وضع التطوير لقسم الأقساط (إخفاء بتأثير الضبابية)'}
                        </label>
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
