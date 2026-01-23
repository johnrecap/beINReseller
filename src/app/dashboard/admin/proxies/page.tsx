'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import {
    Plus,
    RefreshCw,
    Trash2,
    Edit,
    CheckCircle,
    XCircle,
    AlertTriangle,
    Globe,
    Network,
    Activity,
    Server
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
import { format } from 'date-fns'

interface Proxy {
    id: string
    sessionId: string
    label: string | null
    isActive: boolean
    lastTestedAt: string | null
    lastIp: string | null
    responseTimeMs: number | null
    failureCount: number
    accountsCount: number
    createdAt: string
}

export default function ProxiesPage() {
    const { data: session, status } = useSession()
    const router = useRouter()
    const [proxies, setProxies] = useState<Proxy[]>([])
    const [loading, setLoading] = useState(true)
    const [addDialogOpen, setAddDialogOpen] = useState(false)
    const [editProxy, setEditProxy] = useState<Proxy | null>(null)
    const [testingProxyId, setTestingProxyId] = useState<string | null>(null)

    // Form state
    const [formData, setFormData] = useState({
        sessionId: '',
        label: ''
    })

    const fetchProxies = useCallback(async () => {
        try {
            const res = await fetch('/api/admin/proxies')
            const data = await res.json()
            if (data.success) {
                setProxies(data.proxies)
            }
        } catch {
            toast.error('فشل في تحميل البروكسيات')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        if (status === 'authenticated') {
            if (session?.user?.role !== 'ADMIN') {
                router.push('/dashboard')
            } else {
                fetchProxies()
            }
        }
    }, [status, session, router, fetchProxies])

    const handleAddProxy = async (e: React.FormEvent) => {
        e.preventDefault()
        try {
            const res = await fetch('/api/admin/proxies', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            })
            const data = await res.json()
            if (data.success) {
                toast.success('تم إضافة البروكسي بنجاح')
                setAddDialogOpen(false)
                setFormData({ sessionId: '', label: '' })
                fetchProxies()
            } else {
                toast.error(data.error)
            }
        } catch {
            toast.error('فشل في إضافة البروكسي')
        }
    }

    const handleUpdateProxy = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!editProxy) return
        try {
            const res = await fetch(`/api/admin/proxies/${editProxy.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    label: formData.label,
                    isActive: editProxy.isActive // Keep current status
                })
            })
            const data = await res.json()
            if (data.success) {
                toast.success('تم تحديث البروكسي بنجاح')
                setEditProxy(null)
                setFormData({ sessionId: '', label: '' })
                fetchProxies()
            } else {
                toast.error(data.error)
            }
        } catch {
            toast.error('فشل في تحديث البروكسي')
        }
    }

    const handleDeleteProxy = async (proxy: Proxy) => {
        if (!confirm('هل أنت متأكد من حذف هذا البروكسي؟')) return
        try {
            const res = await fetch(`/api/admin/proxies/${proxy.id}`, {
                method: 'DELETE'
            })
            const data = await res.json()
            if (data.success) {
                toast.success(data.message)
                fetchProxies()
            } else {
                toast.error(data.error)
            }
        } catch {
            toast.error('فشل في حذف البروكسي')
        }
    }

    const handleTestProxy = async (proxy: Proxy) => {
        setTestingProxyId(proxy.id)
        try {
            const res = await fetch(`/api/admin/proxies/${proxy.id}/test`, {
                method: 'POST'
            })
            const data = await res.json()
            if (data.success) {
                toast.success(`تم الاتصال بنجاح: ${data.result.ip}`)
                fetchProxies()
            } else {
                toast.error(data.error || 'فشل الاتصال')
            }
        } catch {
            toast.error('فشل في اختبار البروكسي')
        } finally {
            setTestingProxyId(null)
        }
    }

    const handleToggleStatus = async (proxy: Proxy) => {
        try {
            const res = await fetch(`/api/admin/proxies/${proxy.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    isActive: !proxy.isActive
                })
            })
            const data = await res.json()
            if (data.success) {
                toast.success('تم تغيير حالة البروكسي')
                fetchProxies()
            }
        } catch {
            toast.error('فشل تغيير الحالة')
        }
    }

    const getStatusBadge = (proxy: Proxy) => {
        if (!proxy.isActive) {
            return <Badge variant="secondary" className="gap-1 opacity-50"><XCircle className="h-3 w-3" /> معطل</Badge>
        }
        if (proxy.failureCount > 0) {
            return <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> مشاكل</Badge>
        }
        if (proxy.lastTestedAt) {
            return <Badge variant="default" className="gap-1 bg-green-600"><CheckCircle className="h-3 w-3" /> متصل</Badge>
        }
        return <Badge variant="outline" className="gap-1">جديد</Badge>
    }

    if (status === 'loading' || loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        )
    }

    const activeProxies = proxies.filter(p => p.isActive).length
    const totalProxies = proxies.length
    const failedProxies = proxies.filter(p => p.failureCount > 0).length

    return (
        <div className="space-y-6 p-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center shadow-lg">
                        <Globe className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">إدارة Proxies</h1>
                        <p className="text-muted-foreground text-sm">إدارة عناوين IP والاتصال بـ beIN</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={fetchProxies}>
                        <RefreshCw className="h-4 w-4 ml-2" />
                        تحديث
                    </Button>
                    <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
                        <DialogTrigger asChild>
                            <Button>
                                <Plus className="h-4 w-4 ml-2" />
                                إضافة Proxy
                            </Button>
                        </DialogTrigger>
                        <DialogContent dir="rtl">
                            <DialogHeader>
                                <DialogTitle>إضافة Proxy جديد</DialogTitle>
                            </DialogHeader>
                            <form onSubmit={handleAddProxy} className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="sessionId">Session ID (للربط بـ IP ثابت)</Label>
                                    <Input
                                        id="sessionId"
                                        value={formData.sessionId}
                                        onChange={(e) => setFormData({ ...formData, sessionId: e.target.value })}
                                        placeholder="مثال: egypt-01"
                                        required
                                        className="dir-ltr"
                                    />
                                    <p className="text-xs text-muted-foreground">يستخدم لتوليد IP ثابت في Bright Data</p>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="label">التسمية (اختياري)</Label>
                                    <Input
                                        id="label"
                                        value={formData.label}
                                        onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                                        placeholder="مثال: سيرفر مصر الرئيسي"
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

            {/* Status Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="p-4 flex items-center gap-4">
                        <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                            <Server className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                            <div className="text-2xl font-bold">{totalProxies}</div>
                            <div className="text-sm text-muted-foreground">إجمالي السيرفرات</div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 flex items-center gap-4">
                        <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                            <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
                        </div>
                        <div>
                            <div className="text-2xl font-bold text-green-600">{activeProxies}</div>
                            <div className="text-sm text-muted-foreground">سيرفر نشط</div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 flex items-center gap-4">
                        <div className="p-2 bg-red-100 dark:bg-red-900 rounded-lg">
                            <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
                        </div>
                        <div>
                            <div className="text-2xl font-bold text-red-600">{failedProxies}</div>
                            <div className="text-sm text-muted-foreground">مشاكل اتصال</div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 flex items-center gap-4">
                        <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-lg">
                            <Globe className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                        </div>
                        <div>
                            <div className="text-2xl font-bold">{proxies.reduce((acc, curr) => acc + curr.accountsCount, 0)}</div>
                            <div className="text-sm text-muted-foreground">حساب مرتبط</div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Proxies Table */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Network className="h-5 w-5" />
                        قائمة السيرفرات
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Session ID / التسمية</TableHead>
                                <TableHead className="text-center">الحالة</TableHead>
                                <TableHead className="text-center">IP الحالي</TableHead>
                                <TableHead className="text-center">الاستجابة</TableHead>
                                <TableHead className="text-center">آخر اختبار</TableHead>
                                <TableHead className="text-center">الحسابات</TableHead>
                                <TableHead className="text-center">الإجراءات</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {proxies.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                        لا توجد سيرفرات بروكسي. أضف واحداً الآن!
                                    </TableCell>
                                </TableRow>
                            ) : (
                                proxies.map((proxy) => (
                                    <TableRow key={proxy.id}>
                                        <TableCell>
                                            <div>
                                                <div className="font-medium">{proxy.label || proxy.sessionId}</div>
                                                <div className="text-xs text-muted-foreground font-mono">{proxy.sessionId}</div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-center">{getStatusBadge(proxy)}</TableCell>
                                        <TableCell className="text-center font-mono text-sm">
                                            {proxy.lastIp || '-'}
                                        </TableCell>
                                        <TableCell className="text-center">
                                            {proxy.responseTimeMs ? (
                                                <span className={`font-mono ${proxy.responseTimeMs < 500 ? 'text-green-600' : 'text-orange-600'}`}>
                                                    {proxy.responseTimeMs}ms
                                                </span>
                                            ) : '-'}
                                        </TableCell>
                                        <TableCell className="text-center text-sm text-muted-foreground">
                                            {proxy.lastTestedAt ? format(new Date(proxy.lastTestedAt), 'PP p') : '-'}
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <Badge variant="secondary">{proxy.accountsCount}</Badge>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex justify-center gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleTestProxy(proxy)}
                                                    disabled={testingProxyId === proxy.id}
                                                    title="اختبار الاتصال"
                                                >
                                                    <Activity className={`h-4 w-4 ${testingProxyId === proxy.id ? 'animate-spin' : ''}`} />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleToggleStatus(proxy)}
                                                    title={proxy.isActive ? 'تعطيل' : 'تفعيل'}
                                                >
                                                    <div className={`h-2 w-2 rounded-full ${proxy.isActive ? 'bg-green-600' : 'bg-gray-300'}`} />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => {
                                                        setEditProxy(proxy)
                                                        setFormData({
                                                            sessionId: proxy.sessionId,
                                                            label: proxy.label || ''
                                                        })
                                                    }}
                                                    title="تعديل"
                                                >
                                                    <Edit className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleDeleteProxy(proxy)}
                                                    title="حذف"
                                                    className="text-red-600 hover:text-red-700"
                                                    disabled={proxy.accountsCount > 0}
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
            <Dialog open={!!editProxy} onOpenChange={(open) => !open && setEditProxy(null)}>
                <DialogContent dir="rtl">
                    <DialogHeader>
                        <DialogTitle>تعديل البروكسي</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleUpdateProxy} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="edit-sessionId">Session ID</Label>
                            <Input id="edit-sessionId" value={formData.sessionId} disabled className="bg-muted" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="edit-label">التسمية</Label>
                            <Input
                                id="edit-label"
                                value={formData.label}
                                onChange={(e) => setFormData({ ...formData, label: e.target.value })}
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
