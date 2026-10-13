/** Expand a legacy numeric snapshot without rounding or accepting exponent text
 * from provider HTML. New provider amounts must survive a numeric round trip. */
function numericText(value: number): string {
    const text = String(value)
    const exponent = text.match(/^(\d+)(?:\.(\d+))?e([+-]?\d+)$/i)
    if (!exponent) return text
    const digits = exponent[1] + (exponent[2] || '')
    const point = exponent[1].length + Number(exponent[3])
    return point <= 0 ? `0.${'0'.repeat(-point)}${digits}`
        : point >= digits.length ? digits + '0'.repeat(point - digits.length)
            : `${digits.slice(0, point)}.${digits.slice(point)}`
}

export function positiveDecimal(value: string | number): string | null {
    if (typeof value === 'number' && (!Number.isFinite(value) || value <= 0)) return null
    const text = (typeof value === 'number' ? numericText(value) : value).trim()
    const match = text.match(/^\+?(\d+|\d{1,3}(?:,\d{3})+)(?:\.(\d+))?$/)
    if (!match) return null
    const whole = match[1].replace(/,/g, '').replace(/^0+(?=\d)/, '')
    const fraction = (match[2] || '').replace(/0+$/, '')
    const decimal = fraction ? `${whole}.${fraction}` : whole
    return /[1-9]/.test(decimal) ? decimal : null
}

export function quotedPriceDecimal(quote: { price: number; priceDecimal?: string }): string | null {
    if (typeof quote.price !== 'number') return null
    const numeric = positiveDecimal(quote.price)
    if (quote.priceDecimal === undefined) return numeric
    if (typeof quote.priceDecimal !== 'string') return null
    const precise = positiveDecimal(quote.priceDecimal)
    return precise !== null && precise === numeric ? precise : null
}

export function readProviderPrice(priceText: string) {
    const match = priceText.trim().match(/^(\+?[\d,]+(?:\.\d+)?)\s*([A-Z]{3})$/)
    const priceDecimal = match ? positiveDecimal(match[1]) : null
    if (!match || priceDecimal === null) return null
    const price = Number(priceDecimal)
    if (positiveDecimal(price) !== priceDecimal) return null
    return { price, priceDecimal, priceText: priceText.trim(), currency: match[2] }
}
