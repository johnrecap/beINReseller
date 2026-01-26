import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import ManagerDeletedUsersTable from '@/components/manager/ManagerDeletedUsersTable'
import { DeletedUsersPageHeader, LoadingState } from '@/components/shared/DeletedUsersPageHeader'

export const metadata = {
    title: 'Deleted Accounts | Desh Panel',
    description: 'View deleted accounts you created',
}

export default async function ManagerDeletedUsersPage() {
    const session = await auth()

    if (!session?.user || !['MANAGER', 'ADMIN'].includes(session.user.role)) {
        redirect('/dashboard')
    }

    return (
        <DeletedUsersPageHeader>
            <Suspense fallback={<LoadingState />}>
                <ManagerDeletedUsersTable />
            </Suspense>
        </DeletedUsersPageHeader>
    )
}
