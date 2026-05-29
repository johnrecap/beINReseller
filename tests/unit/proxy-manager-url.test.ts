import test from 'node:test'
import assert from 'node:assert/strict'
import { ProxyManager } from '../../worker/src/utils/proxy-manager'

test('manual proxy URLs default to HTTP and encode credentials', () => {
    const manager = new ProxyManager()

    assert.equal(
        manager.buildProxyUrlFromConfig({
            host: '216.98.252.66',
            port: 5796,
            username: 'user@example',
            password: 'p@ss:word',
        }),
        'http://user%40example:p%40ss%3Aword@216.98.252.66:5796'
    )
})
