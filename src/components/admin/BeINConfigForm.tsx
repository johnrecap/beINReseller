'use client'

import { useState, useEffect, useMemo } from 'react'
import { Save, Loader2, Eye, EyeOff, HelpCircle } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from '@/hooks/useTranslation'

interface ConfigSection {
    title: string
    icon: string
    fields: ConfigField[]
}

interface ConfigField {
    key: string
    label: string
    type: 'text' | 'password' | 'checkbox' | 'number'
    placeholder?: string
    hint?: string
}

export default function BeINConfigForm() {
    const { t } = useTranslation()
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [config, setConfig] = useState<Record<string, string>>({})
    const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({})

    const CONFIG_SECTIONS: ConfigSection[] = useMemo(() => [
        {
            title: t.admin.config.sections.captcha,
            icon: '🧩',
            fields: [
                { key: 'captcha_2captcha_key', label: t.admin.config.fields.apiKey, type: 'password', placeholder: t.admin.config.fields.apiKeyPlaceholder },
                { key: 'captcha_enabled', label: t.admin.config.fields.autoCaptcha, type: 'checkbox' },
            ]
        },
        {
            title: t.admin.config.sections.urls,
            icon: '🔗',
            fields: [
                { key: 'bein_login_url', label: t.admin.config.fields.loginPage, type: 'text', placeholder: 'https://sbs.bein.com/' },
                { key: 'bein_renew_url', label: t.admin.config.fields.renewPage, type: 'text', placeholder: '/Renew' },
                { key: 'bein_check_url', label: t.admin.config.fields.checkPage, type: 'text', placeholder: '/CheckBalance' },
                { key: 'bein_signal_url', label: t.admin.config.fields.signalPage, type: 'text', placeholder: '/RefreshSignal' },
            ]
        },
        {
            title: t.admin.config.sections.loginSelectors,
            icon: '🎯',
            fields: [
                { key: 'bein_sel_username', label: t.admin.config.fields.usernameField, type: 'text', placeholder: '#Login1_UserName' },
                { key: 'bein_sel_password', label: t.admin.config.fields.passwordField, type: 'text', placeholder: '#Login1_Password' },
                { key: 'bein_sel_2fa', label: t.admin.config.fields.faField, type: 'text', placeholder: 'input[placeholder="Enter 2FA"]' },
                { key: 'bein_sel_captcha_img', label: t.admin.config.fields.captchaImg, type: 'text', placeholder: 'img[src*="captcha"]' },
                { key: 'bein_sel_captcha_input', label: t.admin.config.fields.captchaInput, type: 'text', placeholder: 'input[name="captcha"]' },
                { key: 'bein_sel_submit', label: t.admin.config.fields.submitBtn, type: 'text', placeholder: 'input[value="Sign In"]' },
            ]
        },
        {
            title: t.admin.config.sections.renewSelectors,
            icon: '🔄',
            fields: [
                { key: 'bein_sel_card_input', label: t.admin.config.fields.cardInput, type: 'text', placeholder: '#CardNumber' },
                { key: 'bein_sel_duration', label: t.admin.config.fields.durationList, type: 'text', placeholder: '#Duration' },
                { key: 'bein_sel_renew_submit', label: t.admin.config.fields.renewSubmit, type: 'text', placeholder: '#btnRenew' },
                { key: 'bein_sel_success_msg', label: t.admin.config.fields.successMsg, type: 'text', placeholder: '.alert-success' },
                { key: 'bein_sel_error_msg', label: t.admin.config.fields.errorMsg, type: 'text', placeholder: '.alert-danger' },
            ]
        },
        {
            title: t.admin.config.sections.checkSelectors,
            icon: '💰',
            fields: [
                { key: 'bein_sel_check_card', label: t.admin.config.fields.cardInput, type: 'text', placeholder: '#CardNumber' },
                { key: 'bein_sel_check_submit', label: t.admin.config.fields.checkSubmit, type: 'text', placeholder: '#btnCheck' },
                { key: 'bein_sel_balance_result', label: t.admin.config.fields.balanceResult, type: 'text', placeholder: '.balance-info' },
            ]
        },
        {
            title: t.admin.config.sections.poolSettings || 'إعدادات توزيع الحسابات',
            icon: '🔀',
            fields: [
                { key: 'pool_max_requests_per_account', label: t.admin.config.fields.maxRequestsPerAccount || 'الحد الأقصى للطلبات لكل حساب', type: 'number', placeholder: '5', hint: t.admin.config.hints?.maxRequestsPerAccount || 'عدد الطلبات المسموحة لكل حساب في النافذة الزمنية' },
                { key: 'pool_rate_limit_window_seconds', label: t.admin.config.fields.rateLimitWindow || 'نافذة Rate Limit (ثانية)', type: 'number', placeholder: '300', hint: t.admin.config.hints?.rateLimitWindow || '300 = 5 دقائق' },
                { key: 'pool_cooldown_after_failures', label: t.admin.config.fields.cooldownAfterFailures || 'عدد الفشل قبل Cooldown', type: 'number', placeholder: '3' },
                { key: 'pool_cooldown_duration_seconds', label: t.admin.config.fields.cooldownDuration || 'مدة Cooldown (ثانية)', type: 'number', placeholder: '600', hint: t.admin.config.hints?.cooldownDuration || '600 = 10 دقائق' },
                { key: 'pool_min_delay_ms', label: t.admin.config.fields.minDelay || 'الحد الأدنى للتأخير (مللي ثانية)', type: 'number', placeholder: '2000' },
                { key: 'pool_max_delay_ms', label: t.admin.config.fields.maxDelay || 'الحد الأقصى للتأخير (مللي ثانية)', type: 'number', placeholder: '5000' },
                { key: 'pool_max_consecutive_failures', label: t.admin.config.fields.maxConsecutiveFailures || 'الحد الأقصى للفشل المتتالي', type: 'number', placeholder: '5' },
                { key: 'pool_auto_disable_on_error', label: t.admin.config.fields.autoDisable || 'تعطيل الحساب تلقائياً عند الفشل المتكرر', type: 'checkbox' },
            ]
        },
        {
            title: t.admin.config.sections.advanced,
            icon: '⚙️',
            fields: [
                { key: 'worker_session_timeout', label: t.admin.config.fields.sessionTimeout, type: 'number', placeholder: '25' },
                { key: 'worker_max_retries', label: t.admin.config.fields.maxRetries, type: 'number', placeholder: '3' },
                { key: 'worker_headless', label: t.admin.config.fields.headless, type: 'checkbox' },
            ]
        },
        {
            title: t.admin.config.sections.userProxySettings || 'إعدادات حساسة للنظام',
            icon: '🔗',
            fields: [
                { 
                    key: 'user_proxy_limit', 
                    label: t.admin.config.fields.userProxyLimit || 'حد التوزيع الداخلي للنظام', 
                    type: 'number', 
                    placeholder: '10',
                    hint: t.admin.config.hints?.userProxyLimit || '⚠️ تحذير هام: لا تقم بتغيير هذا الرقم نهائياً إلا بعد التواصل مع الدعم الفني. تغيير هذه القيمة قد يؤثر على عمل النظام بشكل كامل.'
                },
            ]
        },
    ], [t])

    useEffect(() => {
        fetch('/api/admin/bein-config')
            .then(res => res.json())
            .then(data => {
                if (!data.error) setConfig(data)
                setLoading(false)
            })
            .catch(() => {
                toast.error(t.admin.config.messages.loadError)
                setLoading(false)
            })
    }, [t])

    const handleChange = (key: string, value: string | boolean) => {
        setConfig(prev => ({ ...prev, [key]: String(value) }))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setSaving(true)

        try {
            const res = await fetch('/api/admin/bein-config', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config),
            })

            if (!res.ok) throw new Error(t.admin.config.messages.saveError)

            toast.success(t.admin.config.messages.saveSuccess)
        } catch {
            toast.error(t.admin.config.messages.saveError)
        } finally {
            setSaving(false)
        }
    }

    const toggleShowPassword = (key: string) => {
        setShowPasswords(prev => ({ ...prev, [key]: !prev[key] }))
    }

    if (loading) {
        return (
            <div className="p-8 text-center text-muted-foreground">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                {t.common.loading}...
            </div>
        )
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl mx-auto pb-24">
            {CONFIG_SECTIONS.map((section, idx) => (
                <div key={idx} className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
                    <div className="bg-gradient-to-r from-secondary to-card p-4 border-b border-border">
                        <h3 className="font-bold text-foreground flex items-center gap-2">
                            <span className="text-xl">{section.icon}</span>
                            {section.title}
                        </h3>
                    </div>
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                        {section.fields.map((field) => (
                            <div key={field.key} className={field.type === 'checkbox' ? 'md:col-span-2' : ''}>
                                {field.type === 'checkbox' ? (
                                    <label className="flex items-center gap-3 p-3 bg-secondary rounded-lg cursor-pointer hover:bg-secondary/80 transition-colors">
                                        <input
                                            type="checkbox"
                                            checked={config[field.key] === 'true'}
                                            onChange={(e) => handleChange(field.key, e.target.checked)}
                                            className="w-5 h-5 rounded text-[#00A651] focus:ring-[#00A651]"
                                        />
                                        <span className="font-medium text-foreground">{field.label}</span>
                                    </label>
                                ) : (
                                    <div>
                                        <label className="block text-sm font-medium text-foreground mb-1.5">
                                            {field.label}
                                            {field.hint && (
                                                <span className="inline-block mr-1 text-muted-foreground" title={field.hint}>
                                                    <HelpCircle className="w-4 h-4 inline" />
                                                </span>
                                            )}
                                        </label>
                                        <div className="relative">
                                            <input
                                                type={field.type === 'password' && !showPasswords[field.key] ? 'password' : field.type === 'number' ? 'number' : 'text'}
                                                value={config[field.key] || ''}
                                                onChange={(e) => handleChange(field.key, e.target.value)}
                                                placeholder={field.placeholder}
                                                className="w-full px-4 py-2.5 border border-border rounded-lg focus:outline-none focus:border-[#00A651] focus:ring-1 focus:ring-[#00A651] transition-all dir-ltr text-left bg-background text-foreground"
                                            />
                                            {field.type === 'password' && (
                                                <button
                                                    type="button"
                                                    onClick={() => toggleShowPassword(field.key)}
                                                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                                >
                                                    {showPasswords[field.key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            ))}

            {/* Save Button */}
            <div className="fixed bottom-6 left-6 z-40 flex gap-3">
                <button
                    type="submit"
                    disabled={saving}
                    className="flex items-center gap-2 bg-[#00A651] text-white px-8 py-3 rounded-full shadow-2xl hover:bg-[#008f45] transition-all hover:scale-105 active:scale-95 disabled:opacity-70 disabled:hover:scale-100"
                >
                    {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                    <span>{saving ? t.admin.config.actions.saving : t.admin.config.actions.save}</span>
                </button>
            </div>
        </form>
    )
}
