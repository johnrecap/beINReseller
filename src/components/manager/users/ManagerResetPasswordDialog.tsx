'use client'

import { useState } from 'react'
import { KeyRound, X, Loader2, Copy, Check } from 'lucide-react'
import { useTranslation } from '@/hooks/useTranslation'

interface ManagerResetPasswordDialogProps {
    isOpen: boolean
    onClose: () => void
    userId: string | null
    username: string | null
}

export default function ManagerResetPasswordDialog({ isOpen, onClose, userId, username }: ManagerResetPasswordDialogProps) {
    const { t } = useTranslation()
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [newPassword, setNewPassword] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)

    const handleReset = async () => {
        if (!userId) return
        setLoading(true)
        setError(null)
        setNewPassword(null)

        try {
            const res = await fetch(`/api/manager/users/${userId}/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}), // Auto generate
            })

            const json = await res.json()

            if (!res.ok) throw new Error(json.error || t.admin?.users?.messages?.error || 'An error occurred')

            setNewPassword(json.newPassword)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error')
        } finally {
            setLoading(false)
        }
    }

    const copyToClipboard = () => {
        if (newPassword) {
            navigator.clipboard.writeText(newPassword)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        }
    }

    const handleClose = () => {
        setNewPassword(null)
        setError(null)
        onClose()
    }

    if (!isOpen || !userId) return null

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-card rounded-xl shadow-xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="flex justify-between items-center p-4 border-b border-border bg-amber-50 dark:bg-amber-900/20">
                    <h3 className="font-bold text-amber-800 dark:text-amber-400 flex items-center gap-2">
                        <KeyRound className="w-5 h-5" />
                        {t.admin?.users?.dialogs?.resetTitle || 'Reset Password'}
                    </h3>
                    <button onClick={handleClose} title={t.common?.close || 'Close'} className="p-1 hover:bg-white/50 dark:hover:bg-amber-900/40 rounded-lg text-amber-700">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 text-center space-y-6">
                    {!newPassword ? (
                        <>
                            <p className="text-muted-foreground">
                                {t.manager?.resetPassword?.confirmMessage || 'Do you want to reset password for'} <span className="font-bold text-foreground">{username}</span>?
                            </p>
                            <div className="flex gap-3 justify-center">
                                <button
                                    onClick={handleClose}
                                    className="px-4 py-2 text-sm font-medium text-foreground bg-secondary rounded-lg hover:bg-secondary/80"
                                >
                                    {t.common?.cancel || 'Cancel'}
                                </button>
                                <button
                                    onClick={handleReset}
                                    disabled={loading}
                                    className="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 flex items-center gap-2"
                                >
                                    {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                                    {t.manager?.resetPassword?.resetButton || 'Reset'}
                                </button>
                            </div>
                        </>
                    ) : (
                        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                            <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto">
                                <Check className="w-6 h-6 text-green-600" />
                            </div>
                            <h4 className="font-bold text-foreground">{t.admin?.users?.messages?.resetSuccess || 'Password reset successfully'}</h4>

                            <div className="bg-secondary p-4 rounded-xl flex items-center justify-between border border-border">
                                <code className="font-mono text-lg text-foreground font-bold tracking-wider">{newPassword}</code>
                                <button
                                    onClick={copyToClipboard}
                                    className="p-2 hover:bg-card rounded-lg text-muted-foreground transition-colors"
                                    title={t.common?.copy || 'Copy'}
                                >
                                    {copied ? <Check className="w-5 h-5 text-green-600" /> : <Copy className="w-5 h-5" />}
                                </button>
                            </div>

                            <p className="text-xs text-muted-foreground">
                                {t.manager?.resetPassword?.saveHint || 'Save the new password and send it to the user'}
                            </p>

                            <button
                                onClick={handleClose}
                                className="w-full px-4 py-2 text-sm font-medium text-white bg-[#00A651] rounded-lg hover:bg-[#008f45]"
                            >
                                {t.common?.close || 'Close'}
                            </button>
                        </div>
                    )}

                    {error && (
                        <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs rounded-lg text-right">
                            {error}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
