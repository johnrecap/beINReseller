'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Loader2, User, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react'
import { useTranslation } from '@/hooks/useTranslation'

import Link from 'next/link'
import { FloatingInput } from '@/components/ui/FloatingInput'

export default function LoginForm() {
    const { t } = useTranslation()
    const router = useRouter()
    const searchParams = useSearchParams()
    const callbackUrl = searchParams.get('callbackUrl') || '/dashboard'

    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [error, setError] = useState('')
    const [isLoading, setIsLoading] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        setIsLoading(true)

        try {
            const result = await signIn('credentials', {
                username,
                password,
                redirect: false,
            })

            if (result?.error) {
                setError(result.error)
            } else {
                router.push(callbackUrl)
                router.refresh()
            }
        } catch {
            setError('حدث خطأ غير متوقع')
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6 w-full">
            {/* Error Alert */}
            {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-200 text-sm px-4 py-3 rounded-xl flex items-center gap-2 animate-in slide-in-from-top-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            <div className="space-y-5">
                {/* Username Field */}
                <FloatingInput
                    id="username"
                    label={t.auth.username}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={isLoading}
                    required
                    icon={<User className="h-5 w-5" />}
                />

                {/* Password Field */}
                <div className="relative">
                    <FloatingInput
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        label={t.auth.password}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={isLoading}
                        required
                        icon={<Lock className="h-5 w-5" />}
                    />
                    <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute left-3 top-1/2 -translate-y-[calc(50%-10px)] text-slate-400 hover:text-white transition-colors p-2 z-20"
                    >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                </div>
            </div>

            {/* Submit Button */}
            <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-14 bg-gradient-to-r from-[#00A651] to-[#006837] hover:from-[#008f45] hover:to-[#00582f] text-white font-bold text-lg rounded-xl shadow-[0_8px_20px_rgba(0,166,81,0.25)] hover:shadow-[0_12px_28px_rgba(0,166,81,0.35)] transition-all transform hover:scale-[1.02] active:scale-[0.98] shine-button border-none"
            >
                {isLoading ? (
                    <>
                        <Loader2 className="ml-2 h-5 w-5 animate-spin" />
                        {t.auth.loggingIn}
                    </>
                ) : (
                    t.auth.loginButton
                )}
            </Button>

            <div className="flex items-center justify-center pt-2">
                <Link href="#" className="text-xs text-slate-400 hover:text-violet-400 transition-colors">
                    {/* Forgot password text not in original, keeping it minimal/existing or just generic link if needed, 
                        original didn't have one but it's good for UX. Omitting for strict adherence to original features. */}
                </Link>
            </div>
        </form>
    )
}
