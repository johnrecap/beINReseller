'use client'

import { PanelCommandWarning } from '@/components/ui/PanelLoadError'
import { usePanelCommand } from '@/hooks/usePanelRequest'
import { useRef, useState } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Loader2 } from 'lucide-react'
import { useTranslation } from '@/hooks/useTranslation'

interface EditUserDialogProps {
    isOpen: boolean
    onClose: () => void
    onSuccess: () => void
    user: { id: string, username: string, email: string, isActive: boolean } | null
}

export default function EditUserDialog({ isOpen, onClose, onSuccess, user }: EditUserDialogProps) {
    const { t, dir } = useTranslation()
    const { request: command, unconfirmed } = usePanelCommand(isOpen ? user?.id : null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const submitting = useRef(false)

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        if (unconfirmed || !user || submitting.current) return

        submitting.current = true
        setLoading(true)
        setError(null)

        const formData = new FormData(e.currentTarget)
        const email = formData.get('email')
        const isActive = formData.get('isActive') === 'on'

        try {
            const res = await command(`/api/admin/users/${user.id}`, {
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
            submitting.current = false
            setLoading(false)
        }
    }

    if (!isOpen || !user) return null

    return (
        <Dialog open={isOpen} onOpenChange={open => { if (!open && !submitting.current) onClose() }}>
            <DialogContent panel closeLabel={t.panelUi.close} dir={dir} className="rounded-xl max-w-md p-0 bg-card text-foreground" aria-describedby={undefined}>
                <div className="flex justify-between items-center p-4 border-b border-gray-100">
                    <DialogTitle className="font-bold text-foreground pe-8">{t.admin.users.dialogs.editTitle}: {user.username}</DialogTitle>

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
                            placeholder={t.admin?.users?.dialogs?.email || 'Email'}
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

                    <PanelCommandWarning show={unconfirmed} />
                    {error && (
                        <div role="alert" className="p-3 bg-red-50 text-red-600 text-xs rounded-lg">
                            {error}
                        </div>
                    )}

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={() => { if (!submitting.current) onClose() }}
                            disabled={loading}
                            className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                        >
                            {t.admin.users.actions.cancel}
                        </button>
                        <button
                            type="submit"
                            disabled={unconfirmed || loading}
                            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 flex items-center justify-center gap-2"
                        >
                            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                            {t.admin.users.actions.save}
                        </button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    )
}
