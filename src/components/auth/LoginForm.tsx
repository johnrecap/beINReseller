'use client'

import { useEffect, useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Loader2, User, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react'
import { useTranslation } from '@/hooks/useTranslation'
import {
    getLoginFeedbackMessage,
    mapAuthErrorToLoginFeedback,
    type LoginFeedback,
} from '@/components/auth/loginFeedback'

import { FloatingInput } from '@/components/ui/FloatingInput'
import { safePanelRedirect } from '@/lib/auth/safe-panel-redirect'
import { withRequestDeadline } from '@/lib/request-deadline'

async function fetchLoginAttemptFeedback(loginName: string): Promise<LoginFeedback | null> {
    try {
        return await withRequestDeadline(async (signal) => {
            const response = await fetch('/api/auth/login-attempt-status', {
                signal,
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ loginName }),
            })
            if (!response.ok) {
                return null
            }

            const data = await response.json()
            if (data.status === 'cooldown_active') {
                return {
                    status: 'cooldown_active',
                    cooldownSeconds: Number(data.cooldownSeconds) || 0,
                }
            }

            if (data.status === 'invalid_credentials') {
                return {
                    status: 'invalid_credentials',
                    remainingAttempts: typeof data.remainingAttempts === 'number' ? data.remainingAttempts : undefined,
                }
            }

            return mapAuthErrorToLoginFeedback(data.status)
        }, 5_000)
    } catch {
        return null
    }
}

export default function LoginForm() {
    const { t } = useTranslation()
    const router = useRouter()
    const searchParams = useSearchParams()
    const requestedCallback = searchParams.get('callbackUrl')

    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [feedback, setFeedback] = useState<LoginFeedback | null>(null)
    const [cooldownSeconds, setCooldownSeconds] = useState(0)
    const [cooldownLoginName, setCooldownLoginName] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const submittedLoginName = username.trim()
    const isCooldownActive = cooldownSeconds > 0 && submittedLoginName === cooldownLoginName
    const visibleFeedback = feedback?.status === 'cooldown_active' && !isCooldownActive ? null : feedback

    useEffect(() => {
        if (cooldownSeconds <= 0) {
            return
        }

        const timer = window.setInterval(() => {
            setCooldownSeconds(previous => Math.max(0, previous - 1))
        }, 1_000)

        return () => window.clearInterval(timer)
    }, [cooldownSeconds])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setFeedback(null)

        if (isCooldownActive) {
            setFeedback({ status: 'cooldown_active', cooldownSeconds })
            return
        }

        setIsLoading(true)

        try {
            const callbackUrl = safePanelRedirect(requestedCallback, window.location.origin)
            const result = await signIn('credentials', {
                username: submittedLoginName,
                password,
                redirect: false,
                redirectTo: callbackUrl,
            })

            if (!result?.ok || result.error) {
                const primary = mapAuthErrorToLoginFeedback(result?.code || result?.error)
                const attemptFeedback = primary.status === 'invalid_credentials' || primary.status === 'cooldown_active'
                    ? await fetchLoginAttemptFeedback(submittedLoginName) : null
                const nextFeedback = attemptFeedback || primary
                setFeedback(nextFeedback)

                if (nextFeedback.status === 'cooldown_active') {
                    setCooldownSeconds(nextFeedback.cooldownSeconds || 0)
                    setCooldownLoginName(submittedLoginName)
                }
            } else {
                setCooldownSeconds(0)
                setCooldownLoginName('')
                router.push(callbackUrl)
                router.refresh()
            }
        } catch {
            setFeedback({ status: 'unexpected_error' })
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6 w-full">
            {/* Error Alert */}
            {visibleFeedback && (
                <div id="login-feedback" role="alert" className="bg-red-500/10 border border-red-500/20 text-red-200 text-sm px-4 py-3 rounded-xl flex items-center gap-2 animate-in slide-in-from-top-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{getLoginFeedbackMessage({
                        ...visibleFeedback,
                        cooldownSeconds: visibleFeedback.status === 'cooldown_active'
                            ? cooldownSeconds
                            : visibleFeedback.cooldownSeconds,
                    }, t.auth)}</span>
                </div>
            )}

            <div className="space-y-5">
                {/* Username Field */}
                <FloatingInput
                    id="username"
                    autoComplete="username"
                    aria-describedby={visibleFeedback ? 'login-feedback' : undefined}
                    panel
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
                        autoComplete="current-password"
                        aria-describedby={visibleFeedback ? 'login-feedback' : undefined}
                        panel
                        className="pe-12"
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
                        aria-label={showPassword ? t.panelUi.hidePassword : t.panelUi.showPassword}
                        aria-pressed={showPassword}
                        className="absolute end-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors p-2 z-20"
                    >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                </div>
            </div>

            {/* Submit Button */}
            <Button
                type="submit"
                disabled={isLoading || isCooldownActive}
                className="simple-button w-full h-14 text-white font-bold text-lg"
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
                <p className="max-w-sm text-center text-xs leading-5 text-slate-500">
                    {t.passwordReset.forgotPasswordContactSupervisor}
                </p>
            </div>
        </form>
    )
}

