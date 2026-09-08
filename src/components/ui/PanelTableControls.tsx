'use client'
import type { ReactNode } from 'react'
import { TableHead } from './table'
import { useTranslation } from '@/hooks/useTranslation'

export function SortableTableHead({ children, className, direction, onSort }: {
    children: ReactNode; className?: string; direction?: 'asc' | 'desc'; onSort: () => void
}) {
    return <TableHead className={className} aria-sort={direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none'}>
        <button type="button" className="w-full text-start focus-visible:outline focus-visible:outline-2" onClick={onSort}>{children}</button>
    </TableHead>
}

export function PanelTablePagination({ page, total, pageSize = 10, onPageChange }: {
    page: number; total: number; pageSize?: number; onPageChange: (page: number) => void
}) {
    const { t } = useTranslation()
    const pages = Math.max(1, Math.ceil(total / pageSize))
    const start = total === 0 ? 0 : (page - 1) * pageSize + 1
    return <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 border-t border-border">
        <p className="text-sm text-muted-foreground">{t.transactions.showingRange.replace('{start}', String(start)).replace('{end}', String(Math.min(page * pageSize, total))).replace('{total}', String(total))}</p>
        <div className="flex items-center gap-3">
            <button type="button" disabled={page <= 1} className="p-2 rounded border border-border disabled:opacity-50" onClick={() => onPageChange(page - 1)}>{t.pagination.previous}</button>
            <span className="text-sm" dir="ltr">{page} / {pages}</span>
            <button type="button" disabled={page >= pages} className="p-2 rounded border border-border disabled:opacity-50" onClick={() => onPageChange(page + 1)}>{t.pagination.next}</button>
        </div>
    </div>
}
