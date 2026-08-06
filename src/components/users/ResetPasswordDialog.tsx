'use client'

import { FormEvent, useEffect, useState } from 'react'
import { AlertTriangle, Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import PasswordStrengthMeter from '@/components/profile/PasswordStrengthMeter'
import { useTranslation } from '@/hooks/useTranslation'

type ResetScope = 'admin' | 'manager' | 'agent'

type ResetPasswordDialogProps = {
    isOpen: boolean
    onClose: () => void
    onSuccess?: () => void
    scope: ResetScope
    user: {
        id: string
        username: string
    } | null
}

export default function ResetPasswordDialog({
    isOpen,
    onClose,
    onSuccess,
    scope,
    user,
}: ResetPasswordDialogProps) {
    const { t, dir } = useTranslation()
    const copy = t.passwordReset
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)

    useEffect(() => {
        setNewPassword('')
        setConfirmPassword('')
        setShowPassword(false)
        setSubmitting(false)
        setError(null)
        setSuccess(false)
    }, [isOpen, user?.id])

    async function submitPasswordReset(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        if (!user || submitting) return

        if (newPassword.length < 6) {
            setError(copy.minLength)
            return
        }

        if (newPassword !== confirmPassword) {
            setError(copy.mismatch)
            return
        }

        setSubmitting(true)
        setError(null)
        try {
            const response = await fetch(
                '/api/' + scope + '/users/' + user.id + '/reset-password',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ newPassword }),
                }
            )
            const responseBody = await response.json().catch(() => null)
            if (!response.ok) {
                const code = typeof responseBody?.code === 'string'
                    ? responseBody.code
                    : 'SERVER_ERROR'
                const messages = copy.errors as Record<string, string>
                throw new Error(messages[code] || copy.errors.SERVER_ERROR)
            }

            setNewPassword('')
            setConfirmPassword('')
            setSuccess(true)
            onSuccess?.()
        } catch (requestError) {
            setError(
                requestError instanceof Error
                    ? requestError.message
                    : copy.errors.SERVER_ERROR
            )
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <Dialog
            open={isOpen}
            onOpenChange={(open) => {
                if (!open && !submitting) onClose()
            }}
        >
            <DialogContent className="sm:max-w-md" dir={dir}>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <KeyRound className="h-5 w-5 text-purple-500" />
                        {copy.title}
                    </DialogTitle>
                    <DialogDescription>
                        {copy.description} <span className="font-semibold text-foreground">{user?.username}</span>
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={submitPasswordReset} className="space-y-4">
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
                        <div className="flex items-start gap-2">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                            <span>{copy.sessionWarning}</span>
                        </div>
                    </div>

                    {error && (
                        <div role="alert" className="rounded-lg bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-300">
                            {error}
                        </div>
                    )}

                    {success && (
                        <div role="status" className="rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
                            {copy.success}
                        </div>
                    )}

                    {!success && (
                        <>
                            <div className="space-y-2">
                                <label htmlFor="reset-new-password" className="text-sm font-medium text-foreground">
                                    {copy.newPassword}
                                </label>
                                <div className="relative">
                                    <input
                                        id="reset-new-password"
                                        type={showPassword ? 'text' : 'password'}
                                        autoComplete="new-password"
                                        value={newPassword}
                                        onChange={(event) => setNewPassword(event.target.value)}
                                        disabled={submitting}
                                        className="w-full rounded-lg border border-border bg-background px-3 py-2 pe-10 text-foreground outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword((visible) => !visible)}
                                        disabled={submitting}
                                        aria-label={showPassword ? copy.hidePassword : copy.showPassword}
                                        className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                                    >
                                        {showPassword
                                            ? <EyeOff className="h-4 w-4" />
                                            : <Eye className="h-4 w-4" />}
                                    </button>
                                </div>
                                <PasswordStrengthMeter
                                    password={newPassword}
                                    minimumLength={6}
                                    labels={copy.strength}
                                />
                            </div>

                            <div className="space-y-2">
                                <label htmlFor="reset-confirm-password" className="text-sm font-medium text-foreground">
                                    {copy.confirmPassword}
                                </label>
                                <input
                                    id="reset-confirm-password"
                                    type={showPassword ? 'text' : 'password'}
                                    autoComplete="new-password"
                                    value={confirmPassword}
                                    onChange={(event) => setConfirmPassword(event.target.value)}
                                    disabled={submitting}
                                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20"
                                />
                            </div>
                        </>
                    )}

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onClose}
                            disabled={submitting}
                        >
                            {success ? t.common.close : t.common.cancel}
                        </Button>
                        {!success && (
                            <Button type="submit" disabled={submitting}>
                                {submitting && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                                {submitting ? copy.submitting : copy.submit}
                            </Button>
                        )}
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
