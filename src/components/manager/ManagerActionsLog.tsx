'use client'

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { format } from "date-fns"
import { useTranslation } from "@/hooks/useTranslation"

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
    const { t, dir } = useTranslation()
    const textAlign = dir === 'rtl' ? 'text-right' : 'text-left'

    return (
        <div className="rounded-md border">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className={textAlign}>{t.manager?.actionsLog?.user || 'User'}</TableHead>
                        <TableHead className={textAlign}>{t.manager?.actionsLog?.action || 'Action Type'}</TableHead>
                        <TableHead className={textAlign}>{t.manager?.actionsLog?.details || 'Details'}</TableHead>
                        <TableHead className={textAlign}>{t.manager?.actionsLog?.date || 'Time'}</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {actions.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={4} className="h-24 text-center">
                                {t.manager?.actionsLog?.noLogs || 'No recent action logs'}
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
