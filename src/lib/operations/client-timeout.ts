type TimeoutFetch = (url: string, init: RequestInit) => Promise<Response>

export async function requestPrePayOperationExpiry(
    operationId: string,
    fetcher: TimeoutFetch = fetch
): Promise<boolean> {
    if (!operationId) return false

    const response = await fetcher(`/api/operations/${operationId}/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unloading: true }),
        keepalive: true,
    })

    return response.ok || response.status === 404 || response.status === 409 || response.status === 410
}
