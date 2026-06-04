import { NextResponse } from "next/server"
import {
    getLoginAttemptContextFromRequest,
    getLoginAttemptStatus,
    normalizeSubmittedLoginName,
} from "@/lib/auth/login-attempts"

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}))
        const loginName = normalizeSubmittedLoginName(body?.loginName)

        if (!loginName) {
            return NextResponse.json({
                status: "missing_input",
                remainingAttempts: 3,
                cooldownSeconds: 0,
                canRetry: true,
            })
        }

        const status = await getLoginAttemptStatus({
            loginName,
            ...getLoginAttemptContextFromRequest(request),
        })

        if (status.status === "cooldown_active") {
            return NextResponse.json({
                status: "cooldown_active",
                remainingAttempts: 0,
                cooldownSeconds: status.cooldownSeconds,
                canRetry: false,
            })
        }

        return NextResponse.json({
            status: "invalid_credentials",
            remainingAttempts: status.remainingAttempts,
            cooldownSeconds: 0,
            canRetry: true,
        })
    } catch {
        return NextResponse.json({
            status: "unexpected_error",
            remainingAttempts: null,
            cooldownSeconds: 0,
            canRetry: true,
        }, { status: 200 })
    }
}
