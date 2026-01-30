/**
 * App Settings Page
 */

import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import PageHeader from '@/components/shared/PageHeader'
import { Card, CardContent } from '@/components/ui/card'
import { Settings } from 'lucide-react'
import { StoreSettingsForm } from '@/components/admin/store/StoreSettingsForm'

async function getSettings() {
    const settings = await prisma.storeSetting.findMany()
    
    // Convert to object for easier access
    const settingsObj: Record<string, string> = {}
    settings.forEach(s => {
        settingsObj[s.key] = s.value
    })
    
    return settingsObj
}

async function SettingsContent() {
    const settings = await getSettings()
    return <StoreSettingsForm settings={settings} />
}

export default async function StoreSettingsPage() {
    const session = await auth()
    
    if (!session?.user || session.user.role !== 'ADMIN') {
        redirect('/dashboard')
    }

    return (
        <div className="space-y-6">
            <PageHeader
                icon={<Settings className="w-6 h-6 text-white" />}
                title="App Settings"
                subtitle="Configure Desh Store app settings, pricing, and Stripe integration"
            />
            
            <Suspense fallback={
                <Card>
                    <CardContent className="p-6">
                        <div className="animate-pulse space-y-4">
                            <div className="h-10 bg-muted rounded w-1/3" />
                            <div className="h-48 bg-muted/50 rounded w-full" />
                        </div>
                    </CardContent>
                </Card>
            }>
                <SettingsContent />
            </Suspense>
        </div>
    )
}
