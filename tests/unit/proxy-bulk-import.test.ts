import test from 'node:test'
import assert from 'node:assert/strict'
import {
    DEFAULT_PROXY_IMPORT_LABEL_PREFIX,
    buildProxyImportPreview,
    getNextProxyLabelNumber,
    parseProxyImportText,
} from '@/lib/proxies/bulk-import'

test('parses Webshare proxy rows and ignores blank lines', () => {
    const parsed = parseProxyImportText([
        ' 5.59.255.175:6567:exuirjdu:q91cpyieogqb ',
        '',
        '45.56.155.26:6557:exuirjdu:q91cpyieogqb',
    ].join('\r\n'))

    assert.equal(parsed.totalLines, 3)
    assert.equal(parsed.blankLines, 1)
    assert.deepEqual(parsed.rows, [
        {
            lineNumber: 1,
            rawLine: ' 5.59.255.175:6567:exuirjdu:q91cpyieogqb ',
            host: '5.59.255.175',
            port: 6567,
            username: 'exuirjdu',
            password: 'q91cpyieogqb',
        },
        {
            lineNumber: 3,
            rawLine: '45.56.155.26:6557:exuirjdu:q91cpyieogqb',
            host: '45.56.155.26',
            port: 6557,
            username: 'exuirjdu',
            password: 'q91cpyieogqb',
        },
    ])
})

test('keeps plaintext passwords out of preview rows', () => {
    const preview = buildProxyImportPreview({
        text: '5.59.255.175:6567:exuirjdu:q91cpyieogqb',
        existingProxies: [],
        existingLabels: [],
    })

    assert.equal(preview.validRows[0]?.hasPassword, true)
    assert.equal('password' in (preview.validRows[0] || {}), false)
    assert.equal(preview.rowsForImport[0]?.password, 'q91cpyieogqb')
})

test('reports invalid proxy rows with line numbers', () => {
    const parsed = parseProxyImportText([
        'bad-row',
        'example.com:70000:user:pass',
        'example.com:8080:user',
        'example.com:8080:user:',
    ].join('\n'))

    assert.equal(parsed.rows.length, 0)
    assert.deepEqual(parsed.invalidRows.map((row) => ({
        lineNumber: row.lineNumber,
        rawLine: row.rawLine,
        reason: row.reason,
    })), [
        {
            lineNumber: 1,
            rawLine: 'bad-row',
            reason: 'Expected host:port or host:port:username:password',
        },
        {
            lineNumber: 2,
            rawLine: 'example.com:70000:user:pass',
            reason: 'Port must be between 1 and 65535',
        },
        {
            lineNumber: 3,
            rawLine: 'example.com:8080:user',
            reason: 'Expected host:port or host:port:username:password',
        },
        {
            lineNumber: 4,
            rawLine: 'example.com:8080:user:',
            reason: 'Username and password must both be provided or both be empty',
        },
    ])
})

test('calculates next proxy label number from existing labels', () => {
    assert.equal(getNextProxyLabelNumber([
        'بروكسي 1',
        'بروكسي 3',
        'Custom 99',
        'بروكسي bad',
    ], DEFAULT_PROXY_IMPORT_LABEL_PREFIX), 4)
})

test('builds preview with duplicates skipped and labels assigned only to importable rows', () => {
    const preview = buildProxyImportPreview({
        text: [
            '5.59.255.175:6567:exuirjdu:q91cpyieogqb',
            '45.56.155.26:6557:exuirjdu:q91cpyieogqb',
            '5.59.255.175:6567:exuirjdu:q91cpyieogqb',
            '82.23.95.165:6891:exuirjdu:q91cpyieogqb',
        ].join('\n'),
        existingProxies: [{ host: '45.56.155.26', port: 6557 }],
        existingLabels: ['بروكسي 1', 'بروكسي 2'],
    })

    assert.deepEqual(preview.summary, {
        totalLines: 4,
        blankLines: 0,
        validCount: 2,
        duplicateCount: 2,
        invalidCount: 0,
        nextLabelStart: 3,
    })
    assert.deepEqual(preview.validRows.map((row) => ({
        lineNumber: row.lineNumber,
        host: row.host,
        port: row.port,
        username: row.username,
        hasPassword: row.hasPassword,
        label: row.label,
    })), [
        {
            lineNumber: 1,
            host: '5.59.255.175',
            port: 6567,
            username: 'exuirjdu',
            hasPassword: true,
            label: 'بروكسي 3',
        },
        {
            lineNumber: 4,
            host: '82.23.95.165',
            port: 6891,
            username: 'exuirjdu',
            hasPassword: true,
            label: 'بروكسي 4',
        },
    ])
    assert.deepEqual(preview.duplicates.map((row) => ({
        lineNumber: row.lineNumber,
        host: row.host,
        port: row.port,
        reason: row.reason,
    })), [
        {
            lineNumber: 2,
            host: '45.56.155.26',
            port: 6557,
            reason: 'Duplicate host and port',
        },
        {
            lineNumber: 3,
            host: '5.59.255.175',
            port: 6567,
            reason: 'Duplicate host and port',
        },
    ])
})
