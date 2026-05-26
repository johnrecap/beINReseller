'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { AlertTriangle, KeyRound, Loader2, RefreshCw, RotateCcw } from 'lucide-react'
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
import { DEFAULT_BEIN_LOGIN_FAILURE_THRESHOLD } from '@/lib/bein-login-failure-threshold'

interface LoginFailureAccount {
    id: string
    username: string
    label: string | null
    consecutiveLoginFailures: number
    lastLoginAttemptAt: string | null
    lastLoginFailureAt: string | null
    lastLoginFailureReason: string | null
    lastSuccessfulLoginAt: string | null
    needsPasswordUpdate: boolean
}

interface LoginFailuresResponse {
    success: boolean
    threshold: number
    accounts: LoginFailureAccount[]
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

export default function LoginMonitorPanel() {
    const { data: session, status } = useSession()
    const router = useRouter()
    const { dir } = useTranslation()
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    const [resettingAccountId, setResettingAccountId] = useState<string | null>(null)
    const [threshold, setThreshold] = useState(DEFAULT_BEIN_LOGIN_FAILURE_THRESHOLD)
    const [accounts, setAccounts] = useState<LoginFailureAccount[]>([])

    useEffect(() => {
        document.title = 'beIN Login Failures | Desh Panel'
    }, [])

    const fetchAccounts = useCallback(async (options?: { silent?: boolean }) => {
        if (options?.silent) {
            setRefreshing(true)
        } else {
            setLoading(true)
        }

        try {
            const res = await fetch('/api/admin/bein-accounts/login-failures')
            const data = await res.json() as LoginFailuresResponse

            if (!res.ok || !data.success) {
                throw new Error((data as { error?: string }).error || 'Failed to load beIN login failures')
            }

            setThreshold(data.threshold)
            setAccounts(data.accounts)
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Failed to load beIN login failures'
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

    const handleReset = async (accountId: string) => {
        setResettingAccountId(accountId)

        try {
            const res = await fetch(`/api/admin/bein-accounts/${accountId}/login-failures/reset`, {
                method: 'POST'
            })
            const data = await res.json()

            if (!res.ok || !data.success) {
                throw new Error(data.error || 'Failed to reset beIN login tracking')
            }

            toast.success(data.message || 'beIN login tracking reset successfully')
            await fetchAccounts({ silent: true })
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Failed to reset beIN login tracking'
            toast.error(message)
        } finally {
            setResettingAccountId(null)
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
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-red-500 shadow-lg">
                        <KeyRound className="h-6 w-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">beIN login failures</h1>
                        <p className="text-sm text-muted-foreground">
                            Accounts listed here reached the current failed-login threshold and likely need a password update.
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
                            <AlertTriangle className="h-5 w-5 text-amber-500" />
                            Current threshold
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-foreground">{threshold}</div>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Consecutive failed beIN logins before the account is flagged.
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Flagged accounts</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-foreground">{accounts.length}</div>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Reset the tracking after updating the password in beIN.
                        </p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Accounts requiring password review</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Account</TableHead>
                                <TableHead className="text-center">Failed logins</TableHead>
                                <TableHead className="text-center">Last failed login</TableHead>
                                <TableHead>Failure reason</TableHead>
                                <TableHead className="text-center">Status</TableHead>
                                <TableHead className="text-center">Action</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {accounts.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                                        No accounts crossed the current login failure threshold.
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
                                        <TableCell className="text-center font-semibold">
                                            {account.consecutiveLoginFailures}
                                        </TableCell>
                                        <TableCell className="text-center text-sm text-muted-foreground">
                                            {formatDateTime(account.lastLoginFailureAt)}
                                        </TableCell>
                                        <TableCell>
                                            <div
                                                className="max-w-[320px] truncate text-sm text-muted-foreground"
                                                title={account.lastLoginFailureReason || 'No failure reason saved'}
                                            >
                                                {account.lastLoginFailureReason || 'No failure reason saved'}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <Badge variant={account.needsPasswordUpdate ? 'destructive' : 'secondary'}>
                                                {account.needsPasswordUpdate ? 'Needs password update' : 'Below threshold'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleReset(account.id)}
                                                disabled={resettingAccountId === account.id}
                                            >
                                                {resettingAccountId === account.id ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    <RotateCcw className="h-4 w-4" />
                                                )}
                                                <span>Reset login tracking</span>
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
