import { PanelCommandState } from './panel-command-state'
import { withRequestDeadline } from './request-deadline'

export interface PanelCommandInput {
    action: string
    resources: readonly string[]
    attempt: string
    url: string
    init: RequestInit
    /** In-memory UI label only; never passed to the receipt store. */
    displayLabel?: string
    /** Only an endpoint's documented pre-effect rejection may release its claim. */
    knownRejection?: (response: Response, body: unknown) => boolean
}

/** Request ownership lives above forms. A route unmount never cancels this owner. */
export class PanelCommandRunner {
    constructor(readonly state: PanelCommandState, private readonly send: typeof fetch = fetch,
        private readonly deadlineMs = 45_000) {}

    async request(input: PanelCommandInput): Promise<Response> {
        // Current panel contracts use serialized JSON. Reject mutable payloads rather than
        // retaining FormData/streams or allowing a later draft to change the submission.
        if (input.init.body != null && typeof input.init.body !== 'string') throw new Error('COMMAND_BODY_NOT_IMMUTABLE')
        const init = { ...input.init, headers: new Headers(input.init.headers), body: input.init.body }
        const { attempt, url, knownRejection } = input
        this.state.claim(input.action, input.resources, attempt)
        try {
            const { response, body } = await withRequestDeadline(async signal => {
                const response = await this.send(url, { ...init, signal })
                const body: unknown = await response.clone().json()
                return { response, body }
            }, this.deadlineMs)
            // The transport cannot infer nonexecution from arbitrary 4xx/5xx or a GET.
            const explicitlyFailed = typeof body === 'object' && body !== null && 'success' in body && body.success === false
            const state = response.ok && !explicitlyFailed ? 'SUCCEEDED' :
                knownRejection?.(response, body) === true ? 'FAILED' : 'UNCERTAIN'
            this.state.settle(attempt, state)
            return response
        } catch {
            this.state.settle(attempt, 'UNCERTAIN')
            throw new Error('COMMAND_UNCONFIRMED')
        }
    }
}
