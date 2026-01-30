'use client'

/**
 * Store Settings Form Component
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Settings, DollarSign, CreditCard, Loader2, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'

interface StoreSettingsFormProps {
    settings: Record<string, string>
}

export function StoreSettingsForm({ settings }: StoreSettingsFormProps) {
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [showSecretKey, setShowSecretKey] = useState(false)
    const [showWebhookSecret, setShowWebhookSecret] = useState(false)

    const [formData, setFormData] = useState({
        store_enabled: settings.store_enabled === 'true',
        store_name: settings.store_name || 'Desh Store',
        store_name_ar: settings.store_name_ar || 'متجر دش',
        store_markup_percentage: settings.store_markup_percentage || '20',
        store_min_order_sar: settings.store_min_order_sar || '0',
        store_min_order_egp: settings.store_min_order_egp || '0',
        stripe_public_key: settings.stripe_public_key || '',
        stripe_secret_key: settings.stripe_secret_key || '',
        stripe_webhook_secret: settings.stripe_webhook_secret || '',
        store_contact_email: settings.store_contact_email || '',
        store_contact_phone_sa: settings.store_contact_phone_sa || '',
        store_contact_phone_eg: settings.store_contact_phone_eg || '',
    })

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        try {
            const res = await fetch('/api/admin/store/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...formData,
                    store_enabled: formData.store_enabled.toString(),
                })
            })

            if (!res.ok) throw new Error('Failed to save settings')

            toast.success('Settings saved successfully')
            router.refresh()
        } catch (error) {
            toast.error('Failed to save settings')
        } finally {
            setLoading(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            {/* General Settings */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                        <Settings className="h-5 w-5" />
                        General Settings
                    </CardTitle>
                    <CardDescription>Basic store configuration</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                        <div>
                            <Label htmlFor="store_enabled" className="font-medium">Enable Store</Label>
                            <p className="text-sm text-muted-foreground">Allow customers to use the mobile app</p>
                        </div>
                        <Switch
                            id="store_enabled"
                            checked={formData.store_enabled}
                            onCheckedChange={(checked) => setFormData({ ...formData, store_enabled: checked })}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="store_name">Store Name (English)</Label>
                            <Input
                                id="store_name"
                                value={formData.store_name}
                                onChange={(e) => setFormData({ ...formData, store_name: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="store_name_ar">Store Name (Arabic)</Label>
                            <Input
                                id="store_name_ar"
                                value={formData.store_name_ar}
                                onChange={(e) => setFormData({ ...formData, store_name_ar: e.target.value })}
                                dir="rtl"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="store_contact_email">Contact Email</Label>
                            <Input
                                id="store_contact_email"
                                type="email"
                                value={formData.store_contact_email}
                                onChange={(e) => setFormData({ ...formData, store_contact_email: e.target.value })}
                                placeholder="support@example.com"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="store_contact_phone_sa">Phone (Saudi)</Label>
                            <Input
                                id="store_contact_phone_sa"
                                value={formData.store_contact_phone_sa}
                                onChange={(e) => setFormData({ ...formData, store_contact_phone_sa: e.target.value })}
                                placeholder="+966..."
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="store_contact_phone_eg">Phone (Egypt)</Label>
                            <Input
                                id="store_contact_phone_eg"
                                value={formData.store_contact_phone_eg}
                                onChange={(e) => setFormData({ ...formData, store_contact_phone_eg: e.target.value })}
                                placeholder="+20..."
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Pricing Settings */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                        <DollarSign className="h-5 w-5" />
                        Pricing Settings
                    </CardTitle>
                    <CardDescription>Configure markup and minimum amounts</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="store_markup_percentage">Markup Percentage (%)</Label>
                        <div className="flex items-center gap-2">
                            <Input
                                id="store_markup_percentage"
                                type="number"
                                min="0"
                                max="100"
                                value={formData.store_markup_percentage}
                                onChange={(e) => setFormData({ ...formData, store_markup_percentage: e.target.value })}
                                className="max-w-[120px]"
                            />
                            <span className="text-muted-foreground">%</span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            Markup applied to beIN subscription prices. Example: 20% markup means beIN price of $100 becomes $120 for customer.
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="store_min_order_sar">Minimum Order (SAR)</Label>
                            <Input
                                id="store_min_order_sar"
                                type="number"
                                min="0"
                                step="0.01"
                                value={formData.store_min_order_sar}
                                onChange={(e) => setFormData({ ...formData, store_min_order_sar: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="store_min_order_egp">Minimum Order (EGP)</Label>
                            <Input
                                id="store_min_order_egp"
                                type="number"
                                min="0"
                                step="0.01"
                                value={formData.store_min_order_egp}
                                onChange={(e) => setFormData({ ...formData, store_min_order_egp: e.target.value })}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Stripe Settings */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                        <CreditCard className="h-5 w-5" />
                        Stripe Payment Settings
                    </CardTitle>
                    <CardDescription>Configure Stripe API keys for payment processing</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="stripe_public_key">Publishable Key</Label>
                        <Input
                            id="stripe_public_key"
                            value={formData.stripe_public_key}
                            onChange={(e) => setFormData({ ...formData, stripe_public_key: e.target.value })}
                            placeholder="pk_live_..."
                            className="font-mono text-sm"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="stripe_secret_key">Secret Key</Label>
                        <div className="relative">
                            <Input
                                id="stripe_secret_key"
                                type={showSecretKey ? 'text' : 'password'}
                                value={formData.stripe_secret_key}
                                onChange={(e) => setFormData({ ...formData, stripe_secret_key: e.target.value })}
                                placeholder="sk_live_..."
                                className="font-mono text-sm pr-10"
                            />
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                                onClick={() => setShowSecretKey(!showSecretKey)}
                            >
                                {showSecretKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="stripe_webhook_secret">Webhook Secret</Label>
                        <div className="relative">
                            <Input
                                id="stripe_webhook_secret"
                                type={showWebhookSecret ? 'text' : 'password'}
                                value={formData.stripe_webhook_secret}
                                onChange={(e) => setFormData({ ...formData, stripe_webhook_secret: e.target.value })}
                                placeholder="whsec_..."
                                className="font-mono text-sm pr-10"
                            />
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                                onClick={() => setShowWebhookSecret(!showWebhookSecret)}
                            >
                                {showWebhookSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            Webhook URL: <code className="bg-muted px-1 rounded">/api/store/webhooks/stripe</code>
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* Save Button */}
            <div className="flex justify-end">
                <Button type="submit" disabled={loading} size="lg">
                    {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Save Settings
                </Button>
            </div>
        </form>
    )
}
