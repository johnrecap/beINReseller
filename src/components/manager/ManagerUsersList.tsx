'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Loader2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

interface User {
    id: string
    username: string
    email: string
    balance: number
    isActive: boolean
    createdAt: string
    linkedAt: string
    operationsCount: number
}

interface ManagerUsersListProps {
    users: User[]
}

export function ManagerUsersList({ users }: ManagerUsersListProps) {
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [openDialogId, setOpenDialogId] = useState<string | null>(null)
    const router = useRouter()

    const handleDelete = async (user: User) => {
        setDeletingId(user.id)
        setOpenDialogId(null)
        
        try {
            const res = await fetch(`/api/manager/users/${user.id}`, {
                method: 'DELETE'
            })
            const data = await res.json()
            
            if (res.ok) {
                toast.success(data.message || 'تم حذف المستخدم بنجاح')
                router.refresh()
            } else {
                toast.error(data.error || 'فشل في حذف المستخدم')
            }
        } catch {
            toast.error('حدث خطأ أثناء الحذف')
        } finally {
            setDeletingId(null)
        }
    }

    return (
        <div className="rounded-md border">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="text-right">اسم المستخدم</TableHead>
                        <TableHead className="text-right">البريد الإلكتروني</TableHead>
                        <TableHead className="text-right">الرصيد</TableHead>
                        <TableHead className="text-right">الحالة</TableHead>
                        <TableHead className="text-right">العمليات</TableHead>
                        <TableHead className="text-right">تاريخ الإضافة</TableHead>
                        <TableHead className="text-center w-[80px]">إجراءات</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {users.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={7} className="h-24 text-center">
                                لا يوجد مستخدمين مرتبطين
                            </TableCell>
                        </TableRow>
                    ) : (
                        users.map((user) => (
                            <TableRow key={user.id} className="group">
                                <TableCell className="font-medium">{user.username}</TableCell>
                                <TableCell>{user.email}</TableCell>
                                <TableCell>${user.balance.toFixed(2)}</TableCell>
                                <TableCell>
                                    <Badge variant={user.isActive ? "default" : "destructive"}>
                                        {user.isActive ? "نشط" : "معطل"}
                                    </Badge>
                                </TableCell>
                                <TableCell>{user.operationsCount}</TableCell>
                                <TableCell>{format(new Date(user.linkedAt), "yyyy-MM-dd")}</TableCell>
                                <TableCell className="text-center">
                                    <AlertDialog 
                                        open={openDialogId === user.id} 
                                        onOpenChange={(open) => setOpenDialogId(open ? user.id : null)}
                                    >
                                        <AlertDialogTrigger asChild>
                                            <button
                                                disabled={deletingId === user.id}
                                                className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50"
                                                title="حذف المستخدم"
                                            >
                                                {deletingId === user.id ? (
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                ) : (
                                                    <Trash2 className="w-4 h-4" />
                                                )}
                                            </button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <div className="flex items-center gap-3 justify-end">
                                                    <AlertDialogTitle>حذف المستخدم</AlertDialogTitle>
                                                    <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-full">
                                                        <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
                                                    </div>
                                                </div>
                                                <AlertDialogDescription className="text-right space-y-2">
                                                    <p>
                                                        هل أنت متأكد من حذف المستخدم <strong className="text-foreground">{user.username}</strong>؟
                                                    </p>
                                                    {user.balance > 0 && (
                                                        <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                                                            <p className="text-green-700 dark:text-green-400 font-medium">
                                                                سيتم إرجاع رصيد <strong className="text-green-800 dark:text-green-300">${user.balance.toFixed(2)}</strong> لحسابك
                                                            </p>
                                                        </div>
                                                    )}
                                                    <p className="text-xs text-muted-foreground">
                                                        هذا الإجراء لا يمكن التراجع عنه
                                                    </p>
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                                <AlertDialogAction onClick={() => handleDelete(user)}>
                                                    حذف المستخدم
                                                </AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                </TableCell>
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>
        </div>
    )
}
