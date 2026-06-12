export const EGYPT_TIME_ZONE = 'Africa/Cairo'

type DateBoundary = 'start' | 'end'

type CairoDateTimeParts = {
    year: number
    month: number
    day: number
    hour: number
    minute: number
    second: number
    millisecond: number
}

function pad(value: number): string {
    return String(value).padStart(2, '0')
}

function getTimeZoneParts(date: Date) {
    const formatter = new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
        timeZone: EGYPT_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
    })

    const values = Object.fromEntries(
        formatter.formatToParts(date)
            .filter((part) => part.type !== 'literal')
            .map((part) => [part.type, Number(part.value)])
    )

    return {
        year: values.year,
        month: values.month,
        day: values.day,
        hour: values.hour,
        minute: values.minute,
        second: values.second,
    }
}

function getTimeZoneOffsetMs(date: Date): number {
    const parts = getTimeZoneParts(date)
    const asUtc = Date.UTC(
        parts.year,
        parts.month - 1,
        parts.day,
        parts.hour,
        parts.minute,
        parts.second
    )

    return asUtc - (date.getTime() - date.getMilliseconds())
}

function cairoPartsToUtcDate(parts: CairoDateTimeParts): Date {
    const localAsUtc = Date.UTC(
        parts.year,
        parts.month - 1,
        parts.day,
        parts.hour,
        parts.minute,
        parts.second,
        parts.millisecond
    )
    const firstPass = new Date(localAsUtc - getTimeZoneOffsetMs(new Date(localAsUtc)))
    const secondPass = new Date(localAsUtc - getTimeZoneOffsetMs(firstPass))

    return secondPass
}

function cairoPartsMatch(date: Date, parts: CairoDateTimeParts): boolean {
    const cairoParts = getTimeZoneParts(date)

    return (
        cairoParts.year === parts.year &&
        cairoParts.month === parts.month &&
        cairoParts.day === parts.day &&
        cairoParts.hour === parts.hour &&
        cairoParts.minute === parts.minute &&
        cairoParts.second === parts.second &&
        date.getUTCMilliseconds() === parts.millisecond
    )
}

function findUtcMatchesForCairoParts(parts: CairoDateTimeParts): Date[] {
    const localAsUtc = Date.UTC(
        parts.year,
        parts.month - 1,
        parts.day,
        parts.hour,
        parts.minute,
        parts.second,
        parts.millisecond
    )
    const matches = new Map<number, Date>()

    for (let offsetMinutes = -12 * 60; offsetMinutes <= 14 * 60; offsetMinutes += 15) {
        const candidate = new Date(localAsUtc - offsetMinutes * 60_000)
        if (cairoPartsMatch(candidate, parts)) {
            matches.set(candidate.getTime(), candidate)
        }
    }

    return Array.from(matches.values()).sort((left, right) => left.getTime() - right.getTime())
}

function cairoPartsToUtcDateForBoundary(parts: CairoDateTimeParts, boundary: DateBoundary): Date {
    const matches = findUtcMatchesForCairoParts(parts)
    if (matches.length === 0) {
        return cairoPartsToUtcDate(parts)
    }

    return boundary === 'start' ? matches[0] : matches[matches.length - 1]
}

function parseDateInput(value: string) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
    if (!match) return null

    return {
        year: Number(match[1]),
        month: Number(match[2]),
        day: Number(match[3]),
    }
}

function parseDateTimeLocalInput(value: string) {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
    if (!match) return null

    return {
        year: Number(match[1]),
        month: Number(match[2]),
        day: Number(match[3]),
        hour: Number(match[4]),
        minute: Number(match[5]),
    }
}

export function utcIsoToCairoDateTimeLocal(value: string | null): string {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''

    const parts = getTimeZoneParts(date)
    return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`
}

export function cairoDateTimeLocalToUtcIso(value: string): string | null {
    const parts = parseDateTimeLocalInput(value)
    if (!parts) return null

    return cairoPartsToUtcDate({
        ...parts,
        second: 0,
        millisecond: 0,
    }).toISOString()
}

export function utcIsoToCairoDateInput(value: string | null): string {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''

    const parts = getTimeZoneParts(date)
    return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`
}

export function cairoDateInputToUtcIso(value: string, boundary: DateBoundary): string | null {
    const parts = parseDateInput(value)
    if (!parts) return null

    return cairoPartsToUtcDate({
        ...parts,
        hour: boundary === 'start' ? 0 : 23,
        minute: boundary === 'start' ? 0 : 59,
        second: boundary === 'start' ? 0 : 59,
        millisecond: boundary === 'start' ? 0 : 999,
    }).toISOString()
}

export function cairoDateRangeToUtcIso(from: string, to: string): { from: string | null; to: string | null } {
    return {
        from: cairoDateInputToUtcIso(from, 'start'),
        to: cairoDateInputToUtcIso(to, 'end'),
    }
}

function cairoLocalInputToUtcIso(value: string, boundary: DateBoundary): string | null {
    const dateTimeParts = parseDateTimeLocalInput(value)
    if (dateTimeParts) {
        return cairoPartsToUtcDateForBoundary({
            ...dateTimeParts,
            second: boundary === 'start' ? 0 : 59,
            millisecond: boundary === 'start' ? 0 : 999,
        }, boundary).toISOString()
    }

    return cairoDateInputToUtcIso(value, boundary)
}

export function cairoLocalRangeToUtcIso(from: string, to: string): { from: string | null; to: string | null } {
    return {
        from: cairoLocalInputToUtcIso(from, 'start'),
        to: cairoLocalInputToUtcIso(to, 'end'),
    }
}

export function currentCairoDateInput(now = new Date()): string {
    return utcIsoToCairoDateInput(now.toISOString())
}

export function addDaysToCairoDateInput(value: string, days: number): string {
    const parts = parseDateInput(value)
    if (!parts) return ''

    const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 12, 0, 0, 0))
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

export function startOfCairoMonthDateInput(value: string): string {
    const parts = parseDateInput(value)
    if (!parts) return ''

    return `${parts.year}-${pad(parts.month)}-01`
}
