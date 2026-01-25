import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import DeletedUsersTable from '@/components/admin/users/DeletedUsersTable'
import { DeletedUsersPageHeader, LoadingState } from '@/components/shared/DeletedUsersPageHeader'

export const metadata = {
    title: 'Deleted Accounts | beIN Panel',
    description: 'View deleted accounts with balance and transactions',
}

export default async function DeletedUsersPage() {
    const session = await auth()

    if (!session?.user || session.user.role !== 'ADMIN') {
        redirect('/dashboard')
    }

    return (
        <DeletedUsersPageHeader>
            <Suspense fallback={<LoadingState />}>
                <DeletedUsersTable />
            </Suspense>
        </DeletedUsersPageHeader>
    )
}
