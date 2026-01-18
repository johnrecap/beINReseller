'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import {
    Plus,
    RefreshCw,
    Power,
    Trash2,
    Edit,
    RotateCcw,
    CheckCircle,
    XCircle,
    Clock,
    AlertTriangle,
    Users
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
    DialogClose,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { useTranslation } from '@/hooks/useTranslation'

interface BeinAccount {
    id: string
    username: string
    label: string | null
    isActive: boolean
    priority: number
    lastUsedAt: string | null
    usageCount: number
    cooldownUntil: string | null
    consecutiveFailures: number
    totalFailures: number
    totalSuccess: number
    successRate: number
    lastError: string | null
    lastErrorAt: string | null
    createdAt: string
    operationsCount: number
}

interface PoolStatus {
    totalAccounts: number
    activeAccounts: number
    availableNow: number
    inCooldown: number
    rateLimited: number
}

export default function BeinAccountsPage() {
    const { t } = useTranslation()
    const { data: session, status } = useSession()
    const router = useRouter()
    const [accounts, setAccounts] = useState<BeinAccount[]>([])
    const [poolStatus, setPoolStatus] = useState<PoolStatus | null>(null)
    const [loading, setLoading] = useState(true)
    const [addDialogOpen, setAddDialogOpen] = useState(false)
    const [editAccount, setEditAccount] = useState<BeinAccount | null>(null)

    // Form state
    const [formData, setFormData] = useState({
        username: '',
        password: '',
        totpSecret: '',
        label: '',
        priority: 0
    })

    const fetchAccounts = useCallback(async () => {
        try {
            const res = await fetch('/api/admin/bein-accounts')
            const data = await res.json()
            if (data.success) {
                setAccounts(data.accounts)
                setPoolStatus(data.poolStatus)
            }
        } catch {
            toast.error('فشل في تحميل الحسابات')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        if (status === 'authenticated') {
            if (session?.user?.role !== 'ADMIN') {
                router.push('/dashboard')
            } else {
                fetchAccounts()
            }
        }
    }, [status, session, router, fetchAccounts])

    const handleAddAccount = async (e: React.FormEvent) => {
        e.preventDefault()
        try {
            const res = await fetch('/api/admin/bein-accounts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            })
            const data = await res.json()
            if (data.success) {
                toast.success('تم إضافة الحساب بنجاح')
                setAddDialogOpen(false)
                setFormData({ username: '', password: '', totpSecret: '', label: '', priority: 0 })
                fetchAccounts()
            } else {
                toast.error(data.error)
            }
        } catch {
            toast.error('فشل في إضافة الحساب')
        }
    }

    const handleUpdateAccount = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!editAccount) return
        try {
            const res = await fetch(`/api/admin/bein-accounts/${editAccount.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            })
            const data = await res.json()
            if (data.success) {
                toast.success('تم تحديث الحساب بنجاح')
                setEditAccount(null)
                setFormData({ username: '', password: '', totpSecret: '', label: '', priority: 0 })
                fetchAccounts()
            } else {
                toast.error(data.error)
            }
        } catch {
            toast.error('فشل في تحديث الحساب')
        }
    }

    const handleToggleAccount = async (account: BeinAccount) => {
        try {
            const res = await fetch(`/api/admin/bein-accounts/${account.id}/toggle`, {
                method: 'POST'
            })
            const data = await res.json()
            if (data.success) {
                toast.success(data.message)
                fetchAccounts()
            }
        } catch {
            toast.error('فشل في تغيير حالة الحساب')
        }
    }

    const handleResetAccount = async (account: BeinAccount) => {
        try {
            const res = await fetch(`/api/admin/bein-accounts/${account.id}/reset`, {
                method: 'POST'
            })
            const data = await res.json()
            if (data.success) {
                toast.success(data.message)
                fetchAccounts()
            }
        } catch {
            toast.error('فشل في إعادة تعيين الحساب')
        }
    }

    const handleDeleteAccount = async (account: BeinAccount) => {
        if (!confirm('هل أنت متأكد من حذف هذا الحساب؟')) return
        try {
            const res = await fetch(`/api/admin/bein-accounts/${account.id}`, {
                method: 'DELETE'
            })
            const data = await res.json()
            if (data.success) {
                toast.success(data.message)
                fetchAccounts()
            }
        } catch {
            toast.error('فشل في حذف الحساب')
        }
    }

    const getStatusBadge = (account: BeinAccount) => {
        if (!account.isActive) {
            return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> معطل</Badge>
        }
        if (account.cooldownUntil && new Date(account.cooldownUntil) > new Date()) {
            return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" /> راحة</Badge>
        }
        if (account.consecutiveFailures >= 3) {
            return <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> مشكلة</Badge>
        }
        return <Badge variant="default" className="gap-1 bg-green-600"><CheckCircle className="h-3 w-3" /> نشط</Badge>
    }

    if (status === 'loading' || loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        )
    }

    return (
        <div className="space-y-6 p-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">إدارة حسابات beIN</h1>
                    <p className="text-muted-foreground">إدارة حسابات البوت للتوزيع الذكي</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={fetchAccounts}>
                        <RefreshCw className="h-4 w-4 ml-2" />
                        تحديث
                    </Button>
                    <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
                        <DialogTrigger asChild>
                            <Button>
                                <Plus className="h-4 w-4 ml-2" />
                                إضافة حساب
                            </Button>
                        </DialogTrigger>
                        <DialogContent dir="rtl">
                            <DialogHeader>
                                <DialogTitle>إضافة حساب جديد</DialogTitle>
                            </DialogHeader>
                            <form onSubmit={handleAddAccount} className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="username">اسم المستخدم *</Label>
                                    <Input
                                        id="username"
                                        value={formData.username}
                                        onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="password">كلمة المرور *</Label>
                                    <Input
                                        id="password"
                                        type="password"
                                        value={formData.password}
                                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="totpSecret">TOTP Secret (2FA)</Label>
                                    <Input
                                        id="totpSecret"
                                        value={formData.totpSecret}
                                        onChange={(e) => setFormData({ ...formData, totpSecret: e.target.value })}
                                        placeholder="اختياري"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="label">التسمية</Label>
                                    <Input
                                        id="label"
                                        value={formData.label}
                                        onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                                        placeholder="مثال: الحساب الرئيسي"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="priority">الأولوية (0-10)</Label>
                                    <Input
                                        id="priority"
                                        type="number"
                                        min="0"
                                        max="10"
                                        value={formData.priority}
                                        onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
                                    />
                                </div>
                                <DialogFooter>
                                    <DialogClose asChild>
                                        <Button type="button" variant="outline">إلغاء</Button>
                                    </DialogClose>
                                    <Button type="submit">إضافة</Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            {/* Pool Status Cards */}
            {poolStatus && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <Card>
                        <CardContent className="p-4 text-center">
                            <div className="text-3xl font-bold">{poolStatus.totalAccounts}</div>
                            <div className="text-sm text-muted-foreground">إجمالي</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="p-4 text-center">
                            <div className="text-3xl font-bold text-green-600">{poolStatus.activeAccounts}</div>
                            <div className="text-sm text-muted-foreground">نشط</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="p-4 text-center">
                            <div className="text-3xl font-bold text-blue-600">{poolStatus.availableNow}</div>
                            <div className="text-sm text-muted-foreground">متاح الآن</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="p-4 text-center">
                            <div className="text-3xl font-bold text-yellow-600">{poolStatus.inCooldown}</div>
                            <div className="text-sm text-muted-foreground">راحة</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="p-4 text-center">
                            <div className="text-3xl font-bold text-orange-600">{poolStatus.rateLimited}</div>
                            <div className="text-sm text-muted-foreground">محدود</div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Accounts Table */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Users className="h-5 w-5" />
                        قائمة الحسابات
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>الحساب</TableHead>
                                <TableHead className="text-center">الحالة</TableHead>
                                <TableHead className="text-center">الأولوية</TableHead>
                                <TableHead className="text-center">نسبة النجاح</TableHead>
                                <TableHead className="text-center">العمليات</TableHead>
                                <TableHead className="text-center">آخر خطأ</TableHead>
                                <TableHead className="text-center">الإجراءات</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {accounts.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                        لا توجد حسابات. أضف حسابك الأول!
                                    </TableCell>
                                </TableRow>
                            ) : (
                                accounts.map((account) => (
                                    <TableRow key={account.id}>
                                        <TableCell>
                                            <div>
                                                <div className="font-medium">{account.label || account.username}</div>
                                                {account.label && (
                                                    <div className="text-sm text-muted-foreground">{account.username}</div>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-center">{getStatusBadge(account)}</TableCell>
                                        <TableCell className="text-center">{account.priority}</TableCell>
                                        <TableCell className="text-center">
                                            <span className={account.successRate >= 80 ? 'text-green-600' : account.successRate >= 50 ? 'text-yellow-600' : 'text-red-600'}>
                                                {account.successRate.toFixed(1)}%
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <span className="text-green-600">{account.totalSuccess}</span>
                                            {' / '}
                                            <span className="text-red-600">{account.totalFailures}</span>
                                        </TableCell>
                                        <TableCell className="text-center">
                                            {account.consecutiveFailures > 0 && (
                                                <Badge variant="outline" className="gap-1">
                                                    <AlertTriangle className="h-3 w-3" />
                                                    {account.consecutiveFailures}
                                                </Badge>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex justify-center gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleToggleAccount(account)}
                                                    title={account.isActive ? 'إيقاف' : 'تفعيل'}
                                                >
                                                    <Power className={`h-4 w-4 ${account.isActive ? 'text-green-600' : 'text-muted-foreground'}`} />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleResetAccount(account)}
                                                    title="إعادة تعيين"
                                                >
                                                    <RotateCcw className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => {
                                                        setEditAccount(account)
                                                        setFormData({
                                                            username: account.username,
                                                            password: '',
                                                            totpSecret: '',
                                                            label: account.label || '',
                                                            priority: account.priority
                                                        })
                                                    }}
                                                    title="تعديل"
                                                >
                                                    <Edit className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleDeleteAccount(account)}
                                                    title="حذف"
                                                    className="text-red-600 hover:text-red-700"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Edit Dialog */}
            <Dialog open={!!editAccount} onOpenChange={(open: boolean) => !open && setEditAccount(null)}>
                <DialogContent dir="rtl">
                    <DialogHeader>
                        <DialogTitle>تعديل الحساب</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleUpdateAccount} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="edit-username">اسم المستخدم</Label>
                            <Input id="edit-username" value={formData.username} disabled />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="edit-password">كلمة المرور (اتركها فارغة للإبقاء)</Label>
                            <Input
                                id="edit-password"
                                type="password"
                                value={formData.password}
                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="edit-totpSecret">TOTP Secret</Label>
                            <Input
                                id="edit-totpSecret"
                                value={formData.totpSecret}
                                onChange={(e) => setFormData({ ...formData, totpSecret: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="edit-label">التسمية</Label>
                            <Input
                                id="edit-label"
                                value={formData.label}
                                onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="edit-priority">الأولوية</Label>
                            <Input
                                id="edit-priority"
                                type="number"
                                min="0"
                                max="10"
                                value={formData.priority}
                                onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
                            />
                        </div>
                        <DialogFooter>
                            <DialogClose asChild>
                                <Button type="button" variant="outline">إلغاء</Button>
                            </DialogClose>
                            <Button type="submit">حفظ</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    )
}
