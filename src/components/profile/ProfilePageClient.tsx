'use client'

import { useState, useEffect, useCallback } from 'react'
import { UserCheck } from 'lucide-react'
import ProfileInfo from '@/components/profile/ProfileInfo'
import ChangePasswordForm from '@/components/profile/ChangePasswordForm'
import { useTranslation } from '@/hooks/useTranslation'

export default function ProfilePageClient() {
    const { t } = useTranslation()
    const [user, setUser] = useState(null)
    const [loading, setLoading] = useState(true)

    const fetchProfile = useCallback(async () => {
        try {
            const res = await fetch('/api/user/profile')
            const data = await res.json()
            if (res.ok) {
                setUser(data.user)
            }
        } catch (error) {
            console.error('Failed to fetch profile', error)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchProfile()
    }, [fetchProfile])

    if (loading) {
        return (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-pulse">
                <div className="h-64 bg-gray-200 rounded-2xl"></div>
                <div className="h-64 bg-gray-200 rounded-2xl"></div>
            </div>
        )
    }

    if (!user) return null

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center shadow-lg">
                    <UserCheck className="w-6 h-6 text-white" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">{t.profile.title}</h1>
                    <p className="text-gray-500 text-sm">{t.profile.subtitle}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column: Personal Info */}
                <ProfileInfo user={user} onUpdate={fetchProfile} />

                {/* Right Column: Change Password */}
                <ChangePasswordForm />
            </div>
        </div>
    )
}
