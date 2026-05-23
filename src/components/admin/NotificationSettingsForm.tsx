'use client'

import { FormEvent, useEffect, useState } from 'react'
import { Bell, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type NotificationSettings = {
    telegramEnabled: boolean
    telegramBotTokenConfigured: boolean
    telegramBotTokenMasked: string | null
    telegramTargetId: string
    telegramTargetLabel: string
    defaultWhatsappGroupUrl: string
    defaultWhatsappPhone: string
    defaultWhatsappLabel: string
}

const emptySettings: NotificationSettings = {
    telegramEnabled: false,
    telegramBotTokenConfigured: false,
    telegramBotTokenMasked: null,
    telegramTargetId: '',
    telegramTargetLabel: '',
    defaultWhatsappGroupUrl: '',
    defaultWhatsappPhone: '',
    defaultWhatsappLabel: '',
}

export default function NotificationSettingsForm() {
    const [settings, setSettings] = useState<NotificationSettings>(emptySettings)
    const [telegramBotToken, setTelegramBotToken] = useState('')
    const [clearToken, setClearToken] = useState(false)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [testing, setTesting] = useState(false)
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

    async function loadSettings() {
        setLoading(true)
        setMessage(null)
        try {
            const response = await fetch('/api/admin/notification-settings', { cache: 'no-store' })
            const payload = await response.json().catch(() => null)
            if (!response.ok) throw new Error(payload?.error || 'Failed to load notification settings')
            setSettings(payload.settings || emptySettings)
        } catch (error) {
            setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to load notification settings' })
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        void loadSettings()
    }, [])

    async function saveSettings(event: FormEvent) {
        event.preventDefault()
        setSaving(true)
        setMessage(null)
        try {
            const response = await fetch('/api/admin/notification-settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...settings,
                    telegramBotToken,
                    clearTelegramBotToken: clearToken,
                }),
            })
            const payload = await response.json().catch(() => null)
            if (!response.ok) throw new Error(payload?.error || 'Failed to save notification settings')
            setSettings(payload.settings)
            setTelegramBotToken('')
            setClearToken(false)
            setMessage({ type: 'success', text: 'Notification settings saved.' })
        } catch (error) {
            setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to save notification settings' })
        } finally {
            setSaving(false)
        }
    }

    async function testTelegram() {
        setTesting(true)
        setMessage(null)
        try {
            const response = await fetch('/api/admin/notification-settings/telegram/test', { method: 'POST' })
            const payload = await response.json().catch(() => null)
            if (!response.ok || payload?.success === false) throw new Error(payload?.error || 'Telegram test failed')
            setMessage({ type: 'success', text: 'Telegram test message sent.' })
        } catch (error) {
            setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Telegram test failed' })
        } finally {
            setTesting(false)
        }
    }

    if (loading) {
        return <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">Loading notification settings...</div>
    }

    return (
        <form onSubmit={saveSettings} className="max-w-4xl rounded-xl border border-border bg-card p-6">
            <div className="mb-5 flex items-center gap-2">
                <Bell className="h-5 w-5 text-sky-300" />
                <div>
                    <h2 className="text-xl font-bold text-foreground">Credit Request Notifications</h2>
                    <p className="text-sm text-muted-foreground">
                        Telegram sends the automatic request alert. WhatsApp remains a manual handoff after approval.
                    </p>
                </div>
            </div>

            {message && (
                <div className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
                    message.type === 'success'
                        ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
                        : 'border-red-400/30 bg-red-400/10 text-red-200'
                }`}>
                    {message.text}
                </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
                <label className="flex items-center gap-3 rounded-lg border border-border bg-background p-4 text-sm">
                    <input
                        type="checkbox"
                        checked={settings.telegramEnabled}
                        onChange={(event) => setSettings((draft) => ({ ...draft, telegramEnabled: event.target.checked }))}
                    />
                    Enable Telegram request alerts
                </label>
                <label className="flex items-center gap-3 rounded-lg border border-border bg-background p-4 text-sm">
                    <input
                        type="checkbox"
                        checked={clearToken}
                        onChange={(event) => setClearToken(event.target.checked)}
                    />
                    Clear saved Telegram token
                </label>
                <label className="block space-y-2">
                    <span className="text-sm text-muted-foreground">Telegram Bot Token</span>
                    <Input
                        type="password"
                        value={telegramBotToken}
                        onChange={(event) => setTelegramBotToken(event.target.value)}
                        placeholder={settings.telegramBotTokenConfigured ? `Keep existing token (${settings.telegramBotTokenMasked})` : 'Paste bot token'}
                    />
                </label>
                <label className="block space-y-2">
                    <span className="text-sm text-muted-foreground">Telegram Target ID</span>
                    <Input
                        value={settings.telegramTargetId}
                        onChange={(event) => setSettings((draft) => ({ ...draft, telegramTargetId: event.target.value }))}
                        placeholder="Chat, group, or channel id"
                    />
                </label>
                <label className="block space-y-2">
                    <span className="text-sm text-muted-foreground">Telegram Target Label</span>
                    <Input
                        value={settings.telegramTargetLabel}
                        onChange={(event) => setSettings((draft) => ({ ...draft, telegramTargetLabel: event.target.value }))}
                        placeholder="Admin Telegram"
                    />
                </label>
                <label className="block space-y-2">
                    <span className="text-sm text-muted-foreground">Default WhatsApp Group Link</span>
                    <Input
                        value={settings.defaultWhatsappGroupUrl}
                        onChange={(event) => setSettings((draft) => ({ ...draft, defaultWhatsappGroupUrl: event.target.value }))}
                        placeholder="https://chat.whatsapp.com/..."
                    />
                </label>
                <label className="block space-y-2">
                    <span className="text-sm text-muted-foreground">Default WhatsApp User Phone</span>
                    <Input
                        value={settings.defaultWhatsappPhone}
                        onChange={(event) => setSettings((draft) => ({ ...draft, defaultWhatsappPhone: event.target.value }))}
                        placeholder="201001234567"
                    />
                </label>
                <label className="block space-y-2">
                    <span className="text-sm text-muted-foreground">Default WhatsApp Label</span>
                    <Input
                        value={settings.defaultWhatsappLabel}
                        onChange={(event) => setSettings((draft) => ({ ...draft, defaultWhatsappLabel: event.target.value }))}
                        placeholder="Default group"
                    />
                </label>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
                <Button type="submit" loading={saving}>Save Notification Settings</Button>
                <Button type="button" variant="outline" onClick={testTelegram} loading={testing}>
                    <Send className="h-4 w-4" />
                    Test Telegram
                </Button>
            </div>
        </form>
    )
}
