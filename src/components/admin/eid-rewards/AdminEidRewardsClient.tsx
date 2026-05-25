'use client'

import { FormEvent, useCallback, useEffect, useState } from 'react'
import { Gift, Plus, RefreshCw, Save, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'

type TierDraft = {
    points: number
    probabilityWeight: number
    label: string
    isActive: boolean
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
}

function toNumber(value: string, fallback = 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
}

function toDateTimeLocal(value: string | null) {
    return value ? value.slice(0, 16) : ''
}

function fromDateTimeLocal(value: string) {
    return value ? new Date(value).toISOString() : null
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

    const loadSettings = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const response = await fetch('/api/admin/eid-rewards/settings', { cache: 'no-store' })
            const payload = await response.json().catch(() => null)
            if (!response.ok) throw new Error(payload?.error || 'تعذر تحميل إعدادات عيدية العيد')
            setSettings({
                ...payload.settings,
                startsAt: payload.settings.startsAt,
                endsAt: payload.settings.endsAt,
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
                startsAt: fromDateTimeLocal(toDateTimeLocal(settings.startsAt)),
                endsAt: fromDateTimeLocal(toDateTimeLocal(settings.endsAt)),
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
                                    <Input type="datetime-local" value={toDateTimeLocal(settings.startsAt)} onChange={(event) => setSettings((draft) => ({ ...draft, startsAt: fromDateTimeLocal(event.target.value) }))} />
                                </label>
                                <label className="block space-y-2">
                                    <span className="text-sm text-muted-foreground">نهاية الحدث</span>
                                    <Input type="datetime-local" value={toDateTimeLocal(settings.endsAt)} onChange={(event) => setSettings((draft) => ({ ...draft, endsAt: fromDateTimeLocal(event.target.value) }))} />
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

                            <div className="mt-4 grid gap-4 md:grid-cols-2">
                                <label className="block space-y-2">
                                    <span className="text-sm text-muted-foreground">النص قبل الفتح</span>
                                    <textarea className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={settings.beforeText} onChange={(event) => setSettings((draft) => ({ ...draft, beforeText: event.target.value }))} />
                                </label>
                                <label className="block space-y-2">
                                    <span className="text-sm text-muted-foreground">النص بعد ظهور النقاط</span>
                                    <textarea className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={settings.afterText} onChange={(event) => setSettings((draft) => ({ ...draft, afterText: event.target.value }))} />
                                </label>
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
