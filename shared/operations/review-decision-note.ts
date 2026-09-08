export function validDecisionNote(value: string, required = true): boolean {
    const length = value.trim().length
    return length <= 2000 && (!required || length > 0)
}
