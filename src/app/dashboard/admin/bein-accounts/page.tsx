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
    Users,
    Loader2,
    DollarSign
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
    dealerBalance: number | null
    balanceUpdatedAt: string | null
    proxyId: string | null
    hasTotpSecret?: boolean
    proxy?: {
        host: string
        port: number
        label: string
    }
}

interface Proxy {
    id: string
    host: string
    port: number
    hasPassword: boolean
    label: string
    isActive: boolean
}

interface PoolStatus {
    totalAccounts: number
    activeAccounts: number
    availableNow: number
    inCooldown: number
    rateLimited: number
}

export default function BeinAccountsPage() {
    const { data: session, status } = useSession()
    const router = useRouter()
    const { t } = useTranslation()
    const [accounts, setAccounts] = useState<BeinAccount[]>([])
    const [poolStatus, setPoolStatus] = useState<PoolStatus | null>(null)
    const [proxies, setProxies] = useState<Proxy[]>([])
    const [loading, setLoading] = useState(true)
    const [addDialogOpen, setAddDialogOpen] = useState(false)
    const [editAccount, setEditAccount] = useState<BeinAccount | null>(null)

    // Set dynamic page title
    useEffect(() => {
        document.title = `${t.adminBeinAccounts?.title || 'beIN Accounts'} | Desh Panel`
    }, [t])

    const [formData, setFormData] = useState({
        username: '',
        password: '',
        totpSecret: '',
        label: '',
        priority: 0,
        proxyId: ''
    })

    // State for tracking balance refresh
    const [refreshingBalanceId, setRefreshingBalanceId] = useState<string | null>(null)

    const fetchAccounts = useCallback(async () => {
        try {
            const res = await fetch('/api/admin/bein-accounts')
            const data = await res.json()
            if (data.success) {
                setAccounts(data.accounts)
                setPoolStatus(data.poolStatus)
            }
        } catch {
            toast.error(t.adminBeinAccounts?.messages?.loadFailed || 'Failed to load accounts')
        } finally {
            setLoading(false)
        }
    }, [t])

    const fetchProxies = useCallback(async () => {
        try {
            const res = await fetch('/api/admin/proxies')
            const data = await res.json()
            if (data.success) {
                setProxies(data.proxies)
            }
        } catch (e) {
            console.error(e)
        }
    }, [])

    useEffect(() => {
        if (status === 'authenticated') {
            if (session?.user?.role !== 'ADMIN') {
                router.push('/dashboard')
            } else {
                fetchAccounts()
                fetchProxies()
            }
        }
    }, [status, session, router, fetchAccounts, fetchProxies])

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
                toast.success(t.adminBeinAccounts?.messages?.addSuccess || 'Account added successfully')
                setAddDialogOpen(false)
                setFormData({ username: '', password: '', totpSecret: '', label: '', priority: 0, proxyId: '' })
                fetchAccounts()
            } else {
                toast.error(data.error)
            }
        } catch {
            toast.error(t.adminBeinAccounts?.messages?.addFailed || 'Failed to add account')
        }
    }

    const handleUpdateAccount = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!editAccount) return
        try {
            // Only include totpSecret if user entered a new value (not empty)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const updateData: Record<string, any> = { ...formData }
            if (!updateData.totpSecret || updateData.totpSecret.trim() === '') {
                delete updateData.totpSecret // Don't send empty totpSecret to preserve existing value
            }

            const res = await fetch(`/api/admin/bein-accounts/${editAccount.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updateData)
            })
            const data = await res.json()
            if (data.success) {
                toast.success(t.adminBeinAccounts?.messages?.updateSuccess || 'Account updated successfully')
                setEditAccount(null)
                setFormData({ username: '', password: '', totpSecret: '', label: '', priority: 0, proxyId: '' })
                fetchAccounts()
            } else {
                toast.error(data.error)
            }
        } catch {
            toast.error(t.adminBeinAccounts?.messages?.updateFailed || 'Failed to update account')
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
            toast.error(t.adminBeinAccounts?.messages?.toggleFailed || 'Failed to toggle account status')
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
            toast.error(t.adminBeinAccounts?.messages?.resetFailed || 'Failed to reset account')
        }
    }

    const handleDeleteAccount = async (account: BeinAccount) => {
        if (!confirm(t.adminBeinAccounts?.messages?.deleteConfirm || 'Are you sure you want to delete this account?')) return
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
            toast.error(t.adminBeinAccounts?.messages?.deleteFailed || 'Failed to delete account')
        }
    }

    const handleRefreshBalance = async (account: BeinAccount) => {
        if (!account.isActive) {
            toast.error(t.adminBeinAccounts?.messages?.accountNotActive || 'Account is not active')
            return
        }
        
        setRefreshingBalanceId(account.id)
        try {
            const res = await fetch(`/api/admin/bein-accounts/${account.id}/check-balance`, {
                method: 'POST'
            })
            const data = await res.json()
            if (data.success) {
                toast.success(data.message || `${t.adminBeinAccounts?.messages?.balanceUpdated || 'Balance updated'}: ${data.balance} USD`)
                fetchAccounts()
            } else {
                toast.error(data.error || t.adminBeinAccounts?.messages?.balanceFailed || 'Failed to fetch balance')
            }
        } catch {
            toast.error(t.adminBeinAccounts?.messages?.balanceFailed || 'Failed to fetch balance')
        } finally {
            setRefreshingBalanceId(null)
        }
    }

    const getStatusBadge = (account: BeinAccount) => {
        if (!account.isActive) {
            return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />{t.adminBeinAccounts?.status?.disabled || 'Disabled'}</Badge>
        }
        if (account.cooldownUntil && new Date(account.cooldownUntil) > new Date()) {
            return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />{t.adminBeinAccounts?.status?.cooldown || 'Cooldown'}</Badge>
        }
        if (account.consecutiveFailures >= 3) {
            return <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />{t.adminBeinAccounts?.status?.error || 'Error'}</Badge>
        }
        return <Badge variant="default" className="gap-1 bg-green-600"><CheckCircle className="h-3 w-3" />{t.adminBeinAccounts?.status?.active || 'Active'}</Badge>
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
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg">
                        <Users className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">{t.adminBeinAccounts?.title || 'beIN Account Management'}</h1>
                        <p className="text-muted-foreground text-sm">{t.adminBeinAccounts?.subtitle || 'Manage bot accounts for smart distribution'}</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={fetchAccounts}>
                        <RefreshCw className="h-4 w-4 ml-2" />
                        {t.adminBeinAccounts?.refresh || t.common?.refresh || 'Refresh'}
                    </Button>
                    <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
                        <DialogTrigger asChild>
                            <Button>
                                <Plus className="h-4 w-4 ml-2" />
                                {t.adminBeinAccounts?.addAccount || 'Add Account'}
                            </Button>
                        </DialogTrigger>
                        <DialogContent dir="rtl">
                            <DialogHeader>
                                <DialogTitle>{t.adminBeinAccounts?.dialogs?.addTitle || 'Add New Account'}</DialogTitle>
                            </DialogHeader>
                            <form onSubmit={handleAddAccount} className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="username">{t.adminBeinAccounts?.dialogs?.username || 'Username'} *</Label>
                                    <Input
                                        id="username"
                                        value={formData.username}
                                        onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="password">{t.adminBeinAccounts?.dialogs?.password || 'Password'} *</Label>
                                    <Input
                                        id="password"
                                        type="password"
                                        value={formData.password}
                                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="totpSecret">{t.adminBeinAccounts?.dialogs?.totpSecret || 'TOTP Secret (2FA)'}</Label>
                                    <Input
                                        id="totpSecret"
                                        value={formData.totpSecret}
                                        onChange={(e) => setFormData({ ...formData, totpSecret: e.target.value })}
                                        placeholder={t.adminBeinAccounts?.dialogs?.optional || 'Optional'}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="label">{t.adminBeinAccounts?.dialogs?.label || 'Label'}</Label>
                                    <Input
                                        id="label"
                                        value={formData.label}
                                        onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                                        placeholder={t.adminBeinAccounts?.dialogs?.labelPlaceholder || 'e.g. Main Account'}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="priority">{t.adminBeinAccounts?.dialogs?.priority || 'Priority'} (0-10)</Label>
                                    <Input
                                        id="priority"
                                        type="number"
                                        min="0"
                                        max="10"
                                        value={formData.priority}
                                        onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="proxyId">{t.adminBeinAccounts?.dialogs?.proxy || 'Proxy'}</Label>
                                    <select
                                        id="proxyId"
                                        title={t.adminBeinAccounts?.dialogs?.selectProxy || 'Select Proxy'}
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                        value={formData.proxyId}
                                        onChange={(e) => setFormData({ ...formData, proxyId: e.target.value })}
                                    >
                                        <option value="">{t.adminBeinAccounts?.dialogs?.noProxy || '-- No Proxy --'}</option>
                                        {proxies.filter(p => p.isActive).map(p => (
                                            <option key={p.id} value={p.id}>
                                                {p.label} ({p.host}:{p.port})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <DialogFooter>
                                    <DialogClose asChild>
                                        <Button type="button" variant="outline">{t.common?.cancel || 'Cancel'}</Button>
                                    </DialogClose>
                                    <Button type="submit">{t.adminBeinAccounts?.dialogs?.add || 'Add'}</Button>
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
                            <div className="text-sm text-muted-foreground">{t.adminBeinAccounts?.stats?.total || 'Total'}</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="p-4 text-center">
                            <div className="text-3xl font-bold text-green-600">{poolStatus.activeAccounts}</div>
                            <div className="text-sm text-muted-foreground">{t.adminBeinAccounts?.stats?.active || 'Active'}</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="p-4 text-center">
                            <div className="text-3xl font-bold text-blue-600">{poolStatus.availableNow}</div>
                            <div className="text-sm text-muted-foreground">{t.adminBeinAccounts?.stats?.available || 'Available'}</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="p-4 text-center">
                            <div className="text-3xl font-bold text-yellow-600">{poolStatus.inCooldown}</div>
                            <div className="text-sm text-muted-foreground">{t.adminBeinAccounts?.stats?.resting || 'Resting'}</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="p-4 text-center">
                            <div className="text-3xl font-bold text-orange-600">{poolStatus.rateLimited}</div>
                            <div className="text-sm text-muted-foreground">{t.adminBeinAccounts?.stats?.limited || 'Limited'}</div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Accounts Table */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Users className="h-5 w-5" />
                        {t.adminBeinAccounts?.table?.accountsList || 'Accounts List'}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t.adminBeinAccounts?.table?.account || 'Account'}</TableHead>
                                <TableHead className="text-center">{t.adminBeinAccounts?.table?.proxy || 'Proxy'}</TableHead>
                                <TableHead className="text-center">{t.adminBeinAccounts?.table?.status || 'Status'}</TableHead>
                                <TableHead className="text-center">{t.adminBeinAccounts?.table?.priority || 'Priority'}</TableHead>
                                <TableHead className="text-center">{t.adminBeinAccounts?.table?.balance || 'beIN Balance'}</TableHead>
                                <TableHead className="text-center">{t.adminBeinAccounts?.table?.successRate || 'Success Rate'}</TableHead>
                                <TableHead className="text-center">{t.adminBeinAccounts?.table?.operations || 'Operations'}</TableHead>
                                <TableHead className="text-center">{t.adminBeinAccounts?.table?.lastError || 'Last Error'}</TableHead>
                                <TableHead className="text-center">{t.adminBeinAccounts?.table?.actions || 'Actions'}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {accounts.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                                        {t.adminBeinAccounts?.table?.noAccounts || 'No accounts. Add your first account!'}
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
                                        <TableCell className="text-center">
                                            {account.proxy ? (
                                                <Badge variant="outline" className="font-mono text-xs">
                                                    {account.proxy.label}
                                                </Badge>
                                            ) : (
                                                <span className="text-muted-foreground text-xs">-</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-center">{getStatusBadge(account)}</TableCell>
                                        <TableCell className="text-center">{account.priority}</TableCell>
                                        <TableCell className="text-center">
                                            <div className="flex items-center justify-center gap-1">
                                                {refreshingBalanceId === account.id ? (
                                                    <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                                                ) : account.dealerBalance !== null ? (
                                                    <span className="font-bold text-blue-600">
                                                        {account.dealerBalance} USD
                                                    </span>
                                                ) : (
                                                    <span className="text-muted-foreground">-</span>
                                                )}
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-6 w-6 p-0"
                                                    onClick={() => handleRefreshBalance(account)}
                                                    disabled={refreshingBalanceId === account.id || !account.isActive}
                                                    title={t.adminBeinAccounts?.actions?.refreshBalance || 'Refresh Balance'}
                                                >
                                                    {refreshingBalanceId === account.id ? (
                                                        <Loader2 className="h-3 w-3 animate-spin" />
                                                    ) : (
                                                        <RefreshCw className="h-3 w-3" />
                                                    )}
                                                </Button>
                                            </div>
                                        </TableCell>
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
                                                    title={account.isActive ? t.adminBeinAccounts?.actions?.disable || 'Disable' : t.adminBeinAccounts?.actions?.enable || 'Enable'}
                                                >
                                                    <Power className={`h-4 w-4 ${account.isActive ? 'text-green-600' : 'text-muted-foreground'}`} />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleResetAccount(account)}
                                                    title={t.adminBeinAccounts?.actions?.reset || 'Reset'}
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
                                                            priority: account.priority,
                                                            proxyId: account.proxyId || ''
                                                        })
                                                    }}
                                                    title={t.common?.edit || 'Edit'}
                                                >
                                                    <Edit className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleDeleteAccount(account)}
                                                    title={t.adminBeinAccounts?.actions?.delete || 'Delete'}
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
            <Dialog open={!!editAccount} onOpenChange={(open) => !open && setEditAccount(null)}>
                <DialogContent dir="rtl">
                    <DialogHeader>
                        <DialogTitle>{t.adminBeinAccounts?.dialogs?.editTitle || 'Edit Account'}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleUpdateAccount} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="edit-username">{t.adminBeinAccounts?.dialogs?.username || 'Username'}</Label>
                            <Input id="edit-username" value={formData.username} disabled />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="edit-password">{t.adminBeinAccounts?.dialogs?.passwordKeep || 'Password (leave empty to keep)'}</Label>
                            <Input
                                id="edit-password"
                                type="password"
                                value={formData.password}
                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="edit-totpSecret">{t.adminBeinAccounts?.dialogs?.totpSecret || 'TOTP Secret'}</Label>
                            <Input
                                id="edit-totpSecret"
                                value={formData.totpSecret}
                                onChange={(e) => setFormData({ ...formData, totpSecret: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="edit-label">{t.adminBeinAccounts?.dialogs?.label || 'Label'}</Label>
                            <Input
                                id="edit-label"
                                value={formData.label}
                                onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="edit-priority">{t.adminBeinAccounts?.dialogs?.priority || 'Priority'}</Label>
                            <Input
                                id="edit-priority"
                                type="number"
                                min="0"
                                max="10"
                                value={formData.priority}
                                onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="edit-proxyId">{t.adminBeinAccounts?.dialogs?.proxy || 'Proxy'}</Label>
                            <select
                                id="edit-proxyId"
                                title={t.adminBeinAccounts?.dialogs?.selectProxy || 'Select Proxy'}
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                value={formData.proxyId}
                                onChange={(e) => setFormData({ ...formData, proxyId: e.target.value })}
                            >
                                <option value="">{t.adminBeinAccounts?.dialogs?.noProxy || '-- No Proxy --'}</option>
                                {proxies.filter(p => p.isActive).map(p => (
                                    <option key={p.id} value={p.id}>
                                        {p.label} ({p.host}:{p.port})
                                    </option>
                                ))}
                            </select>
                        </div>
                        <DialogFooter>
                            <DialogClose asChild>
                                <Button type="button" variant="outline">{t.common?.cancel || 'Cancel'}</Button>
                            </DialogClose>
                            <Button type="submit">{t.common?.save || 'Save'}</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    )
}
