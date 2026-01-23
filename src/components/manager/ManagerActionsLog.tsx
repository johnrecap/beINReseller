import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { format } from "date-fns"

interface Action {
    id: string
    actionType: string
    details: any
    createdAt: string
    user: {
        username: string
    }
}

interface ManagerActionsLogProps {
    actions: Action[]
}

export function ManagerActionsLog({ actions }: ManagerActionsLogProps) {
    return (
        <div className="rounded-md border">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="text-right">المستخدم</TableHead>
                        <TableHead className="text-right">نوع العملية</TableHead>
                        <TableHead className="text-right">التفاصيل</TableHead>
                        <TableHead className="text-right">التوقيت</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {actions.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={4} className="h-24 text-center">
                                لا توجد سجلات عمليات حديثة
                            </TableCell>
                        </TableRow>
                    ) : (
                        actions.map((action) => (
                            <TableRow key={action.id}>
                                <TableCell className="font-medium">{action.user.username}</TableCell>
                                <TableCell>{action.actionType}</TableCell>
                                <TableCell className="max-w-[300px] truncate" title={JSON.stringify(action.details)}>
                                    {JSON.stringify(action.details)}
                                </TableCell>
                                <TableCell>{format(new Date(action.createdAt), "yyyy-MM-dd HH:mm")}</TableCell>
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>
        </div>
    )
}
