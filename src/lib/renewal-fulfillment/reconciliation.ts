export const RENEWAL_FULFILLMENT_APPLY_CONFIRMATION = 'APPLY_FULFILLMENT_SAFETY_ISSUES'

export type RenewalFulfillmentReconciliationArgs = {
    from: Date
    to: Date
    cardNumber?: string
    duplicateWindowMinutes: number
    apply: boolean
}

export type RenewalChargeRecord = {
    operationId: string
    cardNumber: string
    packageName: string | null
    amount: number
    chargedAt: Date
}

export type DuplicateRenewalBurst = {
    cardNumber: string
    packageName: string | null
    amount: number
    operationIds: string[]
    firstChargedAt: Date
    lastChargedAt: Date
}

const VALUE_FLAGS = new Set([
    '--from',
    '--to',
    '--card',
    '--duplicate-window-minutes',
    '--confirm',
])

const BOOLEAN_FLAGS = new Set(['--apply'])

function parseFlags(args: string[]): Map<string, string | true> {
    const parsed = new Map<string, string | true>()
    for (let index = 0; index < args.length; index += 1) {
        const flag = args[index]!
        if (!flag.startsWith('--')) throw new Error(`Unexpected positional argument: ${flag}`)
        if (!VALUE_FLAGS.has(flag) && !BOOLEAN_FLAGS.has(flag)) {
            throw new Error(`Unknown reconciliation flag: ${flag}`)
        }
        if (parsed.has(flag)) throw new Error(`Duplicate reconciliation flag: ${flag}`)

        if (BOOLEAN_FLAGS.has(flag)) {
            parsed.set(flag, true)
            continue
        }

        const value = args[index + 1]
        if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
        parsed.set(flag, value)
        index += 1
    }
    return parsed
}

function flagValue(flags: Map<string, string | true>, flag: string): string | undefined {
    const value = flags.get(flag)
    return typeof value === 'string' ? value : undefined
}

function parseBoundedDate(value: string | undefined, flag: string): Date {
    if (!value) throw new Error(`${flag} is required`)
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
        throw new Error(`${flag} must be an ISO timestamp with an explicit UTC offset or Z`)
    }
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) throw new Error(`${flag} must be a valid timestamp`)
    return parsed
}

export function parseRenewalFulfillmentReconciliationArgs(
    args: string[]
): RenewalFulfillmentReconciliationArgs {
    const flags = parseFlags(args)
    const fromRaw = flagValue(flags, '--from')
    const toRaw = flagValue(flags, '--to')
    if (!fromRaw || !toRaw) throw new Error('--from and --to are required')

    const from = parseBoundedDate(fromRaw, '--from')
    const to = parseBoundedDate(toRaw, '--to')
    if (to <= from) throw new Error('--to must be after --from')
    if (to.getTime() - from.getTime() > 31 * 24 * 60 * 60 * 1000) {
        throw new Error('Reconciliation range cannot exceed 31 days')
    }

    const cardNumber = flagValue(flags, '--card')?.trim()
    if (cardNumber && !/^\d{10,16}$/.test(cardNumber)) {
        throw new Error('--card must contain 10 to 16 digits')
    }

    const duplicateWindowRaw = flagValue(flags, '--duplicate-window-minutes')
    const duplicateWindowMinutes = duplicateWindowRaw === undefined
        ? 10
        : Number(duplicateWindowRaw)
    if (
        !Number.isInteger(duplicateWindowMinutes) ||
        duplicateWindowMinutes < 1 ||
        duplicateWindowMinutes > 1440
    ) {
        throw new Error('--duplicate-window-minutes must be an integer from 1 to 1440')
    }

    const apply = flags.get('--apply') === true
    if (apply && flagValue(flags, '--confirm') !== RENEWAL_FULFILLMENT_APPLY_CONFIRMATION) {
        throw new Error(`--apply requires --confirm ${RENEWAL_FULFILLMENT_APPLY_CONFIRMATION}`)
    }

    return {
        from,
        to,
        ...(cardNumber ? { cardNumber } : {}),
        duplicateWindowMinutes,
        apply,
    }
}

function normalizedPackageName(value: string | null): string {
    return value?.trim().toLowerCase().replace(/\s+/g, ' ') || '<unknown>'
}

export function findDuplicateRenewalBursts(
    records: RenewalChargeRecord[],
    windowMinutes = 10
): DuplicateRenewalBurst[] {
    const windowMs = windowMinutes * 60 * 1000
    const grouped = new Map<string, RenewalChargeRecord[]>()

    for (const record of records) {
        const key = [
            record.cardNumber,
            normalizedPackageName(record.packageName),
            record.amount.toFixed(2),
        ].join('|')
        grouped.set(key, [...(grouped.get(key) || []), record])
    }

    const bursts: DuplicateRenewalBurst[] = []
    for (const group of grouped.values()) {
        const sorted = [...group].sort((left, right) => left.chargedAt.getTime() - right.chargedAt.getTime())
        let current: RenewalChargeRecord[] = []
        for (const record of sorted) {
            if (current.length === 0 || record.chargedAt.getTime() - current[current.length - 1]!.chargedAt.getTime() <= windowMs) {
                current.push(record)
            } else {
                if (current.length > 1) bursts.push(toBurst(current))
                current = [record]
            }
        }
        if (current.length > 1) bursts.push(toBurst(current))
    }

    return bursts
}

function toBurst(records: RenewalChargeRecord[]): DuplicateRenewalBurst {
    const first = records[0]!
    const last = records[records.length - 1]!
    return {
        cardNumber: first.cardNumber,
        packageName: first.packageName,
        amount: first.amount,
        operationIds: records.map((record) => record.operationId),
        firstChargedAt: first.chargedAt,
        lastChargedAt: last.chargedAt,
    }
}
