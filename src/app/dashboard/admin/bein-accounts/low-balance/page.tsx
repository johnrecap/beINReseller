'use client'

import { useCallback, useEffect, useState } from 'react'
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

export default function BeinLowBalancePage() {
    const { data: session, status } = useSession()
    const router = useRouter()
    const { dir } = useTranslation()
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    const [reactivatingId, setReactivatingId] = useState<string | null>(null)
    const [threshold, setThreshold] = useState(300)
    const [accounts, setAccounts] = useState<LowBalanceAccount[]>([])

    useEffect(() => {
        document.title = 'beIN Low Balance | Desh Panel'
    }, [])

    const fetchAccounts = useCallback(async (options?: { silent?: boolean }) => {
        if (options?.silent) {
            setRefreshing(true)
        } else {
            setLoading(true)
        }

        try {
            const res = await fetch('/api/admin/bein-accounts/low-balance')
            const data = await res.json() as LowBalanceResponse

            if (!res.ok || !data.success) {
                throw new Error((data as { error?: string }).error || 'Failed to load low balance accounts')
            }

            setThreshold(data.threshold)
            setAccounts(data.accounts)
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Failed to load low balance accounts'
            toast.error(message)
        } finally {
            setLoading(false)
            setRefreshing(false)
        }
    }, [])

    useEffect(() => {
        if (status === 'authenticated') {
            if (session?.user?.role !== 'ADMIN') {
                router.push('/dashboard')
                return
            }

            fetchAccounts()
        }
    }, [fetchAccounts, router, session, status])

    const handleReactivate = async (accountId: string) => {
        setReactivatingId(accountId)

        try {
            const res = await fetch(`/api/admin/bein-accounts/${accountId}/low-balance/reactivate`, {
                method: 'POST'
            })
            const data = await res.json()

            if (!res.ok || !data.success) {
                throw new Error(data.error || 'Failed to reactivate account')
            }

            toast.success(data.message || 'Account reactivated successfully')
            await fetchAccounts({ silent: true })
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Failed to reactivate account'
            toast.error(message)
        } finally {
            setReactivatingId(null)
        }
    }

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
                        <h1 className="text-2xl font-bold text-foreground">beIN Low Balance</h1>
                        <p className="text-sm text-muted-foreground">
                            Accounts auto-disabled because their dealer balance dropped below the threshold.
                        </p>
                    </div>
                </div>

                <Button variant="outline" onClick={() => fetchAccounts({ silent: true })} disabled={refreshing}>
                    {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    <span>Refresh</span>
                </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <DollarSign className="h-5 w-5 text-orange-500" />
                            Balance threshold
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-foreground">{threshold} USD</div>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Accounts with balance below this amount are auto-disabled.
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Disabled accounts</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-foreground">{accounts.length}</div>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Top up the balance on beIN, then reactivate.
                        </p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Accounts needing balance top-up</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Account</TableHead>
                                <TableHead className="text-center">Dealer Balance</TableHead>
                                <TableHead className="text-center">Last Updated</TableHead>
                                <TableHead className="text-center">Status</TableHead>
                                <TableHead className="text-center">Action</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {accounts.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                                        No accounts disabled for low balance.
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
                                                Disabled - Low balance
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
                                                <span>Reactivate</span>
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
