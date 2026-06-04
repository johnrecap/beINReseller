export type LoginFeedbackStatus =
    | "invalid_credentials"
    | "cooldown_active"
    | "missing_input"
    | "unexpected_error"

export type LoginFeedback = {
    status: LoginFeedbackStatus
    remainingAttempts?: number
    cooldownSeconds?: number
}

type AuthTranslations = {
    invalidLogin?: string
    invalidLoginAttemptsRemaining?: string
    loginAttemptSingular?: string
    loginAttemptPlural?: string
    loginCooldown?: string
    tryAgain?: string
    unexpectedError?: string
}

export function formatCooldownClock(totalSeconds: number): string {
    const safeSeconds = Math.max(0, Math.ceil(totalSeconds))
    const minutes = Math.floor(safeSeconds / 60)
    const seconds = safeSeconds % 60

    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}

export function mapAuthErrorToLoginFeedback(error: string | null | undefined): LoginFeedback {
    if (error === "cooldown_active") {
        return { status: "cooldown_active" }
    }

    if (
        !error ||
        error === "Configuration" ||
        error === "CredentialsSignin" ||
        error === "invalid_credentials" ||
        error === "CallbackRouteError"
    ) {
        return { status: "invalid_credentials" }
    }

    return { status: "unexpected_error" }
}

export function getLoginFeedbackMessage(feedback: LoginFeedback, auth: AuthTranslations): string {
    if (feedback.status === "cooldown_active") {
        const template = auth.loginCooldown || "Too many unsuccessful attempts. Try again after {time}."
        return template.replace("{time}", formatCooldownClock(feedback.cooldownSeconds ?? 0))
    }

    if (feedback.status === "unexpected_error") {
        return auth.unexpectedError || auth.tryAgain || "Please try again."
    }

    const baseMessage = auth.invalidLogin || "Login name or password is not correct."
    if (typeof feedback.remainingAttempts === "number") {
        const template = auth.invalidLoginAttemptsRemaining || "{message} {count} {attemptsLabel} remaining."
        const attemptsLabel = feedback.remainingAttempts === 1
            ? auth.loginAttemptSingular || "attempt"
            : auth.loginAttemptPlural || "attempts"

        return template
            .replace("{message}", baseMessage)
            .replace("{count}", String(feedback.remainingAttempts))
            .replace("{attemptsLabel}", attemptsLabel)
    }

    return baseMessage
}
