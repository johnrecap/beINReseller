'use client'

import { Trash2 } from 'lucide-react'
import { useTranslation } from '@/hooks/useTranslation'

interface DeletedUsersPageHeaderProps {
    children: React.ReactNode
}

export function DeletedUsersPageHeader({ children }: DeletedUsersPageHeaderProps) {
    const { t } = useTranslation()

    return (
        <div className="space-y-6" dir="rtl">
            {/* Page Header */}
            <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center shadow-lg">
                    <Trash2 className="w-6 h-6 text-white" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-foreground">{t.manager?.deletedUsers?.title || 'Deleted Accounts'}</h1>
                    <p className="text-muted-foreground text-sm">{t.manager?.deletedUsers?.subtitle || 'View and restore deleted user accounts'}</p>
                </div>
            </div>

            {children}
        </div>
    )
}

export function LoadingState() {
    const { t } = useTranslation()
    return <div>{t.common?.loading || 'Loading...'}</div>
}
