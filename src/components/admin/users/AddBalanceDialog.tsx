'use client'

import { useState } from 'react'
import { Wallet, X, Loader2 } from 'lucide-react'

interface AddBalanceDialogProps {
    isOpen: boolean
    onClose: () => void
    onSuccess: () => void
    userId: string | null
    username: string | null
}

export default function AddBalanceDialog({ isOpen, onClose, onSuccess, userId, username }: AddBalanceDialogProps) {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        if (!userId) return

        setLoading(true)
        setError(null)

        const formData = new FormData(e.currentTarget)
        const amount = Number(formData.get('amount'))
        const notes = formData.get('notes')

        try {
            const res = await fetch(`/api/admin/users/${userId}/balance`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount, notes }),
            })

            const json = await res.json()

            if (!res.ok) {
                throw new Error(json.error || 'حدث خطأ')
            }

            onSuccess()
            onClose()
        } catch (err: any) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    if (!isOpen || !userId) return null

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="flex justify-between items-center p-4 border-b border-gray-100 bg-green-50">
                    <h3 className="font-bold text-green-800 flex items-center gap-2">
                        <Wallet className="w-5 h-5" />
                        شحن رصيد
                    </h3>
                    <button onClick={onClose} className="p-1 hover:bg-white/50 rounded-lg text-green-700">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-4 bg-gray-50 border-b border-gray-100 text-sm">
                    إضافة رصيد للمستخدم: <span className="font-bold">{username}</span>
                </div>

                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">المبلغ (ريال)</label>
                        <input
                            name="amount"
                            type="number"
                            min="1"
                            step="0.01"
                            required
                            autoFocus
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-green-500 text-lg font-bold text-center dir-ltr"
                            placeholder="0.00"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">ملاحظات (اختياري)</label>
                        <textarea
                            name="notes"
                            rows={2}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-green-500 text-sm"
                            placeholder="سبب الإضافة..."
                        />
                    </div>

                    {error && (
                        <div className="p-3 bg-red-50 text-red-600 text-xs rounded-lg">
                            {error}
                        </div>
                    )}

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                        >
                            إلغاء
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 flex items-center justify-center gap-2"
                        >
                            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                            تأكيد الشحن
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
