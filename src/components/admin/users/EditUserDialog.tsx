'use client'

import { useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { useTranslation } from '@/hooks/useTranslation'

interface EditUserDialogProps {
    isOpen: boolean
    onClose: () => void
    onSuccess: () => void
    user: { id: string, username: string, email: string, isActive: boolean } | null
}

export default function EditUserDialog({ isOpen, onClose, onSuccess, user }: EditUserDialogProps) {
    const { t } = useTranslation()
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

            if (!res.ok) throw new Error(json.error || t.admin.users.messages.error)

            onSuccess()
            onClose()
        } catch (err) {
            setError(err instanceof Error ? err.message : t.admin.users.messages.error)
        } finally {
            setLoading(false)
        }
    }

    if (!isOpen || !user) return null

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="flex justify-between items-center p-4 border-b border-gray-100">
                    <h3 className="font-bold text-foreground">{t.admin.users.dialogs.editTitle}: {user.username}</h3>
                    <button onClick={onClose} title="إغلاق" className="p-1 hover:bg-secondary rounded-lg text-muted-foreground">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    <div>
                        <label htmlFor="edit-email" className="block text-sm font-medium text-foreground mb-1">{t.admin.users.dialogs.email}</label>
                        <input
                            id="edit-email"
                            name="email"
                            type="email"
                            defaultValue={user.email}
                            required
                            placeholder="البريد الإلكتروني"
                            className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:border-[#00A651] bg-background text-foreground text-sm text-right dir-ltr"
                        />
                    </div>

                    <div className="flex items-center gap-3 p-3 bg-secondary rounded-lg">
                        <input
                            name="isActive"
                            type="checkbox"
                            id="isActive"
                            defaultChecked={user.isActive}
                            className="w-5 h-5 text-[#00A651] rounded focus:ring-[#00A651] cursor-pointer"
                        />
                        <label htmlFor="isActive" className="text-sm font-medium text-foreground cursor-pointer select-none">
                            {t.admin.users.table.active}
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
                            {t.admin.users.actions.cancel}
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 flex items-center justify-center gap-2"
                        >
                            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                            {t.admin.users.actions.save}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
