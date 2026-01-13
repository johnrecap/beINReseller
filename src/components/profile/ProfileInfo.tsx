'use client'

import { useState } from 'react'
import { User, Mail, Shield, Calendar, Edit2, Check, X } from 'lucide-react'
import { format } from 'date-fns'
import { ar, enUS, bn } from 'date-fns/locale'
import { useTranslation } from '@/hooks/useTranslation'

interface UserProfile {
    id: string
    username: string
    email: string
    role: string
    createdAt: string
}

interface ProfileInfoProps {
    user: UserProfile
    onUpdate: () => void
}

export default function ProfileInfo({ user, onUpdate }: ProfileInfoProps) {
    const { t, language } = useTranslation()
    const [isEditing, setIsEditing] = useState(false)
    const [email, setEmail] = useState(user.email)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const getDateLocale = () => {
        switch (language) {
            case 'ar': return ar
            case 'bn': return bn
            default: return enUS
        }
    }

    const handleSave = async () => {
        if (email === user.email) {
            setIsEditing(false)
            return
        }

        setLoading(true)
        setError(null)

        try {
            const res = await fetch('/api/user/profile', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            })

            const data = await res.json()

            if (!res.ok) {
                throw new Error(data.error || t.common.error)
            }

            setIsEditing(false)
            onUpdate()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error')
        } finally {
            setLoading(false)
        }
    }

    const handleCancel = () => {
        setIsEditing(false)
        setEmail(user.email)
        setError(null)
    }

    return (
        <div className="bg-white rounded-2xl shadow-sm p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
                <User className="w-5 h-5 text-purple-600" />
                {t.profile.personalInfo}
            </h2>

            <div className="space-y-6">
                {/* Username */}
                <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-xl">
                    <div className="mt-1 bg-purple-100 p-2 rounded-lg">
                        <User className="w-4 h-4 text-purple-600" />
                    </div>
                    <div className="flex-1">
                        <p className="text-xs text-gray-500 mb-1">{t.profile.username}</p>
                        <p className="font-semibold text-gray-800">{user.username}</p>
                    </div>
                </div>

                {/* Email */}
                <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-xl relative">
                    <div className="mt-1 bg-blue-100 p-2 rounded-lg">
                        <Mail className="w-4 h-4 text-blue-600" />
                    </div>
                    <div className="flex-1">
                        <div className="flex justify-between items-start">
                            <p className="text-xs text-gray-500 mb-1">{t.profile.email}</p>
                            {!isEditing && (
                                <button
                                    onClick={() => setIsEditing(true)}
                                    title={t.common.edit}
                                    className="p-1 hover:bg-white rounded transition-colors text-gray-400 hover:text-purple-600"
                                >
                                    <Edit2 className="w-4 h-4" />
                                </button>
                            )}
                        </div>

                        {isEditing ? (
                            <div className="mt-1 space-y-2">
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    title={t.profile.email}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-purple-500 focus:outline-none text-sm dir-ltr"
                                />
                                {error && <p className="text-xs text-red-500">{error}</p>}
                                <div className="flex gap-2 justify-end">
                                    <button
                                        onClick={handleCancel}
                                        disabled={loading}
                                        title={t.common.cancel}
                                        className="p-1.5 bg-gray-200 text-gray-600 rounded-lg hover:bg-gray-300 transition-colors"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={handleSave}
                                        disabled={loading}
                                        title={t.common.save}
                                        className="p-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                                    >
                                        <Check className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <p className="font-semibold text-gray-800 dir-ltr text-right">{user.email}</p>
                        )}
                    </div>
                </div>

                {/* Role */}
                <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-xl">
                    <div className="mt-1 bg-amber-100 p-2 rounded-lg">
                        <Shield className="w-4 h-4 text-amber-600" />
                    </div>
                    <div className="flex-1">
                        <p className="text-xs text-gray-500 mb-1">{t.profile.role}</p>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                            {user.role === 'ADMIN' ? t.sidebar.adminRole : t.sidebar.resellerRole}
                        </span>
                    </div>
                </div>

                {/* Created At */}
                <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-xl">
                    <div className="mt-1 bg-green-100 p-2 rounded-lg">
                        <Calendar className="w-4 h-4 text-green-600" />
                    </div>
                    <div className="flex-1">
                        <p className="text-xs text-gray-500 mb-1">{t.profile.createdAt}</p>
                        <p className="font-semibold text-gray-800">
                            {format(new Date(user.createdAt), 'dd MMMM yyyy', { locale: getDateLocale() })}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}
