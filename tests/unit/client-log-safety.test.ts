import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const clientRoots = [
    'src/app',
    'src/components',
    'src/hooks',
]

const consoleCallPattern = /\bconsole\.(log|debug|info|warn|error|table|dir)\s*\(/

function collectClientFiles(relativePath: string, files: string[] = []): string[] {
    const absolutePath = join(process.cwd(), relativePath)
    const normalizedPath = relativePath.replace(/\\/g, '/')
    if (normalizedPath.startsWith('src/app/api')) return files

    if (statSync(absolutePath).isDirectory()) {
        for (const entry of readdirSync(absolutePath)) {
            collectClientFiles(join(relativePath, entry), files)
        }
        return files
    }

    if (/\.(ts|tsx)$/.test(relativePath) && !normalizedPath.includes('.test.')) {
        files.push(relativePath)
    }

    return files
}

const clientFiles = clientRoots.flatMap(root => collectClientFiles(root))

for (const relativePath of clientFiles) {
    test(`no browser console logging: ${relativePath}`, () => {
        const source = readFileSync(join(process.cwd(), relativePath), 'utf8')
        assert.equal(consoleCallPattern.test(source), false)
    })
}
