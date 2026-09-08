'use client'

import { useCallback, useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { DollarSign, Loader2, RefreshCw, Power } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { usePanelRequest, PanelRequestError } from '@/hooks/usePanelRequest'
import { PanelLoadError } from '@/components/ui/PanelLoadError'
import { useTranslation } from '@/hooks/useTranslation'

interface LowBalanceAccount {
    id: string
    username: string
    label: string | null
    isActive: boolean
    dealerBalance: number | null
    balanceUpdatedAt: string | null
    lowBalanceAlertEnabled: boolean
}

interface LowBalanceResponse {
    success: boolean
    threshold: number
    accounts: LowBalanceAccount[]
}

function formatDateTime(value: string | null) {
    if (!value) return 'Never'

    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return 'Invalid date'

    return new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(date)
}

export default function BalanceMonitorPanel() {
    const { t } = useTranslation()
    const { t: tableText } = useTranslation()
    const { data: session, status } = useSession()
    const router = useRouter()
    const { dir } = useTranslation()
    const { run, loading, error, cancel } = usePanelRequest()
    const mutationPending = useRef(false)
    const refreshing = loading
    const [reactivatingId, setReactivatingId] = useState<string | null>(null)
    const [threshold, setThreshold] = useState(300)
    const [accounts, setAccounts] = useState<LowBalanceAccount[]>([])

    useEffect(() => {
        document.title = 'beIN Low Balance | Desh Panel'
    }, [])

    const fetchAccounts = useCallback(async () => {
        setAccounts([])
        await run(async signal => {
            const response = await fetch('/api/admin/bein-accounts/low-balance', {signal, cache: 'no-store'})
            if (!response.ok) throw new PanelRequestError(response.status)
            const body = await response.json() as LowBalanceResponse
            if (!body.success) throw new PanelRequestError(0)
            return body
        }, data => { setThreshold(data.threshold); setAccounts(data.accounts) })
    }, [run])

    useEffect(() => {
        if (status === 'authenticated') {
            if (session?.user?.role !== 'ADMIN') {
                router.push('/dashboard')
                return
            }

            const timer = setTimeout(() => void fetchAccounts(), 0)
            return () => { clearTimeout(timer); cancel() }
        }
    }, [fetchAccounts, cancel, router, session, status])

    const handleReactivate = async (accountId: string) => {
        if (mutationPending.current) return
        mutationPending.current = true
        setReactivatingId(accountId)

        try {
            const res = await fetch(`/api/admin/bein-accounts/${accountId}/low-balance/reactivate`, {
                method: 'POST'
            })
            const data = await res.json()

            if (!res.ok || !data.success) {
                throw new Error(data.error || t.panelUi.reportCopy.reactivateFailed)
            }

            toast.success(data.message || t.panelUi.reportCopy.reactivateSuccess)
            await fetchAccounts()
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : t.panelUi.reportCopy.reactivateFailed
            toast.error(message)
        } finally {
            mutationPending.current = false
            setReactivatingId(null)
        }
    }

    if (error !== null) return <PanelLoadError status={error} retry={() => void fetchAccounts()} />

    if (status === 'loading' || loading) {
        return (
            <div className="flex min-h-[400px] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        )
    }

    return (
        <div className="space-y-6 p-6" dir={dir}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-yellow-500 shadow-lg">
                        <DollarSign className="h-6 w-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">{t.panelUi.reportCopy.lowBalance}</h1>
                        <p className="text-sm text-muted-foreground">
                            {t.panelUi.reportCopy.lowBalanceHint}
                        </p>
                    </div>
                </div>

                <Button variant="outline" onClick={() => fetchAccounts()} disabled={refreshing}>
                    {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    <span>{t.common.refresh}</span>
                </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <DollarSign className="h-5 w-5 text-orange-500" />
                            {t.panelUi.reportCopy.balanceThreshold}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-foreground">{threshold} USD</div>
                        <p className="mt-2 text-sm text-muted-foreground">
                            {t.panelUi.reportCopy.balanceThresholdHint}
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">{t.panelUi.reportCopy.disabledAccounts}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-foreground">{accounts.length}</div>
                        <p className="mt-2 text-sm text-muted-foreground">
                            {t.panelUi.reportCopy.reactivateHint}
                        </p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>{t.panelUi.reportCopy.topUpAccounts}</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table panel density="compact">
                        <TableHeader>
                            <TableRow>
                                <TableHead>{tableText.adminBeinAccounts.table.account}</TableHead>
                                <TableHead className="text-center">{tableText.panelTable.dealerBalance}</TableHead>
                                <TableHead className="text-center">{tableText.panelTable.lastUpdated}</TableHead>
                                <TableHead className="text-center">{tableText.common.status}</TableHead>
                                <TableHead className="text-center">{tableText.admin.logs.table.action}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {accounts.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                                        {t.panelUi.reportCopy.noLowBalance}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                accounts.map((account) => (
                                    <TableRow key={account.id}>
                                        <TableCell>
                                            <div>
                                                <div className="font-medium text-foreground">{account.label || account.username}</div>
                                                {account.label && (
                                                    <div className="text-sm text-muted-foreground">{account.username}</div>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <span className="font-semibold text-red-500">
                                                {account.dealerBalance !== null ? `${account.dealerBalance} USD` : 'Unknown'}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-center text-sm text-muted-foreground">
                                            {formatDateTime(account.balanceUpdatedAt)}
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <Badge variant="destructive">
                                                {t.panelUi.reportCopy.disabledLowBalance}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleReactivate(account.id)}
                                                disabled={reactivatingId === account.id}
                                            >
                                                {reactivatingId === account.id ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    <Power className="h-4 w-4" />
                                                )}
                                                <span>{t.panelUi.reportCopy.reactivate}</span>
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    )
}
