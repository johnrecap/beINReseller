const WHATSAPP_GROUP_INVITE_PATH = /^\/(?:invite\/)?[A-Za-z0-9_-]+\/?$/

export function normalizeWhatsAppGroupInviteUrl(
    value: string | null | undefined,
): string | null {
    const trimmed = value?.trim()
    if (!trimmed) return null

    try {
        const url = new URL(trimmed)
        if (
            url.protocol !== 'https:'
            || url.hostname !== 'chat.whatsapp.com'
            || url.port
            || url.username
            || url.password
            || !WHATSAPP_GROUP_INVITE_PATH.test(url.pathname)
        ) {
            return null
        }
        return url.toString()
    } catch {
        return null
    }
}
