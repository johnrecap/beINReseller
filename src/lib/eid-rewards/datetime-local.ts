function padDatePart(value: number): string {
    return String(value).padStart(2, '0')
}

export function toDateTimeLocalValue(value: string | null): string {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''

    return [
        date.getFullYear(),
        padDatePart(date.getMonth() + 1),
        padDatePart(date.getDate()),
    ].join('-') + `T${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}`
}

export function fromDateTimeLocalValue(value: string): string | null {
    if (!value) return null
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return null
    return date.toISOString()
}
