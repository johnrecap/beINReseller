import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import BeINConfigForm from '@/components/admin/BeINConfigForm'
import { Bot } from 'lucide-react'

export const metadata = {
    title: 'إعدادات روبوت beIN | beIN Panel',
    description: 'ضبط إعدادات الأتمتة والربط مع موقع beIN',
}

export default async function BeINConfigPage() {
    const session = await auth()

    if (!session?.user || session.user.role !== 'ADMIN') {
        redirect('/dashboard')
    }

    return (
        <div className="space-y-6" dir="rtl">
            {/* Page Header */}
            <div className="flex items-center gap-3 mb-8">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center shadow-lg">
                    <Bot className="w-6 h-6 text-white" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-foreground">إعدادات روبوت beIN</h1>
                    <p className="text-muted-foreground text-sm">ضبط بيانات الدخول والمحددات للأتمتة</p>
                </div>
            </div>

            {/* Info Banner */}
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex gap-3">
                <div className="text-2xl">💡</div>
                <div>
                    <p className="text-blue-800 font-medium">كيف تحصل على المحددات (Selectors)؟</p>
                    <p className="text-blue-600 text-sm mt-1">
                        افتح صفحة beIN في متصفحك → اضغط F12 → اختر العنصر المطلوب → انسخ الـ CSS Selector
                    </p>
                </div>
            </div>

            <Suspense fallback={<div>جاري التحميل...</div>}>
                <BeINConfigForm />
            </Suspense>
        </div>
    )
}
