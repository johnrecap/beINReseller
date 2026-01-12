'use client'

import { useState, useEffect } from 'react'
import { Save, Loader2, AlertTriangle, Bell, DollarSign, Settings as SettingsIcon } from 'lucide-react'
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

    if (loading) return <div className="p-8 text-center text-gray-500">{t.common.loading}...</div>

    return (
        <form onSubmit={handleSubmit} className="space-y-8 max-w-4xl mx-auto pb-12">

            {/* 1. Subscription Prices */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="bg-blue-50/50 p-4 border-b border-blue-50 flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-blue-600" />
                    <h3 className="font-bold text-gray-800">{t.admin.settings.sections.subscriptionPrices} ({t.header.currency})</h3>
                </div>
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">{t.admin.settings.fields.renew1Month}</label>
                        <input name="price_1_month" type="number" step="0.01" defaultValue={settings.price_1_month} className="w-full px-4 py-2 border rounded-lg dir-ltr" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">{t.admin.settings.fields.renew3Months}</label>
                        <input name="price_3_months" type="number" step="0.01" defaultValue={settings.price_3_months} className="w-full px-4 py-2 border rounded-lg dir-ltr" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">{t.admin.settings.fields.renew6Months}</label>
                        <input name="price_6_months" type="number" step="0.01" defaultValue={settings.price_6_months} className="w-full px-4 py-2 border rounded-lg dir-ltr" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">{t.admin.settings.fields.renew12Months}</label>
                        <input name="price_12_months" type="number" step="0.01" defaultValue={settings.price_12_months} className="w-full px-4 py-2 border rounded-lg dir-ltr" />
                    </div>
                </div>
            </div>

            {/* 2. Service Prices */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="bg-purple-50/50 p-4 border-b border-purple-50 flex items-center gap-2">
                    <SettingsIcon className="w-5 h-5 text-purple-600" />
                    <h3 className="font-bold text-gray-800">{t.admin.settings.sections.servicePrices}</h3>
                </div>
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">{t.admin.settings.fields.checkBalancePrice}</label>
                        <input name="price_check_balance" type="number" step="0.01" defaultValue={settings.price_check_balance} className="w-full px-4 py-2 border rounded-lg dir-ltr" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">{t.admin.settings.fields.signalRefreshPrice}</label>
                        <input name="price_signal_refresh" type="number" step="0.01" defaultValue={settings.price_signal_refresh} className="w-full px-4 py-2 border rounded-lg dir-ltr" />
                    </div>
                </div>
            </div>

            {/* 3. System System */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="bg-amber-50/50 p-4 border-b border-amber-50 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                    <h3 className="font-bold text-gray-800">{t.admin.settings.sections.system}</h3>
                </div>
                <div className="p-6 space-y-6">
                    <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
                        <input
                            name="maintenance_mode"
                            type="checkbox"
                            id="maintenance_mode"
                            defaultChecked={settings.maintenance_mode === 'true'}
                            className="w-5 h-5 text-amber-600 rounded focus:ring-amber-500"
                        />
                        <label htmlFor="maintenance_mode" className="font-medium text-gray-800 cursor-pointer select-none">
                            {t.admin.settings.fields.maintenanceMode}
                        </label>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">{t.admin.settings.fields.maintenanceMsg}</label>
                        <textarea
                            name="maintenance_message"
                            rows={2}
                            defaultValue={settings.maintenance_message}
                            className="w-full px-4 py-2 border rounded-lg"
                            placeholder={t.admin.settings.fields.maintenancePlaceholder}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                            <Bell className="w-4 h-4 text-gray-500" />
                            {t.admin.settings.fields.notificationMsg}
                        </label>
                        <textarea
                            name="notification_message"
                            rows={2}
                            defaultValue={settings.notification_message}
                            className="w-full px-4 py-2 border rounded-lg"
                            placeholder={t.admin.settings.fields.notificationPlaceholder}
                        />
                    </div>
                </div>
            </div>

            {/* Save Button */}
            <button
                type="submit"
                disabled={saving}
                className="fixed bottom-6 left-6 z-40 flex items-center gap-2 bg-gray-900 text-white px-8 py-3 rounded-full shadow-2xl hover:bg-black transition-all hover:scale-105 active:scale-95 disabled:opacity-70 disabled:hover:scale-100"
            >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                <span>{t.admin.settings.actions.save}</span>
            </button>

        </form>
    )
}
