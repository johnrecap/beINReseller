
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import SettingsForm from '@/components/admin/SettingsForm'
import { Settings } from 'lucide-react'

export const metadata = {
    title: 'إعدادات النظام | beIN Panel',
    description: 'التحكم في الأسعار وإعدادات النظام',
}

export default async function AdminSettingsPage() {
    const session = await auth()

    if (!session?.user || session.user.role !== 'ADMIN') {
        redirect('/dashboard')
    }

    return (
        <div className="space-y-6" dir="rtl">
            {/* Page Header */}
            <div className="flex items-center gap-3 mb-8">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-gray-600 to-gray-800 flex items-center justify-center shadow-lg">
                    <Settings className="w-6 h-6 text-white" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-foreground">إعدادات النظام</h1>
                    <p className="text-muted-foreground text-sm">التحكم في وضع الصيانة ورسائل التنبيه</p>
                </div>
            </div>

            <SettingsForm />
        </div>
    )
}
