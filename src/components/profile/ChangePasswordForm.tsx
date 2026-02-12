'use client'

import { useState } from 'react'
import { Lock, Loader2, Eye, EyeOff } from 'lucide-react'
import { useTranslation } from '@/hooks/useTranslation'
import PasswordStrengthMeter from './PasswordStrengthMeter'

export default function ChangePasswordForm() {
    const { t } = useTranslation()
    const [currentPassword, setCurrentPassword] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)

    const [showCurrent, setShowCurrent] = useState(false)
    const [showNew, setShowNew] = useState(false)
    const [showConfirm, setShowConfirm] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (newPassword !== confirmPassword) {
            setError(t.profile.passwordMismatch || 'Passwords do not match')
            return
        }

        setLoading(true)
        setError(null)
        setSuccess(null)

        try {
            const res = await fetch('/api/user/change-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentPassword, newPassword }),
            })

            const data = await res.json()

            if (!res.ok) {
                throw new Error(data.error || t.common.error)
            }

            setSuccess(t.profile.passwordSuccess)
            setCurrentPassword('')
            setNewPassword('')
            setConfirmPassword('')
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="bg-card rounded-2xl shadow-sm p-6 h-full">
            <h2 className="text-lg font-bold text-foreground mb-6 flex items-center gap-2">
                <Lock className="w-5 h-5 text-[#3B82F6]" />
                {t.profile.changePassword}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
                {/* Current Password */}
                <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">{t.profile.currentPassword}</label>
                    <div className="relative">
                        <input
                            type={showCurrent ? 'text' : 'password'}
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            title={t.profile.currentPassword}
                            className={`w-full px-4 py-2 border rounded-lg focus:outline-none text-sm dir-ltr pr-10 bg-background text-foreground ${error && error.includes('Current') ? 'border-red-500' : 'border-border focus:border-[#00A651]'}`}
                            required
                        />
                        <button
                            type="button"
                            onClick={() => setShowCurrent(!showCurrent)}
                            aria-label={showCurrent ? t.auth.hidePassword : t.auth.showPassword}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                            {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                    </div>
                </div>

                {/* New Password */}
                <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">{t.profile.newPassword}</label>
                    <div className="relative">
                        <input
                            type={showNew ? 'text' : 'password'}
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            title={t.profile.newPassword}
                            className="w-full px-4 py-2 border border-border rounded-lg focus:border-[#00A651] focus:outline-none text-sm dir-ltr pr-10 bg-background text-foreground"
                            minLength={6}
                            required
                        />
                        <button
                            type="button"
                            onClick={() => setShowNew(!showNew)}
                            aria-label={showNew ? t.auth.hidePassword : t.auth.showPassword}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                            {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                    </div>
                    {newPassword && <PasswordStrengthMeter password={newPassword} />}
                </div>

                {/* Confirm Password */}
                <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">{t.profile.confirmPassword}</label>
                    <div className="relative">
                        <input
                            type={showConfirm ? 'text' : 'password'}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            title={t.profile.confirmPassword}
                            className={`w-full px-4 py-2 border rounded-lg focus:outline-none text-sm dir-ltr pr-10 bg-background text-foreground ${newPassword !== confirmPassword && confirmPassword ? 'border-[#ED1C24]' : 'border-border focus:border-[#00A651]'}`}
                            required
                        />
                        <button
                            type="button"
                            onClick={() => setShowConfirm(!showConfirm)}
                            aria-label={showConfirm ? t.auth.hidePassword : t.auth.showPassword}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                            {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                    </div>
                    {newPassword !== confirmPassword && confirmPassword && (
                        <p className="text-xs text-[#ED1C24] mt-1">{t.profile.passwordMismatch || 'Passwords do not match'}</p>
                    )}
                </div>

                {/* Messages */}
                {error && (
                    <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-xs">
                        ❌ {error}
                    </div>
                )}
                {success && (
                    <div className="p-3 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-lg text-xs">
                        ✅ {success}
                    </div>
                )}

                {/* Submit */}
                <button
                    type="submit"
                    disabled={loading || (newPassword !== confirmPassword && confirmPassword.length > 0)}
                    className="w-full py-2.5 bg-[#00A651] text-white rounded-lg hover:bg-[#008f45] transition-colors font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : t.profile.saveChanges}
                </button>
            </form>
        </div>
    )
}
