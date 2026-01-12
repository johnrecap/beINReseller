'use client'

import { useState } from 'react'
import { X, Loader2 } from 'lucide-react'

interface EditUserDialogProps {
    isOpen: boolean
    onClose: () => void
    onSuccess: () => void
    user: { id: string, username: string, email: string, isActive: boolean } | null
}

export default function EditUserDialog({ isOpen, onClose, onSuccess, user }: EditUserDialogProps) {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        if (!user) return

        setLoading(true)
        setError(null)

        const formData = new FormData(e.currentTarget)
        const email = formData.get('email')
        const isActive = formData.get('isActive') === 'on'

        try {
            const res = await fetch(`/api/admin/users/${user.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, isActive }),
            })

            const json = await res.json()

            if (!res.ok) throw new Error(json.error || 'حدث خطأ')

            onSuccess()
            onClose()
        } catch (err: any) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    if (!isOpen || !user) return null

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="flex justify-between items-center p-4 border-b border-gray-100">
                    <h3 className="font-bold text-gray-800">تعديل المستخدم: {user.username}</h3>
                    <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg text-gray-500">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">البريد الإلكتروني</label>
                        <input
                            name="email"
                            type="email"
                            defaultValue={user.email}
                            required
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-purple-500 text-sm text-right dir-ltr"
                        />
                    </div>

                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                        <input
                            name="isActive"
                            type="checkbox"
                            id="isActive"
                            defaultChecked={user.isActive}
                            className="w-5 h-5 text-purple-600 rounded focus:ring-purple-500 cursor-pointer"
                        />
                        <label htmlFor="isActive" className="text-sm font-medium text-gray-700 cursor-pointer select-none">
                            الحساب نشط
                        </label>
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
                            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 flex items-center justify-center gap-2"
                        >
                            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                            حفظ التعديلات
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
