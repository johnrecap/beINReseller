import Link from "next/link"
import { ShieldAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"

export default function AccessDenied() {
    return (
        <div className="flex min-h-[60vh] items-center justify-center p-4">
            <Card className="w-full max-w-md border-destructive/50 text-center shadow-lg">
                <CardHeader className="flex flex-col items-center gap-4 pb-2">
                    <div className="rounded-full bg-destructive/10 p-4">
                        <ShieldAlert className="h-12 w-12 text-destructive" />
                    </div>
                    <CardTitle className="text-xl text-destructive">غير مصرح بالوصول</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground">
                        عذراً، ليس لديك الصلاحيات الكافية لعرض هذه الصفحة.
                        يرجى التواصل مع المسؤول إذا كنت تعتقد أن هذا خطأ.
                    </p>
                </CardContent>
                <CardFooter className="justify-center pt-2">
                    <Link href="/dashboard">
                        <Button variant="outline">
                            العودة للرئيسية
                        </Button>
                    </Link>
                </CardFooter>
            </Card>
        </div>
    )
}
