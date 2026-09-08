'use client'

import { useCallback, useEffect, useState, useRef } from 'react'
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
import { usePanelRequest, PanelRequestError } from '@/hooks/usePanelRequest'
import { PanelLoadError } from '@/components/ui/PanelLoadError'
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
    const { t } = useTranslation()
    const { t: tableText } = useTranslation()
    const { data: session, status } = useSession()
    const router = useRouter()
    const { dir } = useTranslation()
    const { run, loading, error, cancel } = usePanelRequest()
    const mutationPending = useRef(false)
    const refreshing = loading
    const [resettingAccountId, setResettingAccountId] = useState<string | null>(null)
    const [threshold, setThreshold] = useState(DEFAULT_BEIN_LOGIN_FAILURE_THRESHOLD)
    const [accounts, setAccounts] = useState<LoginFailureAccount[]>([])

    useEffect(() => {
        document.title = 'beIN Login Failures | Desh Panel'
    }, [])

    const fetchAccounts = useCallback(async () => {
        setAccounts([])
        await run(async signal => {
            const response = await fetch('/api/admin/bein-accounts/login-failures', {signal, cache: 'no-store'})
            if (!response.ok) throw new PanelRequestError(response.status)
            const body = await response.json() as LoginFailuresResponse
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

    const handleReset = async (accountId: string) => {
        if (mutationPending.current) return
        mutationPending.current = true
        setResettingAccountId(accountId)

        try {
            const res = await fetch(`/api/admin/bein-accounts/${accountId}/login-failures/reset`, {
                method: 'POST'
            })
            const data = await res.json()

            if (!res.ok || !data.success) {
                throw new Error(data.error || t.panelUi.reportCopy.resetTrackingFailed)
            }

            toast.success(data.message || t.panelUi.reportCopy.resetTrackingSuccess)
            await fetchAccounts()
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : t.panelUi.reportCopy.resetTrackingFailed
            toast.error(message)
        } finally {
            mutationPending.current = false
            setResettingAccountId(null)
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
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-red-500 shadow-lg">
                        <KeyRound className="h-6 w-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">{t.panelUi.reportCopy.loginFailures}</h1>
                        <p className="text-sm text-muted-foreground">
                            {t.panelUi.reportCopy.loginFailuresHint}
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
                            <AlertTriangle className="h-5 w-5 text-amber-500" />
                            {t.panelUi.reportCopy.currentThreshold}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-foreground">{threshold}</div>
                        <p className="mt-2 text-sm text-muted-foreground">
                            {t.panelUi.reportCopy.loginThresholdHint}
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">{t.panelUi.reportCopy.flaggedAccounts}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-foreground">{accounts.length}</div>
                        <p className="mt-2 text-sm text-muted-foreground">
                            {t.panelUi.reportCopy.resetTrackingHint}
                        </p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>{t.panelUi.reportCopy.passwordReview}</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table panel density="compact">
                        <TableHeader>
                            <TableRow>
                                <TableHead>{tableText.adminBeinAccounts.table.account}</TableHead>
                                <TableHead className="text-center">{tableText.panelTable.failedLogins}</TableHead>
                                <TableHead className="text-center">{tableText.panelTable.lastFailedLogin}</TableHead>
                                <TableHead>{tableText.panelTable.failureReason}</TableHead>
                                <TableHead className="text-center">{tableText.common.status}</TableHead>
                                <TableHead className="text-center">{tableText.admin.logs.table.action}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {accounts.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                                        {t.panelUi.reportCopy.noLoginFailures}
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
                                                title={account.lastLoginFailureReason || t.panelUi.reportCopy.noFailureReason}
                                            >
                                                {account.lastLoginFailureReason || t.panelUi.reportCopy.noFailureReason}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <Badge variant={account.needsPasswordUpdate ? 'destructive' : 'secondary'}>
                                                {account.needsPasswordUpdate ? t.panelUi.reportCopy.needsPassword : t.panelUi.reportCopy.belowThreshold}
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
                                                <span>{t.panelUi.reportCopy.resetTracking}</span>
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
