/** Bound the entire request, including response decoding. Aborting locally does
 * not establish whether the server accepted a command; callers retain its ID. */
export async function withRequestDeadline<T>(
    run: (signal: AbortSignal) => Promise<T>, timeoutMs = 45_000, parent?: AbortSignal
): Promise<T> {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    let abortParent: (() => void) | undefined
    const cancelled = new Promise<never>((_resolve, reject) => {
        const abort = (reason: unknown) => { controller.abort(reason); reject(reason) }
        abortParent = () => abort(parent?.reason ?? new Error('REQUEST_ABORTED'))
        if (parent?.aborted) { abortParent(); return }
        parent?.addEventListener('abort', abortParent, { once: true })
        timer = setTimeout(() => abort(new Error('REQUEST_TIMEOUT')), Math.max(0, timeoutMs))
    })
    try {
        return await Promise.race([cancelled, Promise.resolve().then(() => {
            if (controller.signal.aborted) throw controller.signal.reason
            return run(controller.signal)
        })])
    } finally {
        clearTimeout(timer)
        if (abortParent) parent?.removeEventListener('abort', abortParent)
    }
}
