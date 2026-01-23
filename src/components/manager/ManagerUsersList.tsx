import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"

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
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {users.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={6} className="h-24 text-center">
                                لا يوجد مستخدمين مرتبطين
                            </TableCell>
                        </TableRow>
                    ) : (
                        users.map((user) => (
                            <TableRow key={user.id}>
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
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>
        </div>
    )
}
