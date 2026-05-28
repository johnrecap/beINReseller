export const DEFAULT_PROXY_IMPORT_LABEL_PREFIX = 'بروكسي'
export const MAX_PROXY_IMPORT_ROWS = 500

export type ExistingProxyIdentity = {
    host: string
    port: number
}

export type ProxyImportParsedRow = {
    lineNumber: number
    rawLine: string
    host: string
    port: number
    username: string | null
    password: string | null
}

export type ProxyImportInvalidRow = {
    lineNumber: number
    rawLine: string
    reason: string
}

export type ProxyImportDuplicateRow = {
    lineNumber: number
    host: string
    port: number
    reason: string
}

export type ProxyImportPreviewRow = {
    lineNumber: number
    host: string
    port: number
    username: string | null
    hasPassword: boolean
    label: string
}

export type ProxyImportParseResult = {
    totalLines: number
    blankLines: number
    rows: ProxyImportParsedRow[]
    invalidRows: ProxyImportInvalidRow[]
}

export type ProxyImportPreview = {
    summary: {
        totalLines: number
        blankLines: number
        validCount: number
        duplicateCount: number
        invalidCount: number
        nextLabelStart: number
    }
    rowsForImport: Array<ProxyImportParsedRow & { label: string }>
    validRows: ProxyImportPreviewRow[]
    duplicates: ProxyImportDuplicateRow[]
    invalidRows: ProxyImportInvalidRow[]
}

export function normalizeProxyLabelPrefix(prefix: unknown): string {
    const normalized = typeof prefix === 'string' ? prefix.trim() : ''
    return normalized || DEFAULT_PROXY_IMPORT_LABEL_PREFIX
}

function proxyKey(host: string, port: number): string {
    return `${host.toLowerCase()}:${port}`
}

function isSafeProxyHost(host: string): boolean {
    return /^[a-zA-Z0-9.-]+$/.test(host)
}

export function parseProxyImportText(text: string, maxRows = MAX_PROXY_IMPORT_ROWS): ProxyImportParseResult {
    const lines = text.split(/\r?\n/)
    const rows: ProxyImportParsedRow[] = []
    const invalidRows: ProxyImportInvalidRow[] = []
    let blankLines = 0
    let nonBlankRows = 0

    lines.forEach((rawLine, index) => {
        const lineNumber = index + 1
        const line = rawLine.trim()

        if (!line) {
            blankLines += 1
            return
        }

        nonBlankRows += 1
        if (nonBlankRows > maxRows) {
            invalidRows.push({
                lineNumber,
                rawLine,
                reason: `Import limit is ${maxRows} rows`,
            })
            return
        }

        const parts = line.split(':').map((part) => part.trim())
        if (parts.length !== 2 && parts.length !== 4) {
            invalidRows.push({
                lineNumber,
                rawLine,
                reason: 'Expected host:port or host:port:username:password',
            })
            return
        }

        const [host, portText, username = '', password = ''] = parts
        if (!host || !isSafeProxyHost(host)) {
            invalidRows.push({ lineNumber, rawLine, reason: 'Invalid proxy host' })
            return
        }

        const port = Number.parseInt(portText, 10)
        if (!Number.isFinite(port) || String(port) !== portText || port < 1 || port > 65535) {
            invalidRows.push({ lineNumber, rawLine, reason: 'Port must be between 1 and 65535' })
            return
        }

        if ((username && !password) || (!username && password)) {
            invalidRows.push({
                lineNumber,
                rawLine,
                reason: 'Username and password must both be provided or both be empty',
            })
            return
        }

        rows.push({
            lineNumber,
            rawLine,
            host,
            port,
            username: username || null,
            password: password || null,
        })
    })

    return {
        totalLines: lines.length,
        blankLines,
        rows,
        invalidRows,
    }
}

export function getNextProxyLabelNumber(existingLabels: string[], labelPrefix = DEFAULT_PROXY_IMPORT_LABEL_PREFIX): number {
    const escapedPrefix = labelPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const labelPattern = new RegExp(`^${escapedPrefix}\\s+(\\d+)$`)
    let highest = 0

    for (const label of existingLabels) {
        const match = label.trim().match(labelPattern)
        if (!match) continue

        const value = Number.parseInt(match[1], 10)
        if (Number.isFinite(value) && value > highest) highest = value
    }

    return highest + 1
}

export function buildProxyImportPreview(input: {
    text: string
    existingProxies?: ExistingProxyIdentity[]
    existingLabels?: string[]
    labelPrefix?: string
    maxRows?: number
}): ProxyImportPreview {
    const labelPrefix = normalizeProxyLabelPrefix(input.labelPrefix)
    const parsed = parseProxyImportText(input.text, input.maxRows)
    const existingKeys = new Set((input.existingProxies ?? []).map((proxy) => proxyKey(proxy.host, proxy.port)))
    const seenKeys = new Set<string>()
    const duplicates: ProxyImportDuplicateRow[] = []
    const rowsForImport: Array<ProxyImportParsedRow & { label: string }> = []
    const validRows: ProxyImportPreviewRow[] = []
    const nextLabelStart = getNextProxyLabelNumber(input.existingLabels ?? [], labelPrefix)
    let nextLabelNumber = nextLabelStart

    for (const row of parsed.rows) {
        const key = proxyKey(row.host, row.port)
        if (existingKeys.has(key) || seenKeys.has(key)) {
            duplicates.push({
                lineNumber: row.lineNumber,
                host: row.host,
                port: row.port,
                reason: 'Duplicate host and port',
            })
            continue
        }

        seenKeys.add(key)
        const label = `${labelPrefix} ${nextLabelNumber}`
        nextLabelNumber += 1

        rowsForImport.push({ ...row, label })
        validRows.push({
            lineNumber: row.lineNumber,
            host: row.host,
            port: row.port,
            username: row.username,
            hasPassword: Boolean(row.password),
            label,
        })
    }

    return {
        summary: {
            totalLines: parsed.totalLines,
            blankLines: parsed.blankLines,
            validCount: validRows.length,
            duplicateCount: duplicates.length,
            invalidCount: parsed.invalidRows.length,
            nextLabelStart,
        },
        rowsForImport,
        validRows,
        duplicates,
        invalidRows: parsed.invalidRows,
    }
}
