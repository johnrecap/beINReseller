'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Loader2, AlertTriangle } from 'lucide-react'
import { useTranslation } from '@/hooks/useTranslation'

const EMAIL_DOMAIN = "@deshpanel.com"

interface CreateUserDialogProps {
    isOpen: boolean
    onClose: () => void
    onSuccess: () => void
}

export default function CreateUserDialog({ isOpen, onClose, onSuccess }: CreateUserDialogProps) {
    const { t } = useTranslation()
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [emailWarning, setEmailWarning] = useState("")
    const [username, setUsername] = useState("")
    const [email, setEmail] = useState("")
    const emailInputRef = useRef<HTMLInputElement>(null)

    // Generate email from username when user finishes typing
    const handleUsernameBlur = () => {
        if (username && username.length >= 3 && !email) {
            setEmail(`${username}${EMAIL_DOMAIN}`)
        }
    }

    // Show warning for non-standard email format
    useEffect(() => {
        if (email && email.length > 0) {
            if (!email.endsWith(EMAIL_DOMAIN)) {
                setEmailWarning(`الصيغة الصحيحة: اسم_المستخدم${EMAIL_DOMAIN}`)
            } else {
                setEmailWarning("")
            }
        } else {
            setEmailWarning("")
        }
    }, [email])

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()

        // Validate email format
        if (!email.endsWith(EMAIL_DOMAIN)) {
            setError(`البريد الإلكتروني يجب أن ينتهي بـ ${EMAIL_DOMAIN}`)
            return
        }

        setLoading(true)
        setError(null)

        const formData = new FormData(e.currentTarget)
        const data = {
            username: formData.get('username') as string,
            email: email,
            password: formData.get('password') as string,
            role: formData.get('role') as string,
            balance: parseFloat(formData.get('balance') as string) || 0,
        }

        try {
            const res = await fetch('/api/admin/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            })

            const json = await res.json()

            if (!res.ok) {
                throw new Error(json.error || t.admin.users.messages.error)
            }

            onSuccess()
            onClose()
            // Reset form
            setUsername("")
            setEmail("")
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error')
        } finally {
            setLoading(false)
        }
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-card rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200 border border-border">
                <div className="flex justify-between items-center p-4 border-b border-border">
                    <h3 className="font-bold text-foreground">{t.admin.users.dialogs.createTitle}</h3>
                    <button onClick={onClose} title="إغلاق" className="p-1 hover:bg-secondary rounded-lg text-muted-foreground">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    <div>
                        <label htmlFor="username" className="block text-sm font-medium text-foreground mb-1">{t.admin.users.dialogs.username}</label>
                        <input
                            id="username"
                            name="username"
                            type="text"
                            required
                            minLength={3}
                            placeholder="اسم المستخدم"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            onBlur={handleUsernameBlur}
                            className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:border-[#00A651] bg-background text-foreground text-sm"
                        />
                    </div>

                    <div>
                        <label htmlFor="email" className="block text-sm font-medium text-foreground mb-1">{t.admin.users.dialogs.email}</label>
                        <input
                            id="email"
                            name="email"
                            type="email"
                            required
                            ref={emailInputRef}
                            placeholder={`example${EMAIL_DOMAIN}`}
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:border-[#00A651] bg-background text-foreground text-sm text-right dir-ltr"
                        />
                        {emailWarning && (
                            <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400 text-xs mt-1">
                                <AlertTriangle className="w-3 h-3" />
                                <span>{emailWarning}</span>
                            </div>
                        )}
                    </div>

                    <div>
                        <label htmlFor="password" className="block text-sm font-medium text-foreground mb-1">{t.admin.users.dialogs.password}</label>
                        <input
                            id="password"
                            name="password"
                            type="password"
                            required
                            minLength={6}
                            placeholder="كلمة المرور"
                            className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:border-[#00A651] bg-background text-foreground text-sm dir-ltr"
                        />
                    </div>

                    <div>
                        <label htmlFor="role" className="block text-sm font-medium text-foreground mb-1">نوع الحساب</label>
                        <select
                            id="role"
                            name="role"
                            required
                            defaultValue="RESELLER"
                            className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:border-[#00A651] bg-background text-foreground text-sm"
                        >
                            <option value="RESELLER">موزع (Reseller)</option>
                            <option value="MANAGER">مدير (Manager)</option>
                            <option value="USER">مستخدم (User)</option>
                            <option value="ADMIN">أدمن (Admin)</option>
                        </select>
                    </div>

                    <div>
                        <label htmlFor="balance" className="block text-sm font-medium text-foreground mb-1">الرصيد الأولي</label>
                        <input
                            id="balance"
                            name="balance"
                            type="number"
                            step="0.01"
                            defaultValue="0"
                            min="0"
                            placeholder="0.00"
                            className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:border-[#00A651] bg-background text-foreground text-sm"
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
                            onClick={onClose}
                            className="flex-1 px-4 py-2 text-sm font-medium text-muted-foreground bg-secondary rounded-lg hover:bg-secondary/80"
                        >
                            {t.admin.users.actions.cancel}
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 flex items-center justify-center gap-2"
                        >
                            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                            {loading ? t.admin.users.actions.creating : t.admin.users.actions.add}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
