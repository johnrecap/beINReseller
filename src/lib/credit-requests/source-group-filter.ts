export type CreditRequestSourceGroupSelection =
    | { mode: 'ALL' }
    | { mode: 'NONE' }
    | { mode: 'VALUE'; value: string }

type CreditRequestSourceGroupFilterResult =
    | {
        ok: true
        selection: CreditRequestSourceGroupSelection
        where: { sourceGroupSnapshot: string | null } | null
    }
    | {
        ok: false
        code: 'INVALID_SOURCE_GROUP_FILTER'
    }

const ALL_OPTION = 'mode:all'
const NONE_OPTION = 'mode:none'
const VALUE_OPTION_PREFIX = 'value:'

export function parseCreditRequestSourceGroupFilter(input: {
    sourceGroup: string | null
    sourceGroupMode: string | null
}): CreditRequestSourceGroupFilterResult {
    const sourceGroup = input.sourceGroup?.trim() || null
    const sourceGroupMode = input.sourceGroupMode?.trim() || null

    if (sourceGroupMode && sourceGroupMode !== 'NONE') {
        return { ok: false, code: 'INVALID_SOURCE_GROUP_FILTER' }
    }

    if (sourceGroupMode === 'NONE') {
        if (sourceGroup) {
            return { ok: false, code: 'INVALID_SOURCE_GROUP_FILTER' }
        }

        return {
            ok: true,
            selection: { mode: 'NONE' },
            where: { sourceGroupSnapshot: null },
        }
    }

    if (sourceGroup) {
        return {
            ok: true,
            selection: { mode: 'VALUE', value: sourceGroup },
            where: { sourceGroupSnapshot: sourceGroup },
        }
    }

    return {
        ok: true,
        selection: { mode: 'ALL' },
        where: null,
    }
}

export function encodeCreditRequestSourceGroupOption(
    selection: CreditRequestSourceGroupSelection,
): string {
    if (selection.mode === 'NONE') return NONE_OPTION
    if (selection.mode === 'VALUE') {
        return `${VALUE_OPTION_PREFIX}${encodeURIComponent(selection.value)}`
    }
    return ALL_OPTION
}

export function decodeCreditRequestSourceGroupOption(
    optionValue: string,
): CreditRequestSourceGroupSelection {
    if (optionValue === NONE_OPTION) return { mode: 'NONE' }
    if (!optionValue.startsWith(VALUE_OPTION_PREFIX)) return { mode: 'ALL' }

    try {
        const value = decodeURIComponent(optionValue.slice(VALUE_OPTION_PREFIX.length))
        return value ? { mode: 'VALUE', value } : { mode: 'ALL' }
    } catch {
        return { mode: 'ALL' }
    }
}

export function applyCreditRequestSourceGroupFilter(
    params: URLSearchParams,
    selection: CreditRequestSourceGroupSelection,
): void {
    params.delete('sourceGroup')
    params.delete('sourceGroupMode')

    if (selection.mode === 'NONE') {
        params.set('sourceGroupMode', 'NONE')
    } else if (selection.mode === 'VALUE') {
        params.set('sourceGroup', selection.value)
    }
}
