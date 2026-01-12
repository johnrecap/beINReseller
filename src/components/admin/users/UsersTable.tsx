'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Search, MoreVertical, Edit2, Ban, CheckCircle, Wallet, KeyRound, ArrowRight, ArrowLeft } from 'lucide-react'
import { format } from 'date-fns'
import { ar } from 'date-fns/locale'
import CreateUserDialog from './CreateUserDialog'
import EditUserDialog from './EditUserDialog'
import AddBalanceDialog from './AddBalanceDialog'
import ResetPasswordDialog from './ResetPasswordDialog'

interface User {
    id: string
    username: string
    email: string
    role: string
    balance: number
    isActive: boolean
    createdAt: string
    transactionCount: number
    operationCount: number
}

export default function UsersTable() {
    const [users, setUsers] = useState<User[]>([])
    const [loading, setLoading] = useState(true)
    const [page, setPage] = useState(1)
    const [totalPages, setTotalPages] = useState(1)
    const [search, setSearch] = useState('')
    const [debouncedSearch, setDebouncedSearch] = useState('')

    // Dialog States
    const [isCreateOpen, setCreateOpen] = useState(false)
    const [editUser, setEditUser] = useState<User | null>(null)
    const [balanceUser, setBalanceUser] = useState<User | null>(null)
    const [resetUser, setResetUser] = useState<User | null>(null)

    // Debounce Search
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search), 500)
        return () => clearTimeout(timer)
    }, [search])

    const fetchUsers = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch(`/api/admin/users?page=${page}&limit=10&search=${debouncedSearch}`)
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
        if (!confirm(user.isActive ? 'هل أنت متأكد من تعطيل هذا المستخدم؟' : 'هل أنت متأكد من تفعيل هذا المستخدم؟')) return

        try {
            const res = await fetch(`/api/admin/users/${user.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isActive: !user.isActive }),
            })
            if (res.ok) fetchUsers()
        } catch (error) {
            console.error('Failed to update status', error)
        }
    }

    return (
        <div className="space-y-4">
            {/* Header Actions */}
            <div className="flex flex-col sm:flex-row justify-between gap-4">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                        type="text"
                        placeholder="بحث باسم المستخدم أو البريد..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pr-10 pl-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-purple-500"
                    />
                </div>
                <button
                    onClick={() => setCreateOpen(true)}
                    className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors"
                >
                    <Plus className="w-5 h-5" />
                    <span>إضافة موزع جديد</span>
                </button>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50 border-b border-gray-100">
                            <tr>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">المستخدم</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">الرصيد</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">الحالة</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">النشاط</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">تاريخ الإنشاء</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 pl-6">إجراءات</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                [...Array(5)].map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td className="p-4"><div className="h-4 bg-gray-100 rounded w-24"></div></td>
                                        <td className="p-4"><div className="h-4 bg-gray-100 rounded w-16"></div></td>
                                        <td className="p-4"><div className="h-6 bg-gray-100 rounded-full w-12"></div></td>
                                        <td className="p-4"><div className="h-4 bg-gray-100 rounded w-20"></div></td>
                                        <td className="p-4"><div className="h-4 bg-gray-100 rounded w-24"></div></td>
                                        <td className="p-4"><div className="h-8 bg-gray-100 rounded w-8"></div></td>
                                    </tr>
                                ))
                            ) : users.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="p-8 text-center text-gray-400">لا يوجد مستخدمين</td>
                                </tr>
                            ) : (
                                users.map((user) => (
                                    <tr key={user.id} className="hover:bg-gray-50 transition-colors group">
                                        <td className="px-4 py-3">
                                            <div>
                                                <p className="font-semibold text-gray-800">{user.username}</p>
                                                <p className="text-xs text-gray-500 dir-ltr text-right">{user.email}</p>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <p className="font-bold text-gray-800 dir-ltr text-right">{user.balance.toLocaleString()} ريال</p>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${user.isActive
                                                    ? 'bg-green-100 text-green-700'
                                                    : 'bg-red-100 text-red-700'
                                                }`}>
                                                {user.isActive ? <CheckCircle className="w-3 h-3" /> : <Ban className="w-3 h-3" />}
                                                {user.isActive ? 'نشط' : 'معطل'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-xs text-gray-500">
                                            <p>{user.operationCount} عملية</p>
                                            <p>{user.transactionCount} معاملة</p>
                                        </td>
                                        <td className="px-4 py-3 text-xs text-gray-500">
                                            {format(new Date(user.createdAt), 'dd/MM/yyyy', { locale: ar })}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => setBalanceUser(user)}
                                                    className="p-1.5 hover:bg-green-50 text-green-600 rounded-lg transition-colors"
                                                    title="شحن رصيد"
                                                >
                                                    <Wallet className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => setResetUser(user)}
                                                    className="p-1.5 hover:bg-amber-50 text-amber-600 rounded-lg transition-colors"
                                                    title="إعادة تعيين كلمة المرور"
                                                >
                                                    <KeyRound className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => setEditUser(user)}
                                                    className="p-1.5 hover:bg-blue-50 text-blue-600 rounded-lg transition-colors"
                                                    title="تعديل"
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleToggleStatus(user)}
                                                    className={`p-1.5 rounded-lg transition-colors ${user.isActive
                                                            ? 'hover:bg-red-50 text-red-600'
                                                            : 'hover:bg-green-50 text-green-600'
                                                        }`}
                                                    title={user.isActive ? 'تعطيل' : 'تفعيل'}
                                                >
                                                    {user.isActive ? <Ban className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
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
                    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                        <p className="text-sm text-gray-500">
                            صفحة {page} من {totalPages}
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page <= 1}
                                className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <ArrowRight className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page >= totalPages}
                                className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <ArrowLeft className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Dialogs */}
            <CreateUserDialog
                isOpen={isCreateOpen}
                onClose={() => setCreateOpen(false)}
                onSuccess={fetchUsers}
            />
            <EditUserDialog
                isOpen={!!editUser}
                onClose={() => setEditUser(null)}
                onSuccess={fetchUsers}
                user={editUser}
            />
            <AddBalanceDialog
                isOpen={!!balanceUser}
                onClose={() => setBalanceUser(null)}
                onSuccess={fetchUsers}
                userId={balanceUser?.id || null}
                username={balanceUser?.username || null}
            />
            <ResetPasswordDialog
                isOpen={!!resetUser}
                onClose={() => setResetUser(null)}
                userId={resetUser?.id || null}
                username={resetUser?.username || null}
            />
        </div>
    )
}
