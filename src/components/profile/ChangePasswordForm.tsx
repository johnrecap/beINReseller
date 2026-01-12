'use client'

import { useState } from 'react'
import { Lock, Loader2, Eye, EyeOff } from 'lucide-react'
import { useTranslation } from '@/hooks/useTranslation'

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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (newPassword !== confirmPassword) {
            setError(t.profile.passwordMismatch)
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
        } catch (err: any) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="bg-white rounded-2xl shadow-sm p-6 h-full">
            <h2 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
                <Lock className="w-5 h-5 text-purple-600" />
                {t.profile.changePassword}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
                {/* Current Password */}
                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">{t.profile.currentPassword}</label>
                    <div className="relative">
                        <input
                            type={showCurrent ? 'text' : 'password'}
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            title={t.profile.currentPassword}
                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:border-purple-500 focus:outline-none text-sm dir-ltr pr-10"
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
                    <label className="block text-xs font-medium text-gray-500 mb-1">{t.profile.newPassword}</label>
                    <div className="relative">
                        <input
                            type={showNew ? 'text' : 'password'}
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            title={t.profile.newPassword}
                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:border-purple-500 focus:outline-none text-sm dir-ltr pr-10"
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
                </div>

                {/* Confirm Password */}
                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">{t.profile.confirmPassword}</label>
                    <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        title={t.profile.confirmPassword}
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:border-purple-500 focus:outline-none text-sm dir-ltr"
                        required
                    />
                </div>

                {/* Messages */}
                {error && (
                    <div className="p-3 bg-red-50 text-red-600 rounded-lg text-xs">
                        ❌ {error}
                    </div>
                )}
                {success && (
                    <div className="p-3 bg-green-50 text-green-600 rounded-lg text-xs">
                        ✅ {success}
                    </div>
                )}

                {/* Submit */}
                <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 bg-gray-900 text-white rounded-lg hover:bg-black transition-colors font-medium flex items-center justify-center gap-2"
                >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : t.profile.saveChanges}
                </button>
            </form>
        </div>
    )
}
