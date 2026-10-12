'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */

import { PanelDialog } from '@/components/ui/dialog'
import { Table, TableBody, TableRow, TableCell, TableHeader, TableHead } from '@/components/ui/table'
import { useState, useEffect, useRef, useCallback } from 'react'
import { usePanelRequest, readPanelJson, PanelRequestError } from '@/hooks/usePanelRequest'
import { PanelLoadError } from '@/components/ui/PanelLoadError'
import { withRequestDeadline } from '@/lib/request-deadline'
import { useTranslation } from '@/hooks/useTranslation'
import { useBalance } from '@/hooks/useBalance'
import { Loader2, CreditCard, CheckCircle, XCircle, Clock, AlertTriangle, DollarSign, Package, User, ShieldCheck } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

interface InstallmentInfo {
    package: string
    monthsToPay: string
    installment1: number
    installment2: number
    contractStartDate: string
    contractExpiryDate: string
    invoicePrice: number
    dealerPrice: number
}

interface SubscriberInfo {
    name: string
    email: string
    mobile: string
    city: string
    country: string
    homeTel: string
    workTel: string
    fax: string
    stbModel: string
    address: string
    remarks: string
}

type FlowStep = 'input' | 'loading' | 'details' | 'confirming' | 'success' | 'error' | 'no-installment' | 'attention'

