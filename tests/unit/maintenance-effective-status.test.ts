import test from 'node:test'
import assert from 'node:assert/strict'
import {
    computeEffectiveMaintenanceStatus,
    normalizeMaintenanceSettingsForAdmin,
    normalizeMaintenanceSettingsUpdate,
} from '@/lib/maintenance/effective-status'

const NOW = new Date('2026-06-01T10:00:00.000Z')
const FUTURE = new Date('2026-06-01T11:00:00.000Z').toISOString()
const PAST = new Date('2026-06-01T09:59:59.000Z').toISOString()

test('saved off maintenance is effectively open', () => {
    const status = computeEffectiveMaintenanceStatus({
        maintenanceMode: 'false',
        maintenanceMessage: 'Closed for work',
        maintenancePauseUntil: FUTURE,
    }, NOW)

    assert.equal(status.maintenanceMode, false)
    assert.equal(status.blocksUsers, false)
    assert.equal(status.pauseUntil, FUTURE)
    assert.equal(status.expiredTimedMaintenance, false)
    assert.equal(status.manualMaintenance, false)
})

test('future timed maintenance blocks users until its server-time deadline', () => {
    const status = computeEffectiveMaintenanceStatus({
        maintenanceMode: 'true',
        maintenanceMessage: 'Maintenance',
        maintenancePauseUntil: FUTURE,
    }, NOW)

    assert.equal(status.maintenanceMode, true)
    assert.equal(status.blocksUsers, true)
    assert.equal(status.message, 'Maintenance')
    assert.equal(status.pauseUntil, FUTURE)
    assert.equal(status.expiredTimedMaintenance, false)
    assert.equal(status.manualMaintenance, false)
})

test('expired timed maintenance is effectively open without mutating saved settings', () => {
    const status = computeEffectiveMaintenanceStatus({
        maintenanceMode: 'true',
        maintenanceMessage: 'Maintenance',
        maintenancePauseUntil: PAST,
    }, NOW)

    assert.equal(status.maintenanceMode, false)
    assert.equal(status.blocksUsers, false)
    assert.equal(status.pauseUntil, PAST)
    assert.equal(status.expiredTimedMaintenance, true)
    assert.equal(status.manualMaintenance, false)
})

test('missing or invalid pause time keeps true maintenance manual', () => {
    for (const maintenancePauseUntil of [null, '', 'not-a-date']) {
        const status = computeEffectiveMaintenanceStatus({
            maintenanceMode: 'true',
            maintenanceMessage: 'Manual maintenance',
            maintenancePauseUntil,
        }, NOW)

        assert.equal(status.maintenanceMode, true)
        assert.equal(status.blocksUsers, true)
        assert.equal(status.pauseUntil, null)
        assert.equal(status.expiredTimedMaintenance, false)
        assert.equal(status.manualMaintenance, true)
    }
})

test('admin settings read normalizes expired timed maintenance for display only', () => {
    const settings = normalizeMaintenanceSettingsForAdmin({
        maintenance_mode: 'true',
        maintenance_message: 'Maintenance',
        maintenance_pause_until: PAST,
        unrelated_setting: 'kept',
    }, NOW)

    assert.equal(settings.maintenance_mode, 'false')
    assert.equal(settings.maintenance_pause_until, '')
    assert.equal(settings.maintenance_message, 'Maintenance')
    assert.equal(settings.unrelated_setting, 'kept')
})

test('server computes maintenance pause deadline from duration on settings update', () => {
    const update = normalizeMaintenanceSettingsUpdate({
        maintenance_mode: 'true',
        maintenance_pause_until: '2030-01-01T00:00:00.000Z',
        maintenance_pause_duration_value: '2',
        maintenance_pause_duration_unit: 'hours',
        notification_message: 'kept',
    }, NOW)

    assert.equal(update.maintenance_mode, 'true')
    assert.equal(update.maintenance_pause_until, '2026-06-01T12:00:00.000Z')
    assert.equal(update.maintenance_pause_duration_value, '2')
    assert.equal(update.maintenance_pause_duration_unit, 'hours')
    assert.equal(update.notification_message, 'kept')
})

test('disabled maintenance clears pause deadline on settings update', () => {
    const update = normalizeMaintenanceSettingsUpdate({
        maintenance_mode: 'false',
        maintenance_pause_until: FUTURE,
    }, NOW)

    assert.equal(update.maintenance_mode, 'false')
    assert.equal(update.maintenance_pause_until, '')
})
