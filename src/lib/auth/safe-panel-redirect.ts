/** Accept only this panel's dashboard destinations, including query/hash. */
export function safePanelRedirect(value: string | null | undefined, origin: string): string {
    if (!value || /[\\\u0000-\u0020\u007f]/.test(value) || value.startsWith('//')) return '/dashboard'
    try {
        const url = new URL(value, origin)
        if (url.origin !== new URL(origin).origin || url.username || url.password) return '/dashboard'
        if (url.pathname !== '/dashboard' && !url.pathname.startsWith('/dashboard/')) return '/dashboard'
        return `${url.pathname}${url.search}${url.hash}`
    } catch {
        return '/dashboard'
    }
}
