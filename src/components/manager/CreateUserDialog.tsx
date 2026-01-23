"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { Loader2, Plus, AlertTriangle } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"

const EMAIL_DOMAIN = "@deshpanel.com"

const formSchema = z.object({
    username: z.string().min(3, "اسم المستخدم يجب أن يكون 3 أحرف على الأقل"),
    email: z.string()
        .email("البريد الإلكتروني غير صالح")
        .refine(
            (email) => email.endsWith(EMAIL_DOMAIN),
            `البريد الإلكتروني يجب أن ينتهي بـ ${EMAIL_DOMAIN}`
        ),
    password: z.string().min(6, "كلمة المرور يجب أن تكون 6 أحرف على الأقل"),
    balance: z.number().min(0, "الرصيد يجب أن يكون 0 أو أكثر"),
})

type FormData = z.infer<typeof formSchema>

export function CreateUserDialog() {
    const [open, setOpen] = useState(false)
    const [emailWarning, setEmailWarning] = useState("")
    const router = useRouter()

    const form = useForm<FormData>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            username: "",
            email: "",
            password: "",
            balance: 0,
        },
    })

    const { isSubmitting } = form.formState
    const watchUsername = form.watch("username")
    const watchEmail = form.watch("email")

    // Generate email from username when user finishes typing
    const handleUsernameBlur = () => {
        const currentEmail = form.getValues("email")
        if (watchUsername && watchUsername.length >= 3 && !currentEmail) {
            form.setValue("email", `${watchUsername}${EMAIL_DOMAIN}`)
        }
    }

    // Show warning for non-standard email format
    useEffect(() => {
        if (watchEmail && watchEmail.length > 0) {
            if (!watchEmail.endsWith(EMAIL_DOMAIN)) {
                setEmailWarning(`الصيغة الصحيحة: اسم_المستخدم${EMAIL_DOMAIN}`)
            } else {
                setEmailWarning("")
            }
        } else {
            setEmailWarning("")
        }
    }, [watchEmail])

    async function onSubmit(values: FormData) {
        try {
            const response = await fetch("/api/manager/users", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(values),
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.error || "فشل إنشاء المستخدم")
            }

            toast.success("تم إنشاء المستخدم بنجاح")
            setOpen(false)
            form.reset()
            router.refresh()

        } catch (error) {
            toast.error(error instanceof Error ? error.message : "حدث خطأ ما")
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button>
                    <Plus className="ml-2 h-4 w-4" />
                    إضافة مستخدم
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>إضافة مستخدم جديد</DialogTitle>
                    <DialogDescription>
                        قم بإنشاء حساب جديد وربطه بحسابك مباشرة.
                    </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <FormField
                            control={form.control}
                            name="username"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>اسم المستخدم</FormLabel>
                                    <FormControl>
                                        <Input
                                            placeholder="user123"
                                            {...field}
                                            onBlur={() => {
                                                field.onBlur()
                                                handleUsernameBlur()
                                            }}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="email"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>البريد الإلكتروني</FormLabel>
                                    <FormControl>
                                        <Input
                                            type="email"
                                            placeholder={`example${EMAIL_DOMAIN}`}
                                            {...field}
                                        />
                                    </FormControl>
                                    {emailWarning && (
                                        <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400 text-xs">
                                            <AlertTriangle className="w-3 h-3" />
                                            <span>{emailWarning}</span>
                                        </div>
                                    )}
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="password"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>كلمة المرور</FormLabel>
                                    <FormControl>
                                        <Input type="password" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="balance"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>الرصيد الأولي</FormLabel>
                                    <FormControl>
                                        <Input type="number" step="0.01" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <DialogFooter>
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                إنشاء
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    )
}
