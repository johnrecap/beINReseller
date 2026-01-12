'use client'

import { useState } from 'react'
import { KeyRound, X, Loader2, Copy, Check } from 'lucide-react'
import { useTranslation } from '@/hooks/useTranslation'

interface ResetPasswordDialogProps {
    isOpen: boolean
    onClose: () => void
    userId: string | null
    username: string | null
}

export default function ResetPasswordDialog({ isOpen, onClose, userId, username }: ResetPasswordDialogProps) {
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
            const res = await fetch(`/api/admin/users/${userId}/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}), // Auto generate
            })

            const json = await res.json()

            if (!res.ok) throw new Error(json.error || t.admin.users.messages.error)

            setNewPassword(json.newPassword)
        } catch (err: any) {
            setError(err.message)
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
            <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="flex justify-between items-center p-4 border-b border-gray-100 bg-amber-50">
                    <h3 className="font-bold text-amber-800 flex items-center gap-2">
                        <KeyRound className="w-5 h-5" />
                        {t.admin.users.dialogs.resetTitle}
                    </h3>
                    <button onClick={handleClose} className="p-1 hover:bg-white/50 rounded-lg text-amber-700">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 text-center space-y-6">
                    {!newPassword ? (
                        <>
                            <p className="text-gray-600">
                                {t.admin.users.dialogs.resetConfirm.split('{name}')[0]}
                                <span className="font-bold">{username}</span>
                                {t.admin.users.dialogs.resetConfirm.split('{name}')[1]}
                            </p>
                            <div className="flex gap-3 justify-center">
                                <button
                                    onClick={handleClose}
                                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                                >
                                    {t.admin.users.actions.cancel}
                                </button>
                                <button
                                    onClick={handleReset}
                                    disabled={loading}
                                    className="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 flex items-center gap-2"
                                >
                                    {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                                    {t.admin.users.actions.resetPassword}
                                </button>
                            </div>
                        </>
                    ) : (
                        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                                <Check className="w-6 h-6 text-green-600" />
                            </div>
                            <h4 className="font-bold text-gray-800">{t.admin.users.messages.resetSuccess}</h4>

                            <div className="bg-gray-100 p-4 rounded-xl flex items-center justify-between border border-gray-200">
                                <code className="font-mono text-lg text-gray-800 font-bold tracking-wider">{newPassword}</code>
                                <button
                                    onClick={copyToClipboard}
                                    className="p-2 hover:bg-white rounded-lg text-gray-500 transition-colors"
                                    title={t.common.copy}
                                >
                                    {copied ? <Check className="w-5 h-5 text-green-600" /> : <Copy className="w-5 h-5" />}
                                </button>
                            </div>

                            <p className="text-xs text-gray-500">
                                {t.admin.users.messages.copyPassword}
                            </p>

                            <button
                                onClick={handleClose}
                                className="w-full px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-black"
                            >
                                {t.common.close}
                            </button>
                        </div>
                    )}

                    {error && (
                        <div className="p-3 bg-red-50 text-red-600 text-xs rounded-lg text-right">
                            ❌ {error}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
