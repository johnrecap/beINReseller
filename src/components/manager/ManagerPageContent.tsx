'use client'

import { useEffect, useState } from "react"
import { ManagerStats } from "@/components/manager/ManagerStats"
import { ManagerUsersList } from "@/components/manager/ManagerUsersList"
import { ManagerActionsLog } from "@/components/manager/ManagerActionsLog"
import { CreateUserDialog } from "@/components/manager/CreateUserDialog"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useTranslation } from "@/hooks/useTranslation"

interface ManagerPageContentProps {
    data: {
        stats: any
        recentUsers: any[]
        recentActions: any[]
    } | null
}

export function ManagerPageContent({ data }: ManagerPageContentProps) {
    const { t } = useTranslation()
    const [userCreationDisabled, setUserCreationDisabled] = useState(false)

    useEffect(() => {
        let active = true

        async function fetchPermissionState() {
            try {
                const res = await fetch('/api/permissions/global')
                const data = await res.json()
                if (active && res.ok) {
                    setUserCreationDisabled(Boolean(data.panelUserCreation?.blocked))
                }
            } catch (error) {
                console.error('Failed to fetch permission state', error)
            }
        }

        fetchPermissionState()

        return () => {
            active = false
        }
    }, [])

    if (!data) {
        return <div className="p-8 text-center text-red-500">{t.common?.error || 'Failed to load data'}</div>
    }

    const { stats, recentUsers, recentActions } = data

    return (
        <div className="flex-1 space-y-8 p-8 pt-6">
            <div className="flex items-center justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">{t.manager?.dashboard?.title || 'Manager Dashboard'}</h2>
                <div className="flex items-center space-x-2">
                    {userCreationDisabled ? (
                        <button
                            type="button"
                            disabled
                            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground opacity-70 cursor-not-allowed"
                            title="User creation is currently disabled"
                        >
                            User creation disabled
                        </button>
                    ) : (
                        <CreateUserDialog />
                    )}
                </div>
            </div>

            {/* Stats Cards */}
            <ManagerStats stats={stats} />

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">

                {/* Managed Users List */}
                <Card className="col-span-4">
                    <CardHeader>
                        <CardTitle>{t.manager?.dashboard?.yourUsers || 'Your Users'}</CardTitle>
                        <CardDescription>
                            {t.manager?.dashboard?.yourUsersDesc || 'List of recent users you have added'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ManagerUsersList users={recentUsers} />
                    </CardContent>
                </Card>

                {/* Recent Actions Log */}
                <Card className="col-span-3">
                    <CardHeader>
                        <CardTitle>{t.manager?.dashboard?.actionsLog || 'Activity Log'}</CardTitle>
                        <CardDescription>
                            {t.manager?.dashboard?.actionsLogDesc || 'Recent operations by you or your users'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ManagerActionsLog actions={recentActions} />
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
