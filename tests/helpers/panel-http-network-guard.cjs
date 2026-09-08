/* eslint-disable @typescript-eslint/no-require-imports */
// Test preload only. Deny provider/production egress even if a server import tries it.
const net = require('node:net')
const { syncBuiltinESMExports } = require('node:module')
const allowed = new Set((process.env.PANEL_HTTP_ALLOWED_PORTS || '').split(',').map(Number))
const original = net.Socket.prototype.connect
net.Socket.prototype.connect = function (...args) {
    let value = args[0]
    if (Array.isArray(value)) value = value[0]
    const host = String(value && typeof value === 'object' ? value.host || 'localhost' : typeof args[1] === 'string' ? args[1] : 'localhost').replace(/^\[|\]$/g, '')
    const port = Number(value && typeof value === 'object' ? value.port : value)
    if (['localhost', '127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(host) && allowed.has(port)) return original.apply(this, args)
    process.nextTick(() => this.destroy(new Error('PANEL_HTTP_TEST_EGRESS_BLOCKED')))
    return this
}
syncBuiltinESMExports()
