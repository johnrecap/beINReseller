import { requireAuth } from '@/lib/auth-utils'
import StatsCards from '@/components/dashboard/StatsCards'
import RecentOperations from '@/components/dashboard/RecentOperations'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default async function DashboardPage() {
    const user = await requireAuth()

    return (
        <div className="space-y-6">
            {/* Welcome Banner */}
            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl p-6 text-white">
                <h1 className="text-2xl font-bold mb-1">مرحباً، {user.username} 👋</h1>
                <p className="text-purple-200">
                    {user.role === 'ADMIN' ? 'مرحباً بك في لوحة تحكم الإدارة' : 'استمتع بخدماتنا المميزة'}
                </p>
            </div>

            {/* Stats Cards - Client Component */}
            <StatsCards />

            {/* Two Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Recent Operations */}
                <RecentOperations />

                {/* Quick Actions */}
                <Card className="bg-white border-0 shadow-lg">
                    <CardHeader>
                        <CardTitle className="text-lg text-gray-800">الإجراءات السريعة</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <a
                            href="/dashboard/operations"
                            className="flex items-center gap-4 p-4 rounded-xl bg-gradient-to-r from-purple-50 to-purple-100 hover:from-purple-100 hover:to-purple-200 transition-all group"
                        >
                            <div className="w-12 h-12 rounded-xl bg-purple-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                                <span className="text-2xl">⚡</span>
                            </div>
                            <div>
                                <p className="font-semibold text-gray-800">تجديد اشتراك</p>
                                <p className="text-sm text-gray-500">جدد اشتراك بطاقة beIN</p>
                            </div>
                        </a>

                        <a
                            href="/dashboard/operations"
                            className="flex items-center gap-4 p-4 rounded-xl bg-gradient-to-r from-emerald-50 to-emerald-100 hover:from-emerald-100 hover:to-emerald-200 transition-all group"
                        >
                            <div className="w-12 h-12 rounded-xl bg-emerald-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                                <span className="text-2xl">🔍</span>
                            </div>
                            <div>
                                <p className="font-semibold text-gray-800">استعلام رصيد</p>
                                <p className="text-sm text-gray-500">تحقق من رصيد البطاقة</p>
                            </div>
                        </a>

                        <a
                            href="/dashboard/operations"
                            className="flex items-center gap-4 p-4 rounded-xl bg-gradient-to-r from-amber-50 to-amber-100 hover:from-amber-100 hover:to-amber-200 transition-all group"
                        >
                            <div className="w-12 h-12 rounded-xl bg-amber-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                                <span className="text-2xl">📡</span>
                            </div>
                            <div>
                                <p className="font-semibold text-gray-800">تنشيط إشارة</p>
                                <p className="text-sm text-gray-500">أعد تنشيط الإشارة</p>
                            </div>
                        </a>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
