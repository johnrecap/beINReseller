'use client'

import { useState } from 'react'
import { Wallet, X, Loader2, ArrowUpCircle, ArrowDownCircle } from 'lucide-react'
import { useTranslation } from '@/hooks/useTranslation'

interface AddBalanceDialogProps {
    isOpen: boolean
    onClose: () => void
    onSuccess: () => void
    userId: string | null
    username: string | null
}

type OperationType = 'deposit' | 'withdraw'

export default function AddBalanceDialog({ isOpen, onClose, onSuccess, userId, username }: AddBalanceDialogProps) {
    const { t } = useTranslation()
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [operationType, setOperationType] = useState<OperationType>('deposit')

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        if (!userId) return

        setLoading(true)
        setError(null)

        const formData = new FormData(e.currentTarget)
        const rawAmount = Number(formData.get('amount'))
        const notes = formData.get('notes')

        // For withdraw, send negative amount
        const amount = operationType === 'withdraw' ? -rawAmount : rawAmount

        try {
            const res = await fetch(`/api/admin/users/${userId}/balance`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount, notes }),
            })

            const json = await res.json()

            if (!res.ok) {
                throw new Error(json.error || t.admin.users.messages.error)
            }

            onSuccess()
            onClose()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error')
        } finally {
            setLoading(false)
        }
    }

    // Reset state when dialog closes
    const handleClose = () => {
        setOperationType('deposit')
        setError(null)
        onClose()
    }

    if (!isOpen || !userId) return null

    const isDeposit = operationType === 'deposit'

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-card rounded-xl shadow-xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
                {/* Header */}
                <div className={`flex justify-between items-center p-4 border-b border-border ${isDeposit ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
                    <h3 className={`font-bold flex items-center gap-2 ${isDeposit ? 'text-green-800 dark:text-green-400' : 'text-red-800 dark:text-red-400'}`}>
                        <Wallet className="w-5 h-5" />
                        {isDeposit ? (t.admin?.users?.dialogs?.depositBalance || 'Deposit Balance') : (t.admin?.users?.dialogs?.withdrawBalance || 'Withdraw Balance')}
                    </h3>
                    <button
                        onClick={handleClose}
                        className={`p-1 rounded-lg ${isDeposit ? 'hover:bg-green-100 dark:hover:bg-green-900/40 text-green-700' : 'hover:bg-red-100 dark:hover:bg-red-900/40 text-red-700'}`}
                        title={t.common?.close || 'Close'}
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Toggle Buttons */}
                <div className="flex p-2 gap-2 bg-secondary/50">
                    <button
                        type="button"
                        onClick={() => setOperationType('deposit')}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${isDeposit
                                ? 'bg-green-600 text-white'
                                : 'bg-card text-muted-foreground hover:bg-green-50 dark:hover:bg-green-900/20'
                            }`}
                    >
                        <ArrowUpCircle className="w-4 h-4" />
                        {t.transactions?.deposit || 'Deposit'}
                    </button>
                    <button
                        type="button"
                        onClick={() => setOperationType('withdraw')}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${!isDeposit
                                ? 'bg-red-600 text-white'
                                : 'bg-card text-muted-foreground hover:bg-red-50 dark:hover:bg-red-900/20'
                            }`}
                    >
                        <ArrowDownCircle className="w-4 h-4" />
                        {t.transactions?.withdrawal || 'Withdraw'}
                    </button>
                </div>

                {/* User Info */}
                <div className="p-4 bg-secondary/30 border-b border-border text-sm">
                    {t.admin?.users?.dialogs?.userLabel || 'User'}: <span className="font-bold">{username}</span>
                </div>

                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-foreground mb-1">
                            {t.admin?.users?.dialogs?.amount || 'Amount'} ($)
                        </label>
                        <input
                            name="amount"
                            type="number"
                            min="0.01"
                            step="0.01"
                            required
                            autoFocus
                            className={`w-full px-3 py-2 border rounded-lg focus:outline-none text-lg font-bold text-center dir-ltr bg-background ${isDeposit
                                    ? 'border-green-200 focus:border-green-500 dark:border-green-800'
                                    : 'border-red-200 focus:border-red-500 dark:border-red-800'
                                }`}
                            placeholder="0.00"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-foreground mb-1">
                            {t.admin?.users?.dialogs?.notes || 'Notes'}
                        </label>
                        <textarea
                            name="notes"
                            rows={2}
                            className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:border-purple-500 text-sm bg-background"
                            placeholder={isDeposit ? (t.admin?.users?.dialogs?.depositReason || 'Reason for deposit (optional)') : (t.admin?.users?.dialogs?.withdrawReason || 'Reason for withdrawal (optional)')}
                        />
                    </div>

                    {error && (
                        <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs rounded-lg">
                            {error}
                        </div>
                    )}

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={handleClose}
                            className="flex-1 px-4 py-2 text-sm font-medium text-foreground bg-secondary rounded-lg hover:bg-secondary/80"
                        >
                            {t.common?.cancel || 'Cancel'}
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className={`flex-1 px-4 py-2 text-sm font-medium text-white rounded-lg flex items-center justify-center gap-2 ${isDeposit
                                    ? 'bg-green-600 hover:bg-green-700'
                                    : 'bg-red-600 hover:bg-red-700'
                                }`}
                        >
                            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                            {isDeposit ? (t.admin?.users?.dialogs?.confirmDeposit || 'Confirm Deposit') : (t.admin?.users?.dialogs?.confirmWithdraw || 'Confirm Withdrawal')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
