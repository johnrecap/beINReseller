'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { ar, enUS, bn } from 'date-fns/locale'
import { FileX, XCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { PanelTablePagination, SortableTableHead } from '@/components/ui/PanelTableControls'
import { useTranslation } from '@/hooks/useTranslation'

interface Operation {
    id: string
    type: string
    cardNumber: string
    amount: number
    status: string
    responseMessage?: string
    createdAt: string
    messageKey?: string | null
    settlementState?: string
    nextAction?: string
    confirmationExpired?: boolean
    reviewRequired?: boolean
    receiptAvailable?: boolean
    administrativeStopRequestedAt?: string | null
    administrativeArchivedAt?: string | null
}

interface OperationsTableProps {
    operations: Operation[]
    loading?: boolean
    page: number
    totalPages: number
    total: number
    sortConfig: { key: 'date' | 'amount' | 'status'; direction: 'asc' | 'desc' }
    onSortChange: (sort: OperationsTableProps['sortConfig']) => void
    onPageChange: (page: number) => void
    onRefresh?: () => void
}

function OperationProgress({ operation }: { operation: Operation }) {
    const { t } = useTranslation()
    const message = operation.messageKey?.startsWith('operations.')
        ? (t.operations as Record<string, string>)[operation.messageKey.slice('operations.'.length)] : null
    const action = operation.nextAction
    return <div className="mt-1 space-y-1 text-xs whitespace-normal">
        {message && <p>{message}</p>}
        {operation.settlementState === 'REFUNDED' && <p>{t.panelUi.refunded}</p>}
        {operation.settlementState === 'UNCONFIRMED' && <p>{t.panelUi.settlementUnconfirmed}</p>}
        {action && <p>{t.panelUi.nextAction}: {({ CONTACT_ADMIN: t.panelUi.contactAdmin, CONTINUE: t.panelUi.continueOperation,
            VIEW_ACTIVE_OPERATION: t.panelUi.viewActive, VIEW_HISTORY: t.panelUi.viewHistory, WAIT: t.panelUi.wait } as Record<string, string>)[action] ?? action}</p>}
        {(action === 'CONTINUE' || action === 'VIEW_ACTIVE_OPERATION') && <a className="underline" href="/dashboard/operations/active">{t.panelUi.viewActive}</a>}
    </div>
}

const statusColors: Record<string, string> = {
    PENDING: 'bg-[#3B82F6]/10 text-[#3B82F6] border border-[#3B82F6]/30',
    PROCESSING: 'bg-[#06B6D4]/10 text-[#06B6D4] border border-[#06B6D4]/30',
    AWAITING_CAPTCHA: 'bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/30',
    AWAITING_PACKAGE: 'bg-[#8B5CF6]/10 text-[#C4B5FD] border border-[#8B5CF6]/30',
    AWAITING_FINAL_CONFIRM: 'bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/30',
    COMPLETING: 'bg-[#06B6D4]/10 text-[#06B6D4] border border-[#06B6D4]/30',
    COMPLETED: 'bg-[#00A651]/10 text-[#00A651] border border-[#00A651]/30',
    FAILED: 'bg-[#ED1C24]/10 text-[#ED1C24] border border-[#ED1C24]/30',
    CANCELLED: 'bg-gray-500/10 text-gray-500 border border-gray-500/30',
    EXPIRED: 'bg-gray-500/10 text-gray-400 border border-gray-500/30',
    REVIEW_REQUIRED: 'bg-amber-500/10 text-amber-300 border border-amber-500/30',
}

const typeColors: Record<string, string> = {
    RENEW: 'bg-[#3B82F6]/10 text-[#3B82F6] border border-[#3B82F6]/30',
    CHECK_BALANCE: 'bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/30',
    SIGNAL_REFRESH: 'bg-[#00A651]/10 text-[#00A651] border border-[#00A651]/30',
}

// Cancellation admission is separate from the persisted settlement outcome.
const CANCELLABLE_STATUSES = ['PENDING', 'AWAITING_CAPTCHA']

export default function OperationsTable({
    operations,
    loading,
    page,
    total,
    sortConfig,
    onSortChange,
    onPageChange,
    onRefresh,
}: OperationsTableProps) {
    const { t, language } = useTranslation()
    const [cancellingId, setCancellingId] = useState<string | null>(null)

    const getDateLocale = () => {
        switch (language) {
            case 'ar': return ar
            case 'bn': return bn
            default: return enUS
        }
    }

    const getStatusLabel = (status: string) =>
        (t.status as Record<string, string>)?.[
        status.toLowerCase().replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())
        ] ?? status

    const handleSort = (key: 'date' | 'amount' | 'status') => {
        onSortChange({
            key,
            direction: sortConfig.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc'
        })
    }

    const sortedOperations = operations

    const handleCancel = async (operation: Operation) => {
        const confirmed = window.confirm(
            t.history.confirmCancel
        )
        if (!confirmed) return

        setCancellingId(operation.id)
        try {
            const res = await fetch(`/api/operations/${operation.id}/cancel`, {
                method: 'POST',
            })
            const data = await res.json()

            if (res.ok) {
                toast.success(t.panelUi.cancelAccepted)
                onRefresh?.()
            } else {
                toast.error(data.error || t.common.error)
            }
        } catch {
            toast.error(t.common.error)
        } finally {
            setCancellingId(null)
        }
    }

    if (loading) {
        return (
            <div className="bg-card rounded-xl shadow-sm overflow-hidden">
                <div className="animate-pulse">
                    <div className="h-12 bg-muted"></div>
                    {[...Array(5)].map((_, i) => (
                        <div key={i} className="h-16 bg-secondary border-t border-border"></div>
                    ))}
                </div>
            </div>
        )
    }

    if (operations.length === 0) {
        return (
            <div className="bg-card rounded-xl shadow-sm p-12 text-center animate-in zoom-in-95 duration-300">
                <div className="w-20 h-20 mx-auto mb-4 bg-muted rounded-full flex items-center justify-center">
                    <FileX className="w-10 h-10 text-muted-foreground/50" />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2">{t.history.noOperations}</h3>
                <p className="text-muted-foreground text-sm mb-6">{t.history.noMatchingOperations}</p>
                {onRefresh && (
                    <button
                        onClick={() => onRefresh()}
                        className="px-4 py-2 bg-secondary hover:bg-muted text-foreground rounded-lg text-sm font-medium transition-colors border border-border"
                    >
                        {t.common.reset}
                    </button>
                )}
            </div>
        )
    }

    return (
        <div className="bg-card rounded-xl shadow-sm overflow-hidden animate-in fade-in duration-500">
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
                <Table panel className="w-full">
                    <TableHeader className="bg-[#1a1d26]/50 border-b border-border">
                        <TableRow>
                            <TableHead className="px-6 py-4 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[60px]">#</TableHead>
                            <TableHead className="px-6 py-4 text-start text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[180px]">{t.history.type}</TableHead>
                            <TableHead className="px-6 py-4 text-start text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[140px]">{t.history.cardNumber}</TableHead>
                            <SortableTableHead
                                className="px-6 py-4 text-start text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[120px] cursor-pointer hover:text-foreground transition-colors group" onSort={() => handleSort('amount')} direction={sortConfig.key === 'amount' ? sortConfig.direction : undefined}>
                                <div className="flex items-center justify-start gap-1">
                                    {t.history.amount}
                                    <span className={`transition-opacity ${sortConfig.key === 'amount' ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'}`}>
                                        {sortConfig.direction === 'asc' ? '↑' : '↓'}
                                    </span>
                                </div>
                            </SortableTableHead>
                            <SortableTableHead
                                className="px-6 py-4 text-start text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[140px] cursor-pointer hover:text-foreground transition-colors group" onSort={() => handleSort('status')} direction={sortConfig.key === 'status' ? sortConfig.direction : undefined}>
                                <div className="flex items-center justify-start gap-1">
                                    {t.history.status}
                                    <span className={`transition-opacity ${sortConfig.key === 'status' ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'}`}>
                                        {sortConfig.direction === 'asc' ? '↑' : '↓'}
                                    </span>
                                </div>
                            </SortableTableHead>
                            <TableHead className="px-6 py-4 text-start text-xs font-semibold text-muted-foreground uppercase tracking-wider min-w-[250px]">{t.history.result}</TableHead>
                            <SortableTableHead
                                className="px-6 py-4 text-start text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[180px] cursor-pointer hover:text-foreground transition-colors group" onSort={() => handleSort('date')} direction={sortConfig.key === 'date' ? sortConfig.direction : undefined}>
                                <div className="flex items-center justify-start gap-1">
                                    {t.history.date}
                                    <span className={`transition-opacity ${sortConfig.key === 'date' ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'}`}>
                                        {sortConfig.direction === 'asc' ? '↑' : '↓'}
                                    </span>
                                </div>
                            </SortableTableHead>
                            <TableHead className="px-6 py-4 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[80px]">{t.history.actions}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y divide-border">
                        {sortedOperations.map((op, index) => (
                            <TableRow
                                key={op.id}
                                className="hover:bg-muted/30 transition-colors animate-in fade-in fill-mode-both"
                                style={{ animationDelay: `${index * 50}ms` }}
                            >
                                <TableCell className="px-6 py-4 text-sm text-muted-foreground text-center font-medium">
                                    {(page - 1) * 10 + index + 1}
                                </TableCell>
                                <TableCell className="px-6 py-4">
                                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${typeColors[op.type] || 'bg-gray-100 dark:bg-gray-800'} transition-transform hover:scale-105`}>
                                        {(t.operations as Record<string, string>)[op.type === 'CHECK_BALANCE' ? 'checkBalance' : op.type === 'SIGNAL_REFRESH' ? 'refreshSignal' : 'renew'] || op.type}
                                    </span>
                                </TableCell>
                                <TableCell className="px-6 py-4 font-mono text-sm text-foreground">
                                    <span className="bg-muted px-2 py-1 rounded text-xs tracking-wider">
                                        {op.cardNumber}
                                    </span>
                                </TableCell>
                                <TableCell className="px-6 py-4 text-sm font-bold text-foreground dir-ltr text-start">
                                    {op.amount > 0 ? (
                                        <span className="text-white">{op.amount.toFixed(2)} USD</span>
                                    ) : (
                                        <span className="text-muted-foreground">-</span>
                                    )}
                                </TableCell>
                                <TableCell className="px-6 py-4">
                                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${statusColors[op.status] || 'bg-gray-100 dark:bg-gray-800'} transition-transform hover:scale-105`}>
                                        {op.administrativeArchivedAt && op.status !== 'COMPLETED' ? t.panelUi.administrativelyArchived : getStatusLabel(op.status)}
                                    </span>
                                </TableCell>
                                <TableCell className="px-6 py-4 text-sm text-muted-foreground">
                                    <div className="max-w-[250px] truncate" title={op.responseMessage || ''}>
                                        <OperationProgress operation={op} />
                                        {op.responseMessage || '-'}
                                    </div>
                                </TableCell>
                                <TableCell className="px-6 py-4 text-sm text-muted-foreground dir-ltr text-start">
                                    {format(new Date(op.createdAt), 'HH:mm dd/MM/yyyy', { locale: getDateLocale() })}
                                </TableCell>
                                <TableCell className="px-6 py-4 text-center">
                                    {op.receiptAvailable ? (
                                        <a href={`/dashboard/operations/${op.id}/receipt`}
                                            className="inline-flex rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                                            {t.renewalReceipt.view}
                                        </a>
                                    ) : !op.administrativeStopRequestedAt && !op.administrativeArchivedAt && CANCELLABLE_STATUSES.includes(op.status) ? (
                                        <button
                                            onClick={() => handleCancel(op)}
                                            disabled={cancellingId === op.id}
                                            className="inline-flex items-center justify-center p-2 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-lg transition-colors disabled:opacity-50"
                                            title={t.history.cancelOperation}
                                        >
                                            {cancellingId === op.id ? (
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                            ) : (
                                                <XCircle className="w-4 h-4" />
                                            )}
                                        </button>
                                    ) : (
                                        <span className="text-xs text-muted-foreground">-</span>
                                    )}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            {/* Mobile List View */}
            <div className="md:hidden divide-y divide-border">
                {sortedOperations.map((op, index) => (
                    <div
                        key={op.id}
                        className="p-4 hover:bg-muted/10 transition-colors animate-in fade-in fill-mode-both"
                        style={{ animationDelay: `${index * 50}ms` }}
                    >
                        <div className="flex justify-between items-start mb-3">
                            <div className="flex flex-col">
                                <span className="font-mono text-sm font-medium text-foreground bg-muted/50 px-2 py-0.5 rounded w-fit mb-1">
                                    {op.cardNumber}
                                </span>
                                <span className="text-xs text-muted-foreground dir-ltr text-start w-fit">
                                    {format(new Date(op.createdAt), 'HH:mm dd/MM/yyyy', { locale: getDateLocale() })}
                                </span>
                            </div>
                            <div className="flex flex-col items-end gap-1.5">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold ${typeColors[op.type] || 'bg-gray-100 dark:bg-gray-800'}`}>
                                    {(t.operations as Record<string, string>)[op.type === 'CHECK_BALANCE' ? 'checkBalance' : op.type === 'SIGNAL_REFRESH' ? 'refreshSignal' : 'renew'] || op.type}
                                </span>
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold ${statusColors[op.status] || 'bg-gray-100 dark:bg-gray-800'}`}>
                                    {op.administrativeArchivedAt && op.status !== 'COMPLETED' ? t.panelUi.administrativelyArchived : getStatusLabel(op.status)}
                                </span>
                            </div>
                        </div>

                        <div className="flex justify-between items-end mt-4">
                            <div className="flex flex-col">
                                <span className="text-xs text-muted-foreground mb-1">{t.history.amount}:</span>
                                {op.amount > 0 ? (
                                    <span className="text-lg font-bold text-[#00A651]">{op.amount.toFixed(2)} USD</span>
                                ) : (
                                    <span className="text-sm font-medium text-muted-foreground">-</span>
                                )}
                            </div>

                            {op.receiptAvailable && (
                                <a href={`/dashboard/operations/${op.id}/receipt`}
                                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted">
                                    {t.renewalReceipt.view}
                                </a>
                            )}
                            {!op.administrativeStopRequestedAt && !op.administrativeArchivedAt && CANCELLABLE_STATUSES.includes(op.status) && (
                                <button
                                    onClick={() => handleCancel(op)}
                                    disabled={cancellingId === op.id}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30 rounded-lg"
                                >
                                    {cancellingId === op.id ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                        <XCircle className="w-3.5 h-3.5" />
                                    )}
                                    {t.history.cancelOperation}
                                </button>
                            )}
                        </div>

                        <OperationProgress operation={op} />
                        {op.responseMessage && (
                            <div className="mt-3 pt-3 border-t border-border border-dashed text-xs text-muted-foreground">
                                {op.responseMessage}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            <PanelTablePagination page={page} total={total} onPageChange={onPageChange} />
        </div>
    )
}
