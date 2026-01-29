'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Loader2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { useTranslation } from '@/hooks/useTranslation'
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
    const { t, dir } = useTranslation()

    const handleDelete = async (user: User) => {
        setDeletingId(user.id)
        setOpenDialogId(null)
        
        try {
            const res = await fetch(`/api/manager/users/${user.id}`, {
                method: 'DELETE'
            })
            const data = await res.json()
            
            if (res.ok) {
                toast.success(data.message || t.manager?.messages?.userDeleted || 'User deleted successfully')
                router.refresh()
            } else {
                toast.error(data.error || t.manager?.messages?.error || 'Failed to delete user')
            }
        } catch {
            toast.error(t.manager?.messages?.error || 'An error occurred')
        } finally {
            setDeletingId(null)
        }
    }

    const textAlign = dir === 'rtl' ? 'text-right' : 'text-left'

    return (
        <div className="rounded-md border">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className={textAlign}>{t.manager?.users?.table?.user || 'Username'}</TableHead>
                        <TableHead className={textAlign}>{t.manager?.users?.table?.email || 'Email'}</TableHead>
                        <TableHead className={textAlign}>{t.manager?.users?.table?.balance || 'Balance'}</TableHead>
                        <TableHead className={textAlign}>{t.manager?.users?.table?.status || 'Status'}</TableHead>
                        <TableHead className={textAlign}>{t.common?.operations || 'Operations'}</TableHead>
                        <TableHead className={textAlign}>{t.manager?.users?.table?.created || 'Date Added'}</TableHead>
                        <TableHead className="text-center w-[80px]">{t.common?.actions || 'Actions'}</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {users.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={7} className="h-24 text-center">
                                {t.manager?.users?.table?.noUsers || 'No linked users'}
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
                                        {user.isActive ? (t.manager?.users?.table?.active || "Active") : (t.manager?.users?.table?.inactive || "Inactive")}
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
                                                className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg transition-colors disabled:opacity-50"
                                                title={t.manager?.users?.actions?.delete || 'Delete user'}
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
                                                <div className={`flex items-center gap-3 ${dir === 'rtl' ? 'justify-end' : 'justify-start'}`}>
                                                    <AlertDialogTitle>{t.manager?.users?.actions?.delete || 'Delete User'}</AlertDialogTitle>
                                                    <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-full">
                                                        <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
                                                    </div>
                                                </div>
                                                <AlertDialogDescription className={`${textAlign} space-y-2`}>
                                                    <p>
                                                        {t.manager?.deletedUsers?.deleteConfirmUser || 'Are you sure you want to delete user'} <strong className="text-foreground">{user.username}</strong>?
                                                    </p>
                                                    {user.balance > 0 && (
                                                        <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                                                            <p className="text-green-700 dark:text-green-400 font-medium">
                                                                {t.manager?.deletedUsers?.balanceRefund || 'Balance of'} <strong className="text-green-800 dark:text-green-300">${user.balance.toFixed(2)}</strong> {t.manager?.deletedUsers?.willBeRefunded || 'will be refunded to your account'}
                                                            </p>
                                                        </div>
                                                    )}
                                                    <p className="text-xs text-muted-foreground">
                                                        {t.manager?.deletedUsers?.cannotUndo || 'This action cannot be undone'}
                                                    </p>
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>{t.common?.cancel || 'Cancel'}</AlertDialogCancel>
                                                <AlertDialogAction onClick={() => handleDelete(user)}>
                                                    {t.manager?.users?.actions?.delete || 'Delete User'}
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
