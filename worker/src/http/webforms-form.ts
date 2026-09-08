import * as cheerio from 'cheerio'
import type { AnyNode, Element } from 'domhandler'

export interface SuccessfulControl {
    name: string
    value: string
}

export interface SuccessfulControlOptions {
    activatedSubmitName?: string
    overrides?: Readonly<Record<string, string | readonly string[] | null>>
}

function isDisabled(element: Element): boolean {
    if ('disabled' in element.attribs) return true

    let ancestor = element.parent
    while (ancestor) {
        if (ancestor.type === 'tag' && ancestor.name === 'fieldset' && 'disabled' in ancestor.attribs) {
            return true
        }
        ancestor = ancestor.parent
    }
    return false
}

function selectedOptionValues(
    $: cheerio.CheerioAPI,
    element: Element
): string[] {
    const options = $(element).find('option').toArray()
    const selected = options.filter((option) => 'selected' in option.attribs && !isDisabled(option))
    const submitted = selected.length > 0 || 'multiple' in element.attribs
        ? selected
        : options.filter((option) => !isDisabled(option)).slice(0, 1)
    return submitted.map((option) => $(option).attr('value') ?? $(option).text())
}

function inputValues(
    $: cheerio.CheerioAPI,
    element: Element,
    activatedSubmitName?: string
): string[] {
    const type = ($(element).attr('type') || 'text').toLowerCase()
    const name = $(element).attr('name') || ''
    if (type === 'checkbox' || type === 'radio') {
        return 'checked' in element.attribs ? [$(element).attr('value') ?? 'on'] : []
    }
    if (type === 'submit' || type === 'image') {
        return name === activatedSubmitName ? [$(element).attr('value') ?? ''] : []
    }
    if (type === 'button' || type === 'reset' || type === 'file') return []
    return [$(element).attr('value') ?? '']
}

function successfulValues(
    $: cheerio.CheerioAPI,
    element: Element,
    activatedSubmitName?: string
): string[] {
    if (isDisabled(element)) return []
    if (element.name === 'select') return selectedOptionValues($, element)
    if (element.name === 'textarea') return [$(element).text()]
    if (element.name === 'button') {
        const type = ($(element).attr('type') || 'submit').toLowerCase()
        const name = $(element).attr('name') || ''
        return type === 'submit' && name === activatedSubmitName
            ? [$(element).attr('value') ?? $(element).text()]
            : []
    }
    return inputValues($, element, activatedSubmitName)
}

function collectFormControls(
    html: string,
    activatedSubmitName?: string
): SuccessfulControl[] {
    const $ = cheerio.load(html)
    const form = $('form#form1').first().length ? $('form#form1').first() : $('form').first()
    const controls: SuccessfulControl[] = []

    form.find('input, select, textarea, button').each((_, node: AnyNode) => {
        if (node.type !== 'tag') return
        const name = $(node).attr('name')
        if (!name) return
        for (const value of successfulValues($, node, activatedSubmitName)) {
            controls.push({ name, value })
        }
    })
    return controls
}

function replacementValues(
    replacement: string | readonly string[] | null | undefined
): readonly string[] {
    if (replacement === null || replacement === undefined) return []
    return Array.isArray(replacement) ? replacement : [replacement as string]
}

function overrideControls(
    controls: readonly SuccessfulControl[],
    overrides: Readonly<Record<string, string | readonly string[] | null>>
): SuccessfulControl[] {
    const pending = new Map(Object.entries(overrides))
    const overridden: SuccessfulControl[] = []
    for (const control of controls) {
        if (!pending.has(control.name)) {
            overridden.push(control)
            continue
        }
        const replacement = pending.get(control.name)
        pending.delete(control.name)
        replacementValues(replacement).forEach((value) => overridden.push({ name: control.name, value }))
    }
    for (const [name, replacement] of pending) {
        replacementValues(replacement).forEach((value) => overridden.push({ name, value }))
    }
    return overridden
}

export function collectSuccessfulControls(
    html: string,
    options: SuccessfulControlOptions = {}
): SuccessfulControl[] {
    const controls = collectFormControls(html, options.activatedSubmitName)
    return options.overrides ? overrideControls(controls, options.overrides) : controls
}

export function encodeSuccessfulControls(
    controls: readonly SuccessfulControl[]
): URLSearchParams {
    const encoded = new URLSearchParams()
    controls.forEach(({ name, value }) => encoded.append(name, value))
    return encoded
}
