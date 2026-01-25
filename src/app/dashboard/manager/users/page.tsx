'use client'

import { useState, useEffect, useCallback } from 'react'
import { Users } from 'lucide-react'
import ManagerUsersTable from '@/components/manager/users/ManagerUsersTable'

export default function ManagerUsersPage() {
    const [managerBalance, setManagerBalance] = useState(0)
    const [loading, setLoading] = useState(true)

    const fetchManagerBalance = useCallback(async () => {
        try {
            const res = await fetch('/api/manager/dashboard')
            const data = await res.json()
            if (res.ok) {
                setManagerBalance(data.stats?.managerBalance || 0)
            }
        } catch (error) {
            console.error('Failed to fetch manager balance', error)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchManagerBalance()
    }, [fetchManagerBalance])

    if (loading) {
        return (
            <div className="space-y-6">
                <div className="flex items-center gap-3 animate-pulse">
                    <div className="w-12 h-12 rounded-full bg-muted"></div>
                    <div className="space-y-2">
                        <div className="h-6 bg-muted rounded w-40"></div>
                        <div className="h-4 bg-muted rounded w-60"></div>
                    </div>
                </div>
                <div className="h-96 bg-muted rounded-xl"></div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-purple-600 flex items-center justify-center shadow-lg">
                    <Users className="w-6 h-6 text-white" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-foreground">إدارة المستخدمين</h1>
                    <p className="text-muted-foreground text-sm">إدارة المستخدمين التابعين لك - حذف، رصيد، كلمة مرور، تفعيل/تعطيل</p>
                </div>
            </div>

            <ManagerUsersTable 
                managerBalance={managerBalance} 
                onBalanceChange={fetchManagerBalance}
            />
        </div>
    )
}
