'use client'

import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    Settings,
    Save,
    Smartphone,
    Wallet,
    Percent,
    AlertTriangle,
    Power,
    Wrench,
    Info
} from 'lucide-react'

interface AppSettings {
    appEnabled: boolean
    maintenanceMode: boolean
    appVersion: string
    minWalletTopup: number
    maxWalletTopup: number
    subscriptionMarkupPercent: number
    signalRefreshPrice: number
    shippingCostSA: number
    shippingCostEG: number
}

export default function MobileAppSettingsPage() {
    const [settings, setSettings] = useState<AppSettings>({
        appEnabled: true,
        maintenanceMode: false,
        appVersion: '1.0.0',
        minWalletTopup: 50,
        maxWalletTopup: 5000,
        subscriptionMarkupPercent: 10,
        signalRefreshPrice: 0,
        shippingCostSA: 30,
        shippingCostEG: 50
    })
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)

    useEffect(() => {
        fetchSettings()
    }, [])

    const fetchSettings = async () => {
        try {
            const res = await fetch('/api/admin/mobile-app/settings')
            const data = await res.json()
            if (data.success) {
                setSettings(data.settings)
            }
        } catch (error) {
            console.error('Failed to fetch settings:', error)
        }
        setLoading(false)
    }

    const saveSettings = async () => {
        setSaving(true)
        setSaved(false)
        try {
            const res = await fetch('/api/admin/mobile-app/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings)
            })
            if (res.ok) {
                setSaved(true)
                setTimeout(() => setSaved(false), 3000)
            }
        } catch (error) {
            console.error('Failed to save settings:', error)
        }
        setSaving(false)
    }

    const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
        setSettings(prev => ({ ...prev, [key]: value }))
    }

    if (loading) {
        return (
            <div className="flex justify-center py-20">
                <div className="animate-spin h-10 w-10 border-4 border-primary border-t-transparent rounded-full" />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg">
                        <Settings className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold">App Settings</h1>
                        <p className="text-muted-foreground">Configure mobile app settings</p>
                    </div>
                </div>
                <Button onClick={saveSettings} disabled={saving}>
                    <Save className="h-4 w-4 ml-2" />
                    {saving ? 'Saving...' : saved ? 'Saved ✓' : 'Save Settings'}
                </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* App Status */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Power className="h-5 w-5" />
                            App Status
                        </CardTitle>
                        <CardDescription>Control app enable/disable</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {/* App Enabled */}
                        <div className="flex items-center justify-between p-4 rounded-lg border">
                            <div className="flex items-center gap-3">
                                <Smartphone className={`h-5 w-5 ${settings.appEnabled ? 'text-green-500' : 'text-muted-foreground'}`} />
                                <div>
                                    <p className="font-medium">Enable App</p>
                                    <p className="text-sm text-muted-foreground">
                                        {settings.appEnabled ? 'App is running normally' : 'App is disabled'}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => updateSetting('appEnabled', !settings.appEnabled)}
                                className={`relative w-14 h-7 rounded-full transition-colors ${settings.appEnabled ? 'bg-green-500' : 'bg-muted'
                                    }`}
                            >
                                <span className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${settings.appEnabled ? 'right-1' : 'left-1'
                                    }`} />
                            </button>
                        </div>

                        {/* Maintenance Mode */}
                        <div className="flex items-center justify-between p-4 rounded-lg border">
                            <div className="flex items-center gap-3">
                                <Wrench className={`h-5 w-5 ${settings.maintenanceMode ? 'text-yellow-500' : 'text-muted-foreground'}`} />
                                <div>
                                    <p className="font-medium">Maintenance Mode</p>
                                    <p className="text-sm text-muted-foreground">
                                        {settings.maintenanceMode ? 'App is in maintenance mode' : 'App is running normally'}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => updateSetting('maintenanceMode', !settings.maintenanceMode)}
                                className={`relative w-14 h-7 rounded-full transition-colors ${settings.maintenanceMode ? 'bg-yellow-500' : 'bg-muted'
                                    }`}
                            >
                                <span className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${settings.maintenanceMode ? 'right-1' : 'left-1'
                                    }`} />
                            </button>
                        </div>

                        {/* App Version */}
                        <div className="flex items-center justify-between p-4 rounded-lg border">
                            <div className="flex items-center gap-3">
                                <Info className="h-5 w-5 text-muted-foreground" />
                                <div>
                                    <p className="font-medium">App Version</p>
                                    <p className="text-sm text-muted-foreground">Required current version</p>
                                </div>
                            </div>
                            <Input
                                value={settings.appVersion}
                                onChange={(e) => updateSetting('appVersion', e.target.value)}
                                className="w-32 text-center"
                                placeholder="1.0.0"
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* Wallet Settings */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Wallet className="h-5 w-5" />
                            Wallet Settings
                        </CardTitle>
                        <CardDescription>Wallet top-up limits</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-sm font-medium mb-2 block">
                                    Minimum Top-up
                                </label>
                                <Input
                                    type="number"
                                    value={settings.minWalletTopup}
                                    onChange={(e) => updateSetting('minWalletTopup', parseFloat(e.target.value) || 0)}
                                    min={0}
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium mb-2 block">
                                    Maximum Top-up
                                </label>
                                <Input
                                    type="number"
                                    value={settings.maxWalletTopup}
                                    onChange={(e) => updateSetting('maxWalletTopup', parseFloat(e.target.value) || 0)}
                                    min={0}
                                />
                            </div>
                        </div>

                        {settings.minWalletTopup > settings.maxWalletTopup && (
                            <div className="flex items-center gap-2 text-yellow-600 text-sm">
                                <AlertTriangle className="h-4 w-4" />
                                Minimum is greater than maximum
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Subscription Settings */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Percent className="h-5 w-5" />
                            Subscription Settings
                        </CardTitle>
                        <CardDescription>Profit margin and service prices</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <label className="text-sm font-medium mb-2 block">
                                Subscription Markup (%)
                            </label>
                            <div className="flex items-center gap-2">
                                <Input
                                    type="number"
                                    value={settings.subscriptionMarkupPercent}
                                    onChange={(e) => updateSetting('subscriptionMarkupPercent', parseFloat(e.target.value) || 0)}
                                    min={0}
                                    max={100}
                                    className="flex-1"
                                />
                                <span className="text-muted-foreground">%</span>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                                This percentage will be added to beIN original prices
                            </p>
                        </div>

                        <div>
                            <label className="text-sm font-medium mb-2 block">
                                Signal Refresh Price
                            </label>
                            <Input
                                type="number"
                                value={settings.signalRefreshPrice}
                                onChange={(e) => updateSetting('signalRefreshPrice', parseFloat(e.target.value) || 0)}
                                min={0}
                            />
                            <p className="text-sm text-muted-foreground mt-1">
                                {settings.signalRefreshPrice === 0 ? 'Free' : `${settings.signalRefreshPrice} SAR/EGP`}
                            </p>
                        </div>
                    </CardContent>
                </Card>

                {/* Shipping Settings */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Settings className="h-5 w-5" />
                            Shipping Settings
                        </CardTitle>
                        <CardDescription>Shipping costs per country</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-sm font-medium mb-2 block flex items-center gap-2">
                                    🇸🇦 Saudi Arabia (SAR)
                                </label>
                                <Input
                                    type="number"
                                    value={settings.shippingCostSA}
                                    onChange={(e) => updateSetting('shippingCostSA', parseFloat(e.target.value) || 0)}
                                    min={0}
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium mb-2 block flex items-center gap-2">
                                    🇪🇬 Egypt (EGP)
                                </label>
                                <Input
                                    type="number"
                                    value={settings.shippingCostEG}
                                    onChange={(e) => updateSetting('shippingCostEG', parseFloat(e.target.value) || 0)}
                                    min={0}
                                />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
