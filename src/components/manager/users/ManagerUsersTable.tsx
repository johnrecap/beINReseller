'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, Ban, CheckCircle, Wallet, KeyRound, ArrowRight, ArrowLeft, Trash2, AlertTriangle } from 'lucide-react'
import { format } from 'date-fns'
import { ar, enUS, bn } from 'date-fns/locale'
import ManagerAddBalanceDialog from './ManagerAddBalanceDialog'
import ManagerResetPasswordDialog from './ManagerResetPasswordDialog'
import { useTranslation } from '@/hooks/useTranslation'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface User {
    id: string
    username: string
    email: string
    role: string
    balance: number
    isActive: boolean
    createdAt: string
}

interface ManagerUsersTableProps {
    managerBalance: number
    onBalanceChange: () => void
}

export default function ManagerUsersTable({ managerBalance, onBalanceChange }: ManagerUsersTableProps) {
    const { t, language } = useTranslation()
    const [users, setUsers] = useState<User[]>([])
    const [loading, setLoading] = useState(true)
    const [page, setPage] = useState(1)
    const [totalPages, setTotalPages] = useState(1)
    const [search, setSearch] = useState('')
    const [debouncedSearch, setDebouncedSearch] = useState('')

    // Dialog States
    const [balanceUser, setBalanceUser] = useState<User | null>(null)
    const [resetUser, setResetUser] = useState<User | null>(null)
    const [deleteUser, setDeleteUser] = useState<User | null>(null)
    const [deleteLoading, setDeleteLoading] = useState(false)
    const [deleteError, setDeleteError] = useState<string | null>(null)

    const localeMap = {
        ar: ar,
        en: enUS,
        bn: bn
    }

    const currentLocale = localeMap[language as keyof typeof localeMap] || ar

    // Debounce Search
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search), 500)
        return () => clearTimeout(timer)
    }, [search])

    const fetchUsers = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch(`/api/manager/users?page=${page}&limit=10&search=${debouncedSearch}`)
            const data = await res.json()
            if (res.ok) {
                setUsers(data.users)
                setTotalPages(data.totalPages)
            }
        } catch (error) {
            console.error('Failed to fetch users', error)
        } finally {
            setLoading(false)
        }
    }, [page, debouncedSearch])

    useEffect(() => {
        fetchUsers()
    }, [fetchUsers])

    const handleToggleStatus = async (user: User) => {
        const action = user.isActive ? 'تعطيل' : 'تفعيل'
        if (!confirm(`هل أنت متأكد من ${action} المستخدم "${user.username}"؟`)) return

        try {
            const res = await fetch(`/api/manager/users/${user.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isActive: !user.isActive }),
            })
            if (res.ok) fetchUsers()
            else {
                const data = await res.json()
                alert(data.error || 'فشل تحديث الحالة')
            }
        } catch (error) {
            console.error('Failed to update status', error)
        }
    }

    const handleDeleteUser = async () => {
        if (!deleteUser) return
        
        setDeleteLoading(true)
        setDeleteError(null)

        try {
            const res = await fetch(`/api/manager/users/${deleteUser.id}`, {
                method: 'DELETE',
            })
            const data = await res.json()
            if (res.ok) {
                fetchUsers()
                onBalanceChange() // Refresh manager balance
                setDeleteUser(null)
                alert(data.message || 'تم حذف المستخدم بنجاح')
            } else {
                setDeleteError(data.error || 'فشل حذف المستخدم')
            }
        } catch (error) {
            console.error('Failed to delete user', error)
            setDeleteError('حدث خطأ أثناء حذف المستخدم')
        } finally {
            setDeleteLoading(false)
        }
    }

    const handleBalanceSuccess = () => {
        fetchUsers()
        onBalanceChange() // Refresh manager balance
    }

    return (
        <div className="space-y-4">
            {/* Header Actions */}
            <div className="flex flex-col sm:flex-row justify-between gap-4">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5" />
                    <input
                        type="text"
                        placeholder="البحث بالاسم أو الإيميل..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pr-10 pl-4 py-2 border border-border rounded-lg focus:outline-none focus:border-purple-500 bg-background text-foreground"
                    />
                </div>
                <div className="text-sm text-muted-foreground self-center">
                    رصيدك: <span className="font-bold text-foreground">${managerBalance.toFixed(2)}</span>
                </div>
            </div>

            {/* Table */}
            <div className="bg-card rounded-xl shadow-sm overflow-hidden border border-border">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-secondary border-b border-border">
                            <tr>
                                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">المستخدم</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">الرصيد</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">الحالة</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">تاريخ الإنشاء</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground pl-6">الإجراءات</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {loading ? (
                                [...Array(5)].map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td className="p-4"><div className="h-4 bg-muted rounded w-24"></div></td>
                                        <td className="p-4"><div className="h-4 bg-muted rounded w-16"></div></td>
                                        <td className="p-4"><div className="h-6 bg-muted rounded-full w-12"></div></td>
                                        <td className="p-4"><div className="h-4 bg-muted rounded w-24"></div></td>
                                        <td className="p-4"><div className="h-8 bg-muted rounded w-8"></div></td>
                                    </tr>
                                ))
                            ) : users.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="p-8 text-center text-muted-foreground">لا يوجد مستخدمين</td>
                                </tr>
                            ) : (
                                users.map((user) => (
                                    <tr key={user.id} className="hover:bg-secondary transition-colors group">
                                        <td className="px-4 py-3">
                                            <div>
                                                <p className="font-semibold text-foreground">{user.username}</p>
                                                <p className="text-xs text-muted-foreground dir-ltr text-right">{user.email}</p>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <p className="font-bold text-foreground dir-ltr text-right">${(user.balance ?? 0).toFixed(2)}</p>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${user.isActive
                                                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                                                : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                                                }`}>
                                                {user.isActive ? <CheckCircle className="w-3 h-3" /> : <Ban className="w-3 h-3" />}
                                                {user.isActive ? 'نشط' : 'معطل'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-xs text-muted-foreground">
                                            {format(new Date(user.createdAt), 'dd/MM/yyyy', { locale: currentLocale })}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => setBalanceUser(user)}
                                                    className="p-1.5 hover:bg-green-50 dark:hover:bg-green-900/20 text-green-600 rounded-lg transition-colors"
                                                    title="إدارة الرصيد"
                                                >
                                                    <Wallet className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => setResetUser(user)}
                                                    className="p-1.5 hover:bg-amber-50 dark:hover:bg-amber-900/20 text-amber-600 rounded-lg transition-colors"
                                                    title="إعادة تعيين كلمة المرور"
                                                >
                                                    <KeyRound className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleToggleStatus(user)}
                                                    className={`p-1.5 rounded-lg transition-colors ${user.isActive
                                                        ? 'hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600'
                                                        : 'hover:bg-green-50 dark:hover:bg-green-900/20 text-green-600'
                                                        }`}
                                                    title={user.isActive ? 'تعطيل' : 'تفعيل'}
                                                >
                                                    {user.isActive ? <Ban className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                                                </button>
                                                <button
                                                    onClick={() => setDeleteUser(user)}
                                                    className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-700 rounded-lg transition-colors"
                                                    title="حذف المستخدم"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                        <p className="text-sm text-muted-foreground">
                            صفحة {page} من {totalPages}
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page <= 1}
                                className="p-2 rounded-lg border border-border hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                                title="الصفحة السابقة"
                            >
                                <ArrowRight className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page >= totalPages}
                                className="p-2 rounded-lg border border-border hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                                title="الصفحة التالية"
                            >
                                <ArrowLeft className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Dialogs */}
            <ManagerAddBalanceDialog
                isOpen={!!balanceUser}
                onClose={() => setBalanceUser(null)}
                onSuccess={handleBalanceSuccess}
                userId={balanceUser?.id || null}
                username={balanceUser?.username || null}
                managerBalance={managerBalance}
            />
            <ManagerResetPasswordDialog
                isOpen={!!resetUser}
                onClose={() => setResetUser(null)}
                userId={resetUser?.id || null}
                username={resetUser?.username || null}
            />
            
            {/* Delete Confirmation Dialog */}
            <AlertDialog open={!!deleteUser} onOpenChange={(open) => !open && setDeleteUser(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5 text-red-500" />
                            تأكيد حذف المستخدم
                        </AlertDialogTitle>
                        <AlertDialogDescription className="space-y-2">
                            <p>
                                هل أنت متأكد من حذف المستخدم <span className="font-bold text-foreground">{deleteUser?.username}</span>؟
                            </p>
                            {deleteUser && deleteUser.balance > 0 && (
                                <p className="text-green-600 dark:text-green-400 font-medium">
                                    سيتم إرجاع ${deleteUser.balance.toFixed(2)} لرصيدك
                                </p>
                            )}
                            {deleteError && (
                                <p className="text-red-600 dark:text-red-400 text-sm">{deleteError}</p>
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleteLoading}>إلغاء</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDeleteUser}
                            disabled={deleteLoading}
                            className="bg-red-600 hover:bg-red-700 text-white"
                        >
                            {deleteLoading ? 'جاري الحذف...' : 'حذف'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
