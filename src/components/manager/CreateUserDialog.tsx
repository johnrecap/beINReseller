"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { Loader2, Plus, AlertTriangle, Wallet } from "lucide-react"
import { toast } from "sonner"
import { useTranslation } from "@/hooks/useTranslation"

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

export function CreateUserDialog() {
    const [open, setOpen] = useState(false)
    const [emailWarning, setEmailWarning] = useState("")
    const [managerBalance, setManagerBalance] = useState<number | null>(null)
    const [loadingBalance, setLoadingBalance] = useState(false)
    const router = useRouter()
    const { t, language } = useTranslation()

    // Dynamic validation schema with translations
    const formSchema = z.object({
        username: z.string().min(3, t.manager?.dialogs?.createUser?.usernameMinError || "Username must be at least 3 characters"),
        email: z.string()
            .email(t.manager?.dialogs?.createUser?.emailInvalid || "Invalid email address")
            .refine(
                (email) => email.endsWith(EMAIL_DOMAIN),
                `${t.manager?.dialogs?.createUser?.emailMustEndWith || 'Email must end with'} ${EMAIL_DOMAIN}`
            ),
        password: z.string().min(6, t.manager?.dialogs?.createUser?.passwordMinError || "Password must be at least 6 characters"),
        balance: z.number().min(0, t.manager?.dialogs?.createUser?.balanceMinError || "Balance must be 0 or more"),
    })

    type FormData = z.infer<typeof formSchema>

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
    const watchBalance = form.watch("balance")

    // Fetch manager's balance when dialog opens
    const fetchManagerBalance = useCallback(async () => {
        setLoadingBalance(true)
        try {
            const response = await fetch("/api/manager/dashboard")
            if (response.ok) {
                const data = await response.json()
                setManagerBalance(data.stats?.managerBalance || 0)
            }
        } catch (error) {
            console.error("Failed to fetch manager balance:", error)
        } finally {
            setLoadingBalance(false)
        }
    }, [])

    useEffect(() => {
        if (open) {
            fetchManagerBalance()
        }
    }, [open, fetchManagerBalance])

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
                setEmailWarning(`${t.manager?.dialogs?.createUser?.correctFormat || 'Correct format'}: username${EMAIL_DOMAIN}`)
            } else {
                setEmailWarning("")
            }
        } else {
            setEmailWarning("")
        }
    }, [watchEmail, t, language])

    // Check if balance exceeds manager's available balance
    const isBalanceExceeding = managerBalance !== null && watchBalance > managerBalance
    const isBalanceCloseToLimit = managerBalance !== null && !isBalanceExceeding && watchBalance > managerBalance * 0.8

    async function onSubmit(values: FormData) {
        try {
            const response = await fetch("/api/manager/users", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(values),
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.error || t.manager?.messages?.error || "Failed to create user")
            }

            toast.success(t.manager?.messages?.userCreated || "User created successfully")
            setOpen(false)
            form.reset()
            router.refresh()

        } catch (error) {
            toast.error(error instanceof Error ? error.message : (t.manager?.messages?.error || "An error occurred"))
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button>
                    <Plus className="ml-2 h-4 w-4" />
                    {t.manager?.users?.addUser || 'Add User'}
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>{t.manager?.dialogs?.createUser?.title || 'Add New User'}</DialogTitle>
                    <DialogDescription>
                        {t.manager?.dialogs?.createUser?.description || 'Create a new account and link it to your account directly.'}
                    </DialogDescription>
                </DialogHeader>

                {/* Manager Balance Display */}
                <div className="flex items-center justify-between px-3 py-2 bg-muted rounded-lg border">
                    <div className="flex items-center gap-2">
                        <Wallet className="h-4 w-4 text-[#00A651]" />
                        <span className="text-sm text-muted-foreground">{t.manager?.dialogs?.createUser?.availableBalance || 'Your available balance'}:</span>
                    </div>
                    {loadingBalance ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                        <span className="font-bold text-[#00A651]">
                            ${managerBalance?.toFixed(2) || "0.00"}
                        </span>
                    )}
                </div>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <FormField
                            control={form.control}
                            name="username"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t.manager?.dialogs?.createUser?.username || 'Username'}</FormLabel>
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
                                    <FormLabel>{t.manager?.dialogs?.createUser?.email || 'Email'}</FormLabel>
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
                                    <FormLabel>{t.manager?.dialogs?.createUser?.password || 'Password'}</FormLabel>
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
                                    <FormLabel>{t.manager?.dialogs?.createUser?.initialBalance || 'Initial Balance'}</FormLabel>
                                    <FormControl>
                                        <Input
                                            type="number"
                                            step="0.01"
                                            {...field}
                                            onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                                        />
                                    </FormControl>
                                    {isBalanceExceeding && (
                                        <div className="flex items-center gap-1 text-red-600 dark:text-red-400 text-xs">
                                            <AlertTriangle className="w-3 h-3" />
                                            <span>{t.manager?.dialogs?.createUser?.balanceExceeds || 'Requested balance exceeds your available balance!'}</span>
                                        </div>
                                    )}
                                    {isBalanceCloseToLimit && (
                                        <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400 text-xs">
                                            <AlertTriangle className="w-3 h-3" />
                                            <span>{t.manager?.dialogs?.createUser?.balanceLowWarning || 'Warning: Your balance will be low after this transfer'}</span>
                                        </div>
                                    )}
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <DialogFooter>
                            <Button
                                type="submit"
                                disabled={isSubmitting || isBalanceExceeding}
                            >
                                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {t.manager?.dialogs?.createUser?.create || 'Create'}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    )
}
