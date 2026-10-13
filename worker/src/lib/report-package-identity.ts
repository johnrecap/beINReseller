import { positiveDecimal } from '../../../shared/operations/provider-price'

const normalized = (text: string) => text.replace(/\s+/g, ' ').trim().toLowerCase()

function displayName(text: string, rules: Set<string>): string | null {
    let name = normalized(text)
    const repeated = name.match(/\s*\((\d+(?:\.\d+)?)\s+months?\)$/)
    if (repeated) {
        const base = name.slice(0, repeated.index).trim()
        const durations = [...base.matchAll(/\b(\d+(?:\.\d+)?)\s+months?\b/g)]
            .map(match => positiveDecimal(match[1]))
        if (durations.length) {
            const suffix = positiveDecimal(repeated[1])
            if (suffix === null || durations.some(duration => duration === null || duration !== suffix)) return null
            name = base
            rules.add('DUPLICATE_DURATION_SUFFIX')
        }
    }
    if (/\s*\(full payment\)$/.test(name) && /\b20\d{2}\b/.test(name) && !/\bmonths?\b/.test(name)) {
        name = name.replace(/\s*\(full payment\)$/, '').trim()
        rules.add('EVENT_FULL_PAYMENT_SUFFIX')
    }
    return name || null
}

export function compareReportPackageName(selectedName: string, reportName: string) {
    const rules = new Set<string>()
    const report = normalized(reportName)
    const withoutAction = report.replace(/^(?:add|renewal)\s+/, '')
    if (report !== withoutAction) rules.add('REPORT_ACTION_PREFIX')
    const selected = displayName(selectedName, rules)
    const observed = displayName(withoutAction, rules)
    return { matches: selected !== null && observed !== null && selected === observed,
        rules: [...rules] }
}