// Installment Confirm Dialog - Modal matching FinalConfirmDialog design from Active Operations page
function InstallmentConfirmDialog({
    installment,
    cardNumber,
    balance,
    confirmExpiry,
    onConfirm,
    onClose,
    onExpire,
    isLoading,
    error,
    t
}: {
    installment: InstallmentInfo
    cardNumber: string
    balance: number
    confirmExpiry: string
    onConfirm: () => void
    onClose: () => void
    onExpire: () => void
    isLoading: boolean
    error: string | null
    t: any
}) {
    const inst = t.installment || {}
    const [timeLeft, setTimeLeft] = useState<number>(0)
    const [showWarning, setShowWarning] = useState(false)
    const hasWarned = useRef(false)
    const hasExpired = useRef(false)
    const WARNING_THRESHOLD = 10

    useEffect(() => {
        if (!confirmExpiry) return

        hasWarned.current = false
        hasExpired.current = false

        const updateTimer = () => {
            const expiry = new Date(confirmExpiry).getTime()
            const now = Date.now()
            const diff = Math.max(0, Math.floor((expiry - now) / 1000))
            setTimeLeft(diff)

            if (diff <= WARNING_THRESHOLD && diff > 0 && !hasWarned.current) {
                hasWarned.current = true
                setShowWarning(true)
            }

            if (diff <= 0 && !hasExpired.current) {
                hasExpired.current = true
                onExpire()
            }
        }

        updateTimer()
        const interval = setInterval(updateTimer, 1000)
        return () => {
            clearInterval(interval)
            setShowWarning(false)
        }
    }, [confirmExpiry, onExpire])

    const isWarning = timeLeft <= WARNING_THRESHOLD && timeLeft > 0
    const insufficientBalance = balance < installment.dealerPrice

    return (
        <PanelDialog onClose={onClose} busy={isLoading} title={<>{inst.confirmTitle}</>} className="max-w-md">
            <div className="bg-card rounded-2xl shadow-2xl max-w-md w-full animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="bg-gradient-to-r from-orange-500 to-orange-600 p-6 text-white">
                    <div className="flex items-center gap-3">
                        <div className="bg-white/20 p-2 rounded-lg backdrop-blur-md">
                            <ShieldCheck className="w-8 h-8" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold">{inst.confirmTitle}</h2>
                            <p className="text-orange-100 text-sm">{inst.confirmMessage}</p>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6 space-y-4">
                    {/* Info */}
                    <div className="bg-muted/30 rounded-xl p-4 space-y-3 border border-border">
                        <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">{inst.packageLabel}:</span>
                            <span className="font-bold text-foreground">{installment.package || inst.notSpecified}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">{inst.priceLabel}:</span>
                            <span className="font-bold text-[#00A651]">USD {installment.dealerPrice}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">{inst.monthsToPay}:</span>
                            <span className="font-mono text-sm">{installment.monthsToPay || '-'}</span>
                        </div>
                        <div className="flex justify-between items-center border-t border-border pt-2 mt-2">
                            <span className="text-muted-foreground">{inst.cardLabel}:</span>
                            <span className="font-mono text-sm bg-muted px-2 py-0.5 rounded">{cardNumber}</span>
                        </div>
                    </div>

                    {/* Balance */}
                    <div className="flex justify-between items-center text-sm px-1">
                        <span className="text-muted-foreground">{inst.yourBalance}:</span>
                        <span className={insufficientBalance ? 'text-red-600 font-bold' : 'text-green-600 font-bold'}>
                            USD {balance}
                        </span>
                    </div>

                    {/* Insufficient Balance Warning */}
                    {insufficientBalance && (
                        <div className="flex items-center justify-center gap-2 p-3 bg-red-500/10 rounded-xl border border-red-500/30">
                            <AlertTriangle className="w-5 h-5 text-red-500" />
                            <span className="text-sm font-bold text-red-500">{inst.insufficientBalance}</span>
                        </div>
                    )}

                    {/* Timer */}
                    {timeLeft > 0 && (
                        <div className={`flex items-center justify-center gap-2 py-2 ${isWarning ? 'text-[#ED1C24] animate-pulse font-bold' : 'text-[#F59E0B]'}`}>
                            <Clock className="w-5 h-5" />
                            <span className="text-lg font-mono">
                                {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
                            </span>
                        </div>
                    )}

                    {/* Expiry Warning */}
                    {showWarning && (
                        <div className="flex items-center justify-center gap-2 p-3 bg-[#ED1C24]/10 rounded-xl border border-[#ED1C24]/30 animate-pulse">
                            <AlertTriangle className="w-5 h-5 text-[#ED1C24]" />
                            <span className="text-sm font-bold text-[#ED1C24]">
                                {inst.expiryWarning}
                            </span>
                        </div>
                    )}

                    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

                    {/* Actions */}
                    <div className="flex gap-3 pt-2">
                        <button
                            onClick={onClose}
                            disabled={isLoading}
                            className="flex-1 px-4 py-3 bg-muted hover:bg-muted/80 text-foreground rounded-xl font-medium transition-colors disabled:opacity-50"
                        >
                            {inst.cancel}
                        </button>
                        <button
                            onClick={onConfirm}
                            disabled={isLoading || insufficientBalance || timeLeft <= 0}
                            className="flex-1 px-4 py-3 bg-[#00A651] hover:bg-[#008f45] text-white rounded-xl font-medium transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-green-500/20"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    {inst.confirming}
                                </>
                            ) : (
                                <>
                                    <CheckCircle className="w-4 h-4" />
                                    {inst.payNow}
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </PanelDialog>
    )
}

/**
 * InstallmentPaymentFlow - Flow for paying monthly installments
 * Step 1: Enter card number -> Load installment details
 * Step 2: Show details with Pay button -> Confirm with timer
 * Step 3: Execute payment -> Show result
 */
export function InstallmentPaymentFlow() {
    const { t, language } = useTranslation()
    const tableText = t
    const { balance, refetch: refetchBalance } = useBalance()
    const inst = t.installment

    const [step, setStep] = useState<FlowStep>('input')
    const [cardNumber, setCardNumber] = useState('')
    const [operationId, setOperationId] = useState<string | null>(null)
    const [installment, setInstallment] = useState<InstallmentInfo | null>(null)
    const [subscriber, setSubscriber] = useState<SubscriberInfo | null>(null)
    const [errorKey, setError] = useState<'reviewRequired' | 'installmentFollowUp' | 'existingOperation' | 'sessionExpired' | 'accessDenied' | 'startFailed' | 'installmentUnconfirmed' | null>(null)
    const messages = { ...inst, ...t.panelUi }
    const error = errorKey ? messages[errorKey] : null
    const [confirmExpiry, setConfirmExpiry] = useState<string | null>(null)
    const [timeLeft, setTimeLeft] = useState<number>(60)
    const [isConfirmLoading, setIsConfirmLoading] = useState(false)
    const [showConfirmDialog, setShowConfirmDialog] = useState(false)
    const mutationPending = useRef(false)
    const [confirmErrorKey, setConfirmError] = useState<'sessionExpired' | 'accessDenied' | 'confirmFailed' | null>(null)
    const confirmError = confirmErrorKey ? messages[confirmErrorKey] : null
    const [pollRevision, setPollRevision] = useState(0)
    const { run, error: readError, cancel: cancelRead } = usePanelRequest()
    const expireConfirmation = useCallback(() => {
        if (!mutationPending.current) setShowConfirmDialog(false)
    }, [])

    // The local countdown controls confirmation availability, never server settlement.
    useEffect(() => {
        if (!confirmExpiry || step !== 'details') return

        const updateTimer = () => {
            const expiryTime = new Date(confirmExpiry).getTime()
            const now = Date.now()
            const diff = Math.max(0, Math.floor((expiryTime - now) / 1000))
            setTimeLeft(diff)
        }

        updateTimer()
        const interval = setInterval(updateTimer, 1000)
        return () => clearInterval(interval)
    }, [confirmExpiry, step])

    // Read ownership stays with the server. A local timeout never proves cancellation or refund.
    useEffect(() => {
        if (step === 'details' && timeLeft <= 0) expireConfirmation()
    }, [step, timeLeft, expireConfirmation])

    useEffect(() => {
        if (!operationId || !['loading', 'details', 'confirming'].includes(step)) return
        let stopped = false
        let timer: ReturnType<typeof setTimeout> | undefined
        const poll = async () => {
            let accepted = false
            await run(signal => readPanelJson<{
                status: string; installment?: InstallmentInfo; subscriber?: SubscriberInfo;
                finalConfirmExpiry?: string; message?: string;
            }>(`/api/operations/${operationId}/installment`, signal), data => {
                if (mutationPending.current) { accepted = true; return }
                if (data.status === 'AWAITING_FINAL_CONFIRM') {
                    if (!data.installment || !Number.isFinite(data.installment.dealerPrice) ||
                        data.installment.dealerPrice <= 0 || !data.finalConfirmExpiry ||
                        !Number.isFinite(Date.parse(data.finalConfirmExpiry))) throw new PanelRequestError(0)
                    setInstallment(data.installment)
                    setSubscriber(data.subscriber || null)
                    setConfirmExpiry(data.finalConfirmExpiry)
                    if (step !== 'confirming') setStep('details')
                } else if (data.status === 'COMPLETED') {
                    setShowConfirmDialog(false)
                    const noInstallment = data.message?.includes('No installments') || data.message?.includes('لا توجد أقساط')
                    setStep(noInstallment ? 'no-installment' : 'success')
                    void refetchBalance()
                } else if (['PENDING', 'PROCESSING', 'COMPLETING'].includes(data.status)) {
                    setShowConfirmDialog(false)
                    if (step === 'details') setStep('confirming')
                } else {
                    setShowConfirmDialog(false)
                    setError(data.status === 'REVIEW_REQUIRED' ? 'reviewRequired' : 'installmentFollowUp')
                    setStep('attention')
                }
                accepted = true
            })
            // Failed reads stop until an explicit read-only retry. Slow requests never overlap.
            if (!stopped && accepted) timer = setTimeout(poll, 2000)
        }
        void poll()
        return () => { stopped = true; clearTimeout(timer); cancelRead() }
    }, [operationId, step, pollRevision, run, cancelRead, refetchBalance, inst.success, t.panelUi.reviewRequired, t.panelUi.installmentFollowUp])

    useEffect(() => {
        if (readError !== null) setShowConfirmDialog(false)
    }, [readError])

    // Start loading installment
    const handleStart = async () => {
        if (mutationPending.current) return
        if (cardNumber.length < 10) {
            toast.error(inst.cardError)
            return
        }

        mutationPending.current = true
        setError(null)
        setStep('loading')

        try {
            const { res, data } = await withRequestDeadline(async signal => {
                const res = await fetch('/api/operations/start-installment', {
                    method: 'POST', signal,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ cardNumber })
                })
                return { res, data: await res.json() }
            })

            if (!res.ok) {
                if (data.operationId) {
                    toast.error(inst.existingOperation, {
                        action: {
                            label: inst.goToOperations,
                            onClick: () => {
                                window.location.href = '/dashboard/operations/active'
                            }
                        }
                    })
                    setOperationId(data.operationId)
                    setError('existingOperation')
                    setStep('attention')
                    return
                }
                if (res.status >= 500) throw new Error('UNCONFIRMED_COMMAND')
                setError(res.status === 401 ? 'sessionExpired' : res.status === 403 ? 'accessDenied' : 'startFailed')
                setStep('error')
                return
            }

            if (typeof data.operationId !== 'string' || !data.operationId) throw new Error('UNCONFIRMED_COMMAND')
            setOperationId(data.operationId)
            toast.success(inst.loadingInstallment)
        } catch {
            setError('installmentUnconfirmed')
            setStep('attention')
        } finally {
            mutationPending.current = false
        }
    }

    // Submit once locally; uncertain transport results are followed through the existing operation.
    const handleConfirm = async () => {
        if (!operationId || mutationPending.current || readError !== null || !confirmExpiry ||
            Date.parse(confirmExpiry) <= Date.now()) return
        if (!installment || balance < installment.dealerPrice) {
            toast.error(inst.insufficientBalance)
            return
        }
        mutationPending.current = true
        cancelRead()
        setConfirmError(null)
        setIsConfirmLoading(true)
        try {
            const res = await withRequestDeadline(signal => fetch(`/api/operations/${operationId}/confirm-installment`, {
                method: 'POST', signal
            }))
            if (!res.ok) {
                if (res.status >= 500) throw new Error('UNCONFIRMED_COMMAND')
                setConfirmError(res.status === 401 ? 'sessionExpired' : res.status === 403 ? 'accessDenied' : 'confirmFailed')
                return
            }
            setShowConfirmDialog(false)
            setStep('confirming')
            toast.success(inst.processingPayment)
        } catch {
            setShowConfirmDialog(false)
            setError('installmentUnconfirmed')
            setStep('attention')
        } finally {
            mutationPending.current = false
            setIsConfirmLoading(false)
            setPollRevision(value => value + 1)
        }
    }

    // Reset flow
    const handleReset = () => {
        setStep('input')
        setCardNumber('')
        setOperationId(null)
        setInstallment(null)
        setSubscriber(null)
        setError(null)
        setConfirmExpiry(null)
        setShowConfirmDialog(false)
        setConfirmError(null)
    }

    return (
        <div className="max-w-2xl mx-auto space-y-6" dir={language === 'ar' ? 'rtl' : 'ltr'}>
            {/* Installment Confirm Dialog */}
            {showConfirmDialog && readError === null && installment && confirmExpiry && (
                <InstallmentConfirmDialog
                    installment={installment}
                    cardNumber={cardNumber}
                    balance={balance}
                    confirmExpiry={confirmExpiry}
                    onConfirm={handleConfirm}
                    onClose={() => { if (!mutationPending.current) setShowConfirmDialog(false) }}
                    onExpire={expireConfirmation}
                    error={confirmError}
                    isLoading={isConfirmLoading}
                    t={t}
                />
            )}
            {operationId && <a href="/dashboard/operations/active" className="inline-block underline">{t.panelUi.viewActive}</a>}
            {readError !== null && <PanelLoadError status={readError} retry={() => setPollRevision(value => value + 1)} />}
            {readError === null && <>
            {step === 'details' && timeLeft <= 0 && <p role="status" className="rounded-xl border border-border p-4">{t.panelUi.installmentExpired}</p>}
            {/* Input Step */}
            {step === 'input' && (
                <Card className="bg-[var(--color-bg-card)] border-[var(--color-border-default)] shadow-[var(--shadow-card)]">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <DollarSign className="h-5 w-5 text-[#00A651]" />
                            {inst.title}
                        </CardTitle>
                        <CardDescription>
                            {inst.description}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <Label htmlFor="installmentCard">{inst.cardLabel}</Label>
                            <Input
                                id="installmentCard"
                                type="text"
                                value={cardNumber}
                                onChange={(e) => setCardNumber(e.target.value.replace(/\D/g, '').slice(0, 16))}
                                placeholder="7517663273"
                                className="mt-2 text-left font-mono text-lg tracking-wider"
                                dir="ltr"
                            />
                            {cardNumber && cardNumber.length < 10 && (
                                <p className="text-xs text-red-500 mt-1">
                                    {inst.cardError}
                                </p>
                            )}
                        </div>
                        <Button
                            onClick={handleStart}
                            disabled={cardNumber.length < 10}
                            className="w-full bg-[#00A651] hover:bg-[#008f45]"
                        >
                            <CreditCard className="h-4 w-4 ml-2" />
                            {inst.loadButton}
                        </Button>
                    </CardContent>
                </Card>
            )
            }

            {/* Loading Step */}
            {
                step === 'loading' && (
                    <Card className="bg-[var(--color-bg-card)] border-[var(--color-border-default)] shadow-[var(--shadow-card)]">
                        <CardContent className="py-12 text-center">
                            <Loader2 className="h-12 w-12 animate-spin text-[#00A651] mx-auto mb-4" />
                            <h3 className="text-xl font-semibold mb-2">
                                {inst.loadingTitle}
                            </h3>
                            <p className="text-muted-foreground">
                                {inst.loadingDescription}
                            </p>
                        </CardContent>
                    </Card>
                )
            }

            {/* Details Step - Show installment info with timer (beIN-style table) */}
            {
                step === 'details' && installment && (
                    <div className="space-y-4">
                        {/* beIN-style Purple Header Bar — "Contract Information" + Timer + Pay Button */}
                        <div
                            className="flex flex-wrap items-center justify-between gap-3 rounded-t-xl px-5 py-3"
                            style={{ background: 'linear-gradient(135deg, #602D92 0%, #7B3FA8 50%, #964DA7 100%)' }}
                        >
                            <span className="text-white font-bold text-base tracking-wide flex items-center gap-2">
                                <Package className="h-5 w-5" />
                                {inst.contractInfo}
                            </span>
                            <div className="flex flex-wrap items-center gap-3">
                                {/* Timer */}
                                <span className={`flex items-center gap-1 text-sm font-mono font-bold px-3 py-1 rounded-full ${timeLeft <= 10
                                    ? 'bg-red-500/20 text-red-300 animate-pulse'
                                    : 'bg-white/15 text-white/90'
                                    }`}>
                                    <Clock className="h-3.5 w-3.5" />
                                    {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
                                </span>
                                {/* Pay Installment Button */}
                                <Button
                                    onClick={() => { setConfirmError(null); setShowConfirmDialog(true) }}
                                    disabled={timeLeft <= 0 || isConfirmLoading}
                                    size="sm"
                                    className="bg-white/20 hover:bg-white/30 text-white border border-white/30 font-bold text-xs px-4 py-1.5 rounded-lg transition-all disabled:opacity-40"
                                >
                                    <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
                                    {inst.payInstallment}
                                </Button>
                            </div>
                        </div>

                        {/* Main Table — matches original beIN Sport table */}
                        <div data-panel-table-document className="border border-[#ccc] rounded-b-xl overflow-hidden bg-white" dir="ltr">
                            <Table panel density="compact" className="w-full text-sm border-collapse">
                                <TableBody>
                                    {/* Package Row */}
                                    <TableRow className="border-b border-[#ddd]">
                                        <TableCell className="px-4 py-2.5 bg-[#f0f0f0] text-[#333] font-semibold text-xs whitespace-nowrap border-r border-[#ddd] w-[140px]">
                                            {inst.packageLabel}:
                                        </TableCell>
                                        <TableCell className="px-4 py-2.5 text-[#333] font-medium" colSpan={3}>
                                            {installment.package}
                                        </TableCell>
                                    </TableRow>

                                    {/* Months To Pay Row */}
                                    <TableRow className="border-b border-[#ddd]">
                                        <TableCell className="px-4 py-2.5 bg-[#f0f0f0] text-[#333] font-semibold text-xs whitespace-nowrap border-r border-[#ddd]">
                                            {inst.monthsToPay}:
                                        </TableCell>
                                        <TableCell className="px-4 py-2.5" colSpan={3}>
                                            <span className="bg-[#e8e8e8] text-[#333] border border-[#ccc] px-3 py-1 rounded text-xs font-medium">
                                                {installment.monthsToPay}
                                            </span>
                                        </TableCell>
                                    </TableRow>

                                    {/* Installment Amounts Table — matching beIN grid */}
                                    <TableRow className="border-b border-[#ddd]">
                                        <TableCell className="px-4 py-2.5 bg-[#f0f0f0] text-[#333] font-semibold text-xs whitespace-nowrap border-r border-[#ddd] w-[140px] align-top">
                                            {inst.installmentAmount}:
                                        </TableCell>
                                        <TableCell className="p-0" colSpan={3}>
                                            <Table panel density="compact" className="w-full text-xs border-collapse">
                                                <TableHeader>
                                                    <TableRow className="bg-[#e8e8e8] border-b border-[#ddd]">
                                                        <TableHead className="px-4 py-1.5 text-[#333] font-semibold text-center border-r border-[#ddd]">{tableText.panelTable.installmentOne}</TableHead>
                                                        <TableHead className="px-4 py-1.5 text-[#333] font-semibold text-center">{tableText.panelTable.installmentTwo}</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    <TableRow>
                                                        <TableCell className="px-4 py-1.5 text-[#333] text-center border-r border-[#ddd] font-mono">{installment.installment1}</TableCell>
                                                        <TableCell className="px-4 py-1.5 text-[#333] text-center font-mono">{installment.installment2}</TableCell>
                                                    </TableRow>
                                                </TableBody>
                                            </Table>
                                        </TableCell>
                                    </TableRow>

                                    {/* Contract Dates & Prices — single row matching beIN */}
                                    <TableRow className="border-b border-[#ddd]">
                                        <TableCell className="px-4 py-2.5 bg-[#f0f0f0] text-[#333] font-semibold text-xs whitespace-nowrap border-r border-[#ddd]">
                                            {inst.contractStartDate}:
                                        </TableCell>
                                        <TableCell className="px-4 py-2.5 text-[#333] text-xs font-mono border-r border-[#ddd]">
                                            {installment.contractStartDate || '-'}
                                        </TableCell>
                                        <TableCell className="px-4 py-2.5 bg-[#f0f0f0] text-[#333] font-semibold text-xs whitespace-nowrap border-r border-[#ddd]">
                                            {inst.contractExpiryDate}:
                                        </TableCell>
                                        <TableCell className="px-4 py-2.5 text-[#333] text-xs font-mono">
                                            {installment.contractExpiryDate || '-'}
                                        </TableCell>
                                    </TableRow>
                                    <TableRow className="border-b border-[#ddd]">
                                        <TableCell className="px-4 py-2.5 bg-[#f0f0f0] text-[#333] font-semibold text-xs whitespace-nowrap border-r border-[#ddd]">
                                            {inst.invoicePrice}:
                                        </TableCell>
                                        <TableCell className="px-4 py-2.5 text-[#333] text-xs font-bold border-r border-[#ddd]">
                                            {installment.invoicePrice}
                                        </TableCell>
                                        <TableCell className="px-4 py-2.5 bg-[#f0f0f0] text-[#333] font-semibold text-xs whitespace-nowrap border-r border-[#ddd]">
                                            {inst.dealerPrice}:
                                        </TableCell>
                                        <TableCell className="px-4 py-2.5 text-xs font-bold text-[#00A651]">
                                            {installment.dealerPrice}
                                        </TableCell>
                                    </TableRow>

                                    {/* Subscriber Information Section */}
                                    <TableRow>
                                        <TableCell colSpan={4} className="p-0">
                                            {/* Section Header */}
                                            <div
                                                className="px-4 py-2 text-xs font-bold text-white/90 flex items-center gap-2 border-b border-[#ddd]"
                                                style={{ background: 'linear-gradient(135deg, #602D92 0%, #7B3FA8 100%)' }}
                                            >
                                                <User className="h-3.5 w-3.5" />
                                                {inst.subscriberInfo}
                                            </div>
                                            <Table panel density="compact" className="w-full text-xs border-collapse">
                                                <TableBody>
                                                    {/* Name | Email */}
                                                    <TableRow className="border-b border-[#ddd]">
                                                        <TableCell className="px-3 py-2 bg-[#f0f0f0] text-[#333] font-semibold whitespace-nowrap border-r border-[#ddd] w-[120px]">
                                                            {inst.subscriberName}:
                                                        </TableCell>
                                                        <TableCell className="px-3 py-2 text-[#333] border-r border-[#ddd]">
                                                            {subscriber?.name || '-'}
                                                        </TableCell>
                                                        <TableCell className="px-3 py-2 bg-[#f0f0f0] text-[#333] font-semibold whitespace-nowrap border-r border-[#ddd] w-[120px]">
                                                            {inst.subscriberEmail}:
                                                        </TableCell>
                                                        <TableCell className="px-3 py-2 text-[#333]">
                                                            {subscriber?.email || '-'}
                                                        </TableCell>
                                                    </TableRow>
                                                    {/* Mobile | City */}
                                                    <TableRow className="border-b border-[#ddd]">
                                                        <TableCell className="px-3 py-2 bg-[#f0f0f0] text-[#333] font-semibold whitespace-nowrap border-r border-[#ddd]">
                                                            {inst.mobile}:
                                                        </TableCell>
                                                        <TableCell className="px-3 py-2 text-[#333] font-mono border-r border-[#ddd]">
                                                            {subscriber?.mobile || '-'}
                                                        </TableCell>
                                                        <TableCell className="px-3 py-2 bg-[#f0f0f0] text-[#333] font-semibold whitespace-nowrap border-r border-[#ddd]">
                                                            {inst.city}:
                                                        </TableCell>
                                                        <TableCell className="px-3 py-2 text-[#333]">
                                                            {subscriber?.city || '-'}
                                                        </TableCell>
                                                    </TableRow>
                                                    {/* Country */}
                                                    <TableRow className="border-b border-[#ddd]">
                                                        <TableCell className="px-3 py-2 bg-[#f0f0f0] text-[#333] font-semibold whitespace-nowrap border-r border-[#ddd]">
                                                            {inst.country}:
                                                        </TableCell>
                                                        <TableCell className="px-3 py-2 text-[#333]" colSpan={3}>
                                                            {subscriber?.country || '-'}
                                                        </TableCell>
                                                    </TableRow>
                                                    {/* Home Tel | Work Tel */}
                                                    <TableRow className="border-b border-[#ddd]">
                                                        <TableCell className="px-3 py-2 bg-[#f0f0f0] text-[#333] font-semibold whitespace-nowrap border-r border-[#ddd]">
                                                            {inst.homeTel}:
                                                        </TableCell>
                                                        <TableCell className="px-3 py-2 text-[#333] font-mono border-r border-[#ddd]">
                                                            {subscriber?.homeTel || '-'}
                                                        </TableCell>
                                                        <TableCell className="px-3 py-2 bg-[#f0f0f0] text-[#333] font-semibold whitespace-nowrap border-r border-[#ddd]">
                                                            {inst.workTel}:
                                                        </TableCell>
                                                        <TableCell className="px-3 py-2 text-[#333] font-mono">
                                                            {subscriber?.workTel || '-'}
                                                        </TableCell>
                                                    </TableRow>
                                                    {/* Fax | STB Model */}
                                                    <TableRow className="border-b border-[#ddd]">
                                                        <TableCell className="px-3 py-2 bg-[#f0f0f0] text-[#333] font-semibold whitespace-nowrap border-r border-[#ddd]">
                                                            {inst.fax}:
                                                        </TableCell>
                                                        <TableCell className="px-3 py-2 text-[#333] font-mono border-r border-[#ddd]">
                                                            {subscriber?.fax || '-'}
                                                        </TableCell>
                                                        <TableCell className="px-3 py-2 bg-[#f0f0f0] text-[#333] font-semibold whitespace-nowrap border-r border-[#ddd]">
                                                            {inst.stbModel}:
                                                        </TableCell>
                                                        <TableCell className="px-3 py-2 text-[#333] font-mono">
                                                            {subscriber?.stbModel || '-'}
                                                        </TableCell>
                                                    </TableRow>
                                                    {/* Address | Remarks */}
                                                    <TableRow>
                                                        <TableCell className="px-3 py-2 bg-[#f0f0f0] text-[#333] font-semibold whitespace-nowrap border-r border-[#ddd] align-top">
                                                            {inst.address}:
                                                        </TableCell>
                                                        <TableCell className="px-3 py-2 text-[#333] border-r border-[#ddd] align-top">
                                                            {subscriber?.address || '-'}
                                                        </TableCell>
                                                        <TableCell className="px-3 py-2 bg-[#f0f0f0] text-[#333] font-semibold whitespace-nowrap border-r border-[#ddd] align-top">
                                                            {inst.remarks}:
                                                        </TableCell>
                                                        <TableCell className="px-3 py-2 text-[#333] align-top">
                                                            {subscriber?.remarks || '-'}
                                                        </TableCell>
                                                    </TableRow>
                                                </TableBody>
                                            </Table>
                                        </TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </div>

                        {/* Bottom Pay Button (mobile-friendly) */}
                        <div className="pt-1">
                            <Button
                                onClick={() => { setConfirmError(null); setShowConfirmDialog(true) }}
                                disabled={timeLeft <= 0 || isConfirmLoading}
                                className="w-full py-3 text-base font-bold text-white rounded-xl transition-all shadow-lg"
                                style={{ background: 'linear-gradient(135deg, #602D92 0%, #964DA7 100%)' }}
                            >
                                <CheckCircle className="h-5 w-5 ml-2" />
                                {inst.continueToPayment}
                            </Button>
                        </div>
                    </div>
                )
            }

            {/* Confirming Step */}
            {
                step === 'confirming' && (
                    <Card className="bg-[var(--color-bg-card)] border-[var(--color-border-default)] shadow-[var(--shadow-card)]">
                        <CardContent className="py-12 text-center">
                            <Loader2 className="h-12 w-12 animate-spin text-[#00A651] mx-auto mb-4" />
                            <h3 className="text-xl font-semibold mb-2">
                                {inst.confirmingTitle}
                            </h3>
                            <p className="text-muted-foreground">
                                {inst.confirmingDescription}
                            </p>
                        </CardContent>
                    </Card>
                )
            }

            {/* Success Step */}
            {
                step === 'success' && (
                    <Card className="bg-[var(--color-bg-card)] border-[var(--color-border-default)] shadow-[var(--shadow-card)]">
                        <CardContent className="py-12 text-center">
                            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
                            <h3 className="text-xl font-bold text-green-600 dark:text-green-400 mb-2">
                                {inst.successTitle}
                            </h3>
                            <p className="text-muted-foreground mb-6">
                                {inst.successMessage}
                            </p>
                            <Button onClick={handleReset} variant="outline">
                                {inst.newOperation}
                            </Button>
                        </CardContent>
                    </Card>
                )
            }

            {/* No Installment Step */}
            {
                step === 'no-installment' && (
                    <Card className="bg-[var(--color-bg-card)] border-[var(--color-border-default)] shadow-[var(--shadow-card)]">
                        <CardContent className="py-12 text-center">
                            <CreditCard className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                            <h3 className="text-xl font-semibold mb-2">
                                {inst.noInstallmentTitle}
                            </h3>
                            <p className="text-muted-foreground mb-6">
                                {inst.noInstallmentMessage}
                            </p>
                            <Button onClick={handleReset} variant="outline">
                                {inst.tryAnother}
                            </Button>
                        </CardContent>
                    </Card>
                )
            }

            {step === 'attention' && <Card><CardContent className="py-8 space-y-4">
                <p role="alert">{error}</p>
                <a href="/dashboard/operations/active" className="underline">{t.panelUi.viewActive}</a>
            </CardContent></Card>}
            {/* Error Step */}
            {
                step === 'error' && (
                    <Card className="bg-[var(--color-bg-card)] border-[var(--color-border-default)] shadow-[var(--shadow-card)]">
                        <CardContent className="py-12 text-center">
                            <XCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
                            <h3 className="text-xl font-bold text-red-600 dark:text-red-400 mb-2">
                                {inst.errorTitle}
                            </h3>
                            <p className="text-muted-foreground mb-6">
                                {error}
                            </p>
                            <Button onClick={handleReset} variant="outline">
                                {inst.tryAgain}
                            </Button>
                        </CardContent>
                    </Card>
                )
            }
            </>}
        </div >
    )
}

export default InstallmentPaymentFlow
