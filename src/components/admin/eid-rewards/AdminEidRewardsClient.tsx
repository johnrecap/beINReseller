'use client'

import { FormEvent, useCallback, useEffect, useState } from 'react'
import { Gift, Plus, RefreshCw, Save, Search, Trash2, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { cairoDateTimeLocalToUtcIso, utcIsoToCairoDateTimeLocal } from '@/lib/egypt-time'

type TierDraft = {
    points: number
    probabilityWeight: number
    label: string
    isActive: boolean
}

type RoleValue = 'ADMIN' | 'MANAGER' | 'AGENT' | 'USER'
type OverrideEffect = 'ALLOW' | 'DENY'

type PopupTextsDraft = {
    title: string
    beforeText: string
    openButtonText: string
    openingText: string
    successTitle: string
    pointsText: string
    moneyPreviewText: string
    afterText: string
    redeemButtonText: string
    redeemingText: string
    redeemedSuccessText: string
    laterButtonText: string
    alreadyClaimedText: string
    claimedTodayText: string
    inactiveEventText: string
    genericErrorText: string
}

type AudienceOverrideDraft = {
    userId: string
    effect: OverrideEffect
    user?: {
        id: string
        username: string
        email: string | null
        role: RoleValue
        isActive: boolean
    }
}

type SettingsDraft = {
    enabled: boolean
    eventKey: string
    startsAt: string | null
    endsAt: string | null
    claimPolicy: 'ONCE_PER_EVENT' | 'ONCE_PER_DAY'
    minPoints: number
    maxPoints: number
    minRedeemPoints: number
    showPopupAfterLogin: boolean
    allowLaterDismiss: boolean
    closeDelaySeconds: number
    beforeText: string
    afterText: string
    audienceRoles: RoleValue[]
    popupTexts: PopupTextsDraft
    audienceOverrides: AudienceOverrideDraft[]
}

type ClaimRow = {
    id: string
    points: number
    moneyValue: number | null
    claimDate: string
    eventKey: string
    createdAt: string
    user: { username: string; email: string | null; role: string }
}

type TransactionRow = {
    id: string
    pointsConverted: number
    balanceAmountUsd: number
    requestedAt: string
    owner: { username: string; email: string | null; role: string }
    transaction: { balanceAfter: number }
}

type UserSearchResult = {
    id: string
    username: string
    email: string | null
    role: RoleValue
    isActive: boolean
}

const roleOptions: Array<{ value: RoleValue; label: string }> = [
    { value: 'ADMIN', label: 'Admin' },
    { value: 'MANAGER', label: 'Manager' },
    { value: 'AGENT', label: 'Agent' },
    { value: 'USER', label: 'User' },
]

const defaultPopupTexts: PopupTextsDraft = {
    title: 'عيد مبارك',
    beforeText: 'عيديتك جاهزة! افتح الظرف واحصل على نقاط عشوائية تقدر تحولها لرصيد داخل حسابك.',
    openButtonText: 'افتح العيدية الآن',
    openingText: 'جاري فتح العيدية...',
    successTitle: 'مبروك!',
    pointsText: 'حصلت على {points} نقطة',
    moneyPreviewText: 'تعادل {amount} {currency} رصيد',
    afterText: 'يمكنك تحويل نقاطك إلى رصيد داخل الموقع.',
    redeemButtonText: 'تحويل النقاط إلى رصيد',
    redeemingText: 'جاري التحويل...',
    redeemedSuccessText: 'تم تحويل النقاط إلى رصيد بنجاح.',
    laterButtonText: 'لاحقا',
    alreadyClaimedText: 'استلمت عيديتك بالفعل',
    claimedTodayText: 'استلمت عيديتك اليوم، ارجع بكرة لعيدية جديدة',
    inactiveEventText: 'انتهت عروض العيد، تابعنا في المناسبات القادمة.',
    genericErrorText: 'حدث خطأ أثناء فتح العيدية، حاول مرة أخرى.',
}

const popupTextFields: Array<{ key: keyof PopupTextsDraft; label: string; hint?: string; multiline?: boolean }> = [
    { key: 'title', label: 'عنوان الكارت' },
    { key: 'beforeText', label: 'النص قبل الفتح', multiline: true },
    { key: 'openButtonText', label: 'زر الفتح' },
    { key: 'openingText', label: 'نص جاري الفتح' },
    { key: 'successTitle', label: 'عنوان النجاح' },
    { key: 'pointsText', label: 'نص النقاط', hint: 'يدعم {points}' },
    { key: 'moneyPreviewText', label: 'نص قيمة الرصيد', hint: 'يدعم {amount} و {currency}' },
    { key: 'afterText', label: 'النص بعد ظهور النقاط', multiline: true },
    { key: 'redeemButtonText', label: 'زر التحويل' },
    { key: 'redeemingText', label: 'نص جاري التحويل' },
    { key: 'redeemedSuccessText', label: 'رسالة نجاح التحويل' },
    { key: 'laterButtonText', label: 'زر لاحقا' },
    { key: 'alreadyClaimedText', label: 'رسالة تم الاستلام سابقا' },
    { key: 'claimedTodayText', label: 'رسالة تم الاستلام اليوم' },
    { key: 'inactiveEventText', label: 'رسالة انتهاء الحدث' },
    { key: 'genericErrorText', label: 'رسالة الخطأ العامة' },
]

const defaultSettings: SettingsDraft = {
    enabled: false,
    eventKey: 'eid-2026',
    startsAt: null,
    endsAt: null,
    claimPolicy: 'ONCE_PER_EVENT',
    minPoints: 50,
    maxPoints: 500,
    minRedeemPoints: 50,
    showPopupAfterLogin: true,
    allowLaterDismiss: true,
    closeDelaySeconds: 0,
    beforeText: 'عيديتك جاهزة! افتح الظرف واحصل على نقاط عشوائية تقدر تحولها لرصيد داخل حسابك.',
    afterText: 'يمكنك تحويل نقاطك إلى رصيد داخل الموقع.',
    audienceRoles: ['ADMIN', 'MANAGER', 'AGENT', 'USER'],
    popupTexts: defaultPopupTexts,
    audienceOverrides: [],
}

function toNumber(value: string, fallback = 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
}

export default function AdminEidRewardsClient() {
    const [tab, setTab] = useState('settings')
    const [settings, setSettings] = useState<SettingsDraft>(defaultSettings)
    const [tiers, setTiers] = useState<TierDraft[]>([])
    const [claims, setClaims] = useState<ClaimRow[]>([])
    const [transactions, setTransactions] = useState<TransactionRow[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    const [conversion, setConversion] = useState<{ enabled: boolean; points: number; amount: number } | null>(null)
    const [userSearch, setUserSearch] = useState('')
    const [userResults, setUserResults] = useState<UserSearchResult[]>([])
    const [searchingUsers, setSearchingUsers] = useState(false)

    const loadSettings = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const response = await fetch('/api/admin/eid-rewards/settings', { cache: 'no-store' })
            const payload = await response.json().catch(() => null)
            if (!response.ok) throw new Error(payload?.error || 'تعذر تحميل إعدادات عيدية العيد')
            const loadedSettings = payload.settings || {}
            const popupTexts = {
                ...defaultPopupTexts,
                ...(loadedSettings.popupTexts || {}),
                beforeText: loadedSettings.popupTexts?.beforeText || loadedSettings.beforeText || defaultPopupTexts.beforeText,
                afterText: loadedSettings.popupTexts?.afterText || loadedSettings.afterText || defaultPopupTexts.afterText,
            }
            setSettings({
                ...defaultSettings,
                ...loadedSettings,
                startsAt: loadedSettings.startsAt,
                endsAt: loadedSettings.endsAt,
                beforeText: popupTexts.beforeText,
                afterText: popupTexts.afterText,
                audienceRoles: Array.isArray(loadedSettings.audienceRoles) ? loadedSettings.audienceRoles : defaultSettings.audienceRoles,
                popupTexts,
                audienceOverrides: Array.isArray(loadedSettings.audienceOverrides) ? loadedSettings.audienceOverrides : [],
            })
            setTiers(payload.tiers.map((tier: TierDraft) => ({
                points: tier.points,
                probabilityWeight: tier.probabilityWeight,
                label: tier.label || '',
                isActive: tier.isActive,
            })))
            setConversion(payload.conversion)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'تعذر تحميل إعدادات عيدية العيد')
        } finally {
            setLoading(false)
        }
    }, [])

    const loadClaims = useCallback(async () => {
        const response = await fetch('/api/admin/eid-rewards/claims?limit=25', { cache: 'no-store' })
        const payload = await response.json().catch(() => null)
        if (response.ok) setClaims(payload.claims || [])
    }, [])

    const loadTransactions = useCallback(async () => {
        const response = await fetch('/api/admin/eid-rewards/transactions?limit=25', { cache: 'no-store' })
        const payload = await response.json().catch(() => null)
        if (response.ok) setTransactions(payload.transactions || [])
    }, [])

    useEffect(() => {
        loadSettings()
        loadClaims()
        loadTransactions()
    }, [loadSettings, loadClaims, loadTransactions])

    async function saveSettings(event: FormEvent) {
        event.preventDefault()
        setSaving(true)
        setError(null)
        setSuccess(null)

        try {
            const payload = {
                ...settings,
                tiers,
            }
            const response = await fetch('/api/admin/eid-rewards/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            })
            const result = await response.json().catch(() => null)
            if (!response.ok) throw new Error(result?.error || 'تعذر حفظ إعدادات عيدية العيد')
            setSuccess('تم حفظ إعدادات عيدية العيد.')
            await loadSettings()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'تعذر حفظ إعدادات عيدية العيد')
        } finally {
            setSaving(false)
        }
    }

    function toggleAudienceRole(role: RoleValue, checked: boolean) {
        setSettings((draft) => ({
            ...draft,
            audienceRoles: checked
                ? Array.from(new Set([...draft.audienceRoles, role])) as RoleValue[]
                : draft.audienceRoles.filter((item) => item !== role),
        }))
    }

    function updatePopupText(key: keyof PopupTextsDraft, value: string) {
        setSettings((draft) => {
            const popupTexts = { ...draft.popupTexts, [key]: value }
            return {
                ...draft,
                beforeText: key === 'beforeText' ? value : draft.beforeText,
                afterText: key === 'afterText' ? value : draft.afterText,
                popupTexts,
            }
        })
    }

    async function searchAudienceUsers() {
        const term = userSearch.trim()
        if (term.length < 2) {
            setError('اكتب حرفين على الأقل للبحث عن مستخدم.')
            return
        }

        setSearchingUsers(true)
        setError(null)
        try {
            const response = await fetch(`/api/admin/users?search=${encodeURIComponent(term)}&limit=8`, { cache: 'no-store' })
            const payload = await response.json().catch(() => null)
            if (!response.ok) throw new Error(payload?.error || 'تعذر البحث عن المستخدمين')
            setUserResults((payload.users || []).map((user: UserSearchResult) => ({
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role,
                isActive: user.isActive,
            })))
        } catch (err) {
            setError(err instanceof Error ? err.message : 'تعذر البحث عن المستخدمين')
        } finally {
            setSearchingUsers(false)
        }
    }

    function addAudienceOverride(user: UserSearchResult, effect: OverrideEffect) {
        setSettings((draft) => {
            const nextOverride: AudienceOverrideDraft = {
                userId: user.id,
                effect,
                user,
            }
            const withoutUser = draft.audienceOverrides.filter((override) => override.userId !== user.id)
            return {
                ...draft,
                audienceOverrides: [...withoutUser, nextOverride],
            }
        })
    }

    function updateAudienceOverride(userId: string, effect: OverrideEffect) {
        setSettings((draft) => ({
            ...draft,
            audienceOverrides: draft.audienceOverrides.map((override) =>
                override.userId === userId ? { ...override, effect } : override
            ),
        }))
    }

    function addTier() {
        setTiers((current) => [...current, { points: 50, probabilityWeight: 10, label: '', isActive: true }])
    }

    function updateTier(index: number, patch: Partial<TierDraft>) {
        setTiers((current) => current.map((tier, itemIndex) => itemIndex === index ? { ...tier, ...patch } : tier))
    }

    return (
        <div className="mx-auto max-w-7xl space-y-6 p-6" dir="rtl">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                    <p className="text-sm text-muted-foreground">Admin configuration</p>
                    <h1 className="flex items-center gap-2 text-3xl font-bold text-foreground">
                        <Gift className="h-7 w-7 text-[#F6C453]" />
                        عيدية العيد
                    </h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                        تفعيل الحدث، تحديد النقاط، ومراجعة مطالبات وتحويلات عيدية العيد.
                    </p>
                </div>
                <Button type="button" variant="outline" onClick={loadSettings} disabled={loading} className="gap-2">
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    تحديث
                </Button>
            </div>

            {error && <div className="rounded-lg border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">{error}</div>}
            {success && <div className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-200">{success}</div>}

            <Tabs value={tab} onValueChange={setTab}>
                <TabsList className="bg-card">
                    <TabsTrigger value="settings">الإعدادات</TabsTrigger>
                    <TabsTrigger value="claims">المطالبات</TabsTrigger>
                    <TabsTrigger value="transactions">التحويلات</TabsTrigger>
                </TabsList>

                <TabsContent value="settings">
                    <form className="space-y-6" onSubmit={saveSettings}>
                        <section className="rounded-lg border border-border bg-card p-4">
                            <div className="grid gap-4 md:grid-cols-3">
                                <label className="flex items-center gap-3 rounded-lg border border-border p-3">
                                    <input type="checkbox" checked={settings.enabled} onChange={(event) => setSettings((draft) => ({ ...draft, enabled: event.target.checked }))} />
                                    <span className="text-sm font-medium">تفعيل النظام</span>
                                </label>
                                <label className="block space-y-2">
                                    <span className="text-sm text-muted-foreground">مفتاح الحدث</span>
                                    <Input value={settings.eventKey} onChange={(event) => setSettings((draft) => ({ ...draft, eventKey: event.target.value }))} dir="ltr" />
                                </label>
                                <label className="block space-y-2">
                                    <span className="text-sm text-muted-foreground">سياسة الاستلام</span>
                                    <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={settings.claimPolicy} onChange={(event) => setSettings((draft) => ({ ...draft, claimPolicy: event.target.value as SettingsDraft['claimPolicy'] }))}>
                                        <option value="ONCE_PER_EVENT">مرة واحدة طوال الحدث</option>
                                        <option value="ONCE_PER_DAY">مرة يوميًا</option>
                                    </select>
                                </label>
                                <label className="block space-y-2">
                                    <span className="text-sm text-muted-foreground">بداية الحدث</span>
                                    <Input type="datetime-local" value={utcIsoToCairoDateTimeLocal(settings.startsAt)} onChange={(event) => setSettings((draft) => ({ ...draft, startsAt: cairoDateTimeLocalToUtcIso(event.target.value) }))} />
                                </label>
                                <label className="block space-y-2">
                                    <span className="text-sm text-muted-foreground">نهاية الحدث</span>
                                    <Input type="datetime-local" value={utcIsoToCairoDateTimeLocal(settings.endsAt)} onChange={(event) => setSettings((draft) => ({ ...draft, endsAt: cairoDateTimeLocalToUtcIso(event.target.value) }))} />
                                </label>
                                <label className="block space-y-2">
                                    <span className="text-sm text-muted-foreground">أقل نقاط للتحويل</span>
                                    <Input type="number" min={1} value={settings.minRedeemPoints} onChange={(event) => setSettings((draft) => ({ ...draft, minRedeemPoints: toNumber(event.target.value, 1) }))} />
                                </label>
                                <label className="block space-y-2">
                                    <span className="text-sm text-muted-foreground">أقل نقاط</span>
                                    <Input type="number" min={1} value={settings.minPoints} onChange={(event) => setSettings((draft) => ({ ...draft, minPoints: toNumber(event.target.value, 1) }))} />
                                </label>
                                <label className="block space-y-2">
                                    <span className="text-sm text-muted-foreground">أعلى نقاط</span>
                                    <Input type="number" min={1} value={settings.maxPoints} onChange={(event) => setSettings((draft) => ({ ...draft, maxPoints: toNumber(event.target.value, 1) }))} />
                                </label>
                                <label className="block space-y-2">
                                    <span className="text-sm text-muted-foreground">ثواني قبل الإغلاق</span>
                                    <Input type="number" min={0} max={30} value={settings.closeDelaySeconds} onChange={(event) => setSettings((draft) => ({ ...draft, closeDelaySeconds: toNumber(event.target.value, 0) }))} />
                                </label>
                            </div>

                            <div className="mt-4 grid gap-4 md:grid-cols-2">
                                <label className="flex items-center gap-3 rounded-lg border border-border p-3">
                                    <input type="checkbox" checked={settings.showPopupAfterLogin} onChange={(event) => setSettings((draft) => ({ ...draft, showPopupAfterLogin: event.target.checked }))} />
                                    <span className="text-sm font-medium">إظهار Popup تلقائيًا</span>
                                </label>
                                <label className="flex items-center gap-3 rounded-lg border border-border p-3">
                                    <input type="checkbox" checked={settings.allowLaterDismiss} onChange={(event) => setSettings((draft) => ({ ...draft, allowLaterDismiss: event.target.checked }))} />
                                    <span className="text-sm font-medium">تفعيل زر لاحقًا</span>
                                </label>
                            </div>

                            <div className="mt-6 rounded-lg border border-border bg-background/40 p-4">
                                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                    <div>
                                        <h2 className="text-lg font-semibold">ظهور المكافأة</h2>
                                        <p className="text-sm text-muted-foreground">اختار الأدوار المسموح لها، أو أضف استثناء لمستخدم محدد.</p>
                                    </div>
                                    <Badge variant="outline">{settings.audienceRoles.length} أدوار مفعلة</Badge>
                                </div>

                                <div className="mt-4 grid gap-3 md:grid-cols-4">
                                    {roleOptions.map((role) => (
                                        <label key={role.value} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                                            <span className="text-sm font-medium">{role.label}</span>
                                            <input
                                                type="checkbox"
                                                checked={settings.audienceRoles.includes(role.value)}
                                                onChange={(event) => toggleAudienceRole(role.value, event.target.checked)}
                                            />
                                        </label>
                                    ))}
                                </div>

                                {settings.audienceRoles.length === 0 && (
                                    <p className="mt-3 rounded-md border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">
                                        كل الأدوار مقفولة. المكافأة هتظهر فقط للمستخدمين الموجودين في السماح اليدوي.
                                    </p>
                                )}

                                <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
                                    <Input
                                        value={userSearch}
                                        onChange={(event) => setUserSearch(event.target.value)}
                                        placeholder="ابحث بالاسم أو البريد لإضافة استثناء"
                                    />
                                    <Button type="button" variant="outline" onClick={searchAudienceUsers} disabled={searchingUsers} className="gap-2">
                                        <Search className={`h-4 w-4 ${searchingUsers ? 'animate-spin' : ''}`} />
                                        بحث
                                    </Button>
                                </div>

                                {userResults.length > 0 && (
                                    <div className="mt-3 space-y-2">
                                        {userResults.map((user) => (
                                            <div key={user.id} className="flex flex-col gap-3 rounded-lg border border-border p-3 md:flex-row md:items-center md:justify-between">
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-semibold">{user.username}</p>
                                                    <p className="truncate text-xs text-muted-foreground">{user.email || '-'} · {user.role} · {user.isActive ? 'نشط' : 'موقوف'}</p>
                                                </div>
                                                <div className="flex gap-2">
                                                    <Button type="button" size="sm" variant="outline" onClick={() => addAudienceOverride(user, 'ALLOW')} className="gap-2">
                                                        <UserPlus className="h-4 w-4" />
                                                        سماح
                                                    </Button>
                                                    <Button type="button" size="sm" variant="outline" onClick={() => addAudienceOverride(user, 'DENY')}>
                                                        منع
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <div className="mt-4 space-y-2">
                                    {settings.audienceOverrides.length === 0 && (
                                        <p className="rounded-lg border border-border p-3 text-sm text-muted-foreground">لا توجد استثناءات. سيتم استخدام قواعد الأدوار فقط.</p>
                                    )}
                                    {settings.audienceOverrides.map((override) => (
                                        <div key={override.userId} className="grid gap-3 rounded-lg border border-border p-3 md:grid-cols-[1fr_auto_auto] md:items-center">
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-semibold">{override.user?.username || override.userId}</p>
                                                <p className="truncate text-xs text-muted-foreground">
                                                    {override.user?.email || 'User ID'} · {override.user?.role || '-'} · {override.user?.isActive === false ? 'موقوف' : 'نشط'}
                                                </p>
                                            </div>
                                            <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={override.effect} onChange={(event) => updateAudienceOverride(override.userId, event.target.value as OverrideEffect)}>
                                                <option value="ALLOW">سماح</option>
                                                <option value="DENY">منع</option>
                                            </select>
                                            <Button type="button" variant="outline" onClick={() => setSettings((draft) => ({ ...draft, audienceOverrides: draft.audienceOverrides.filter((item) => item.userId !== override.userId) }))}>
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="mt-6 rounded-lg border border-border bg-background/40 p-4">
                                <h2 className="text-lg font-semibold">نصوص كارت المكافأة</h2>
                                <p className="mt-1 text-sm text-muted-foreground">كل النصوص الظاهرة للعميل قابلة للتعديل من هنا.</p>
                                <div className="mt-4 grid gap-4 md:grid-cols-2">
                                    {popupTextFields.map((field) => (
                                        <label key={field.key} className="block space-y-2">
                                            <span className="text-sm text-muted-foreground">{field.label}</span>
                                            {field.multiline ? (
                                                <textarea
                                                    className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                                    value={settings.popupTexts[field.key]}
                                                    onChange={(event) => updatePopupText(field.key, event.target.value)}
                                                />
                                            ) : (
                                                <Input
                                                    value={settings.popupTexts[field.key]}
                                                    onChange={(event) => updatePopupText(field.key, event.target.value)}
                                                />
                                            )}
                                            {field.hint && <span className="text-xs text-muted-foreground">{field.hint}</span>}
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {conversion && (
                                <div className="mt-4 rounded-lg border border-border bg-background/50 p-3 text-sm text-muted-foreground">
                                    إعدادات التحويل الحالية: {conversion.points} نقطة = {conversion.amount} رصيد. الحالة: {conversion.enabled ? 'مفعلة' : 'غير مفعلة'}
                                </div>
                            )}
                        </section>

                        <section className="rounded-lg border border-border bg-card p-4">
                            <div className="flex items-center justify-between gap-3">
                                <h2 className="text-xl font-semibold">شرائح الاحتمالات</h2>
                                <Button type="button" variant="outline" onClick={addTier} className="gap-2">
                                    <Plus className="h-4 w-4" />
                                    إضافة شريحة
                                </Button>
                            </div>
                            <div className="mt-4 space-y-3">
                                {tiers.length === 0 && <p className="text-sm text-muted-foreground">لا توجد شرائح. سيتم استخدام أقل/أعلى نقاط.</p>}
                                {tiers.map((tier, index) => (
                                    <div key={index} className="grid gap-3 rounded-lg border border-border p-3 md:grid-cols-[1fr_1fr_1fr_auto_auto]">
                                        <Input type="number" min={1} value={tier.points} onChange={(event) => updateTier(index, { points: toNumber(event.target.value, 1) })} placeholder="النقاط" />
                                        <Input type="number" min={1} value={tier.probabilityWeight} onChange={(event) => updateTier(index, { probabilityWeight: toNumber(event.target.value, 1) })} placeholder="الوزن" />
                                        <Input value={tier.label} onChange={(event) => updateTier(index, { label: event.target.value })} placeholder="الاسم" />
                                        <label className="flex items-center gap-2 text-sm">
                                            <input type="checkbox" checked={tier.isActive} onChange={(event) => updateTier(index, { isActive: event.target.checked })} />
                                            نشطة
                                        </label>
                                        <Button type="button" variant="outline" onClick={() => setTiers((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </section>

                        <Button type="submit" disabled={saving} className="gap-2">
                            <Save className="h-4 w-4" />
                            {saving ? 'جاري الحفظ...' : 'حفظ الإعدادات'}
                        </Button>
                    </form>
                </TabsContent>

                <TabsContent value="claims">
                    <AuditTable rows={claims} kind="claims" />
                </TabsContent>

                <TabsContent value="transactions">
                    <AuditTable rows={transactions} kind="transactions" />
                </TabsContent>
            </Tabs>
        </div>
    )
}

function AuditTable({ rows, kind }: { rows: ClaimRow[] | TransactionRow[]; kind: 'claims' | 'transactions' }) {
    return (
        <section className="rounded-lg border border-border bg-card p-4">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="text-right">المستخدم</TableHead>
                        <TableHead className="text-right">الدور</TableHead>
                        <TableHead className="text-right">النقاط</TableHead>
                        <TableHead className="text-right">القيمة</TableHead>
                        <TableHead className="text-right">التاريخ</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rows.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">لا توجد بيانات.</TableCell>
                        </TableRow>
                    )}
                    {rows.map((row) => {
                        const isClaim = kind === 'claims'
                        const claim = row as ClaimRow
                        const transaction = row as TransactionRow
                        return (
                            <TableRow key={row.id}>
                                <TableCell>{isClaim ? claim.user.username : transaction.owner.username}</TableCell>
                                <TableCell>
                                    <Badge variant="outline">{isClaim ? claim.user.role : transaction.owner.role}</Badge>
                                </TableCell>
                                <TableCell>{isClaim ? claim.points : transaction.pointsConverted}</TableCell>
                                <TableCell>{isClaim ? claim.moneyValue ?? '-' : transaction.balanceAmountUsd}</TableCell>
                                <TableCell>{new Date(isClaim ? claim.createdAt : transaction.requestedAt).toLocaleString('ar-EG')}</TableCell>
                            </TableRow>
                        )
                    })}
                </TableBody>
            </Table>
        </section>
    )
}
