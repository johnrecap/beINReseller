const DEFAULT_TELEGRAM_TIMEOUT_MS = 5000

type TelegramSendInput = {
    botToken: string
    targetId: string
    message: string
    timeoutMs?: number
}

export type TelegramSendResult = {
    providerMessageId?: string
    responseSummary: Record<string, unknown>
}

export function formatCreditRequestTelegramMessage(input: {
    requestNumber: string
    username: string
    amountUsd: number
    paymentMethod: string
    agentName: string
    sourceGroup: string
}): string {
    return [
        'Credit request created',
        '',
        `Username: ${input.username}`,
        `Amount: ${input.amountUsd} USD`,
        `Payment: ${input.paymentMethod}`,
        `Agent: ${input.agentName}`,
        `Group: ${input.sourceGroup}`,
        `Order ID: #${input.requestNumber}`,
        'Status: Pending',
    ].join('\n')
}

export async function sendTelegramMessage(input: TelegramSendInput): Promise<TelegramSendResult> {
    const timeoutMs = input.timeoutMs || DEFAULT_TELEGRAM_TIMEOUT_MS
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    try {
        const response = await fetch(`https://api.telegram.org/bot${input.botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: input.targetId,
                text: input.message,
                disable_web_page_preview: true,
            }),
            signal: controller.signal,
        })

        const responseBody = await response.json().catch(() => null)
        if (!response.ok) {
            const description = responseBody && typeof responseBody === 'object' && 'description' in responseBody
                ? String(responseBody.description)
                : `Telegram request failed with ${response.status}`
            throw new Error(description)
        }

        const result = responseBody && typeof responseBody === 'object' && 'result' in responseBody
            ? (responseBody.result as { message_id?: number })
            : null

        return {
            providerMessageId: result?.message_id ? String(result.message_id) : undefined,
            responseSummary: {
                ok: true,
                messageId: result?.message_id ?? null,
            },
        }
    } finally {
        clearTimeout(timeout)
    }
}
