const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const OFF_WORK = 'offwork-time-alarm';
const REMINDER = 'offwork-reminder-alarm';
const at = value => new Date(value).getTime();

// Load the real extension modules with an isolated clock and Chrome API doubles.
async function createBackground(now, config = {}) {
    const state = { now: at(now), idle: 'active', local: {}, notifications: [], alarms: new Map() };
    const listeners = {};
    const event = name => ({ addListener: fn => { listeners[name] = fn; } });
    const context = vm.createContext({
        console: { log() {}, error() {} },
        Date: class extends Date {
            constructor(...args) { super(...(args.length ? args : [state.now])); }
            static now() { return state.now; }
        },
        OffscreenCanvas: class {
            getContext() {
                return {
                    createLinearGradient: () => ({ addColorStop() {} }),
                    beginPath() {}, arc() {}, fill() {}, moveTo() {}, lineTo() {}, stroke() {}
                };
            }
            async convertToBlob() { return {}; }
        },
        FileReader: class {
            readAsDataURL() { this.result = 'data:image/png;base64,test'; this.onloadend(); }
        },
        chrome: {
            idle: { setDetectionInterval() {}, queryState: async () => state.idle, onStateChanged: event('idle') },
            runtime: { onInstalled: event('installed'), onStartup: event('startup'), onMessage: event('message') },
            storage: {
                sync: { get: async defaults => structuredClone({ ...defaults, ...config }) },
                local: {
                    get: async defaults => structuredClone({ ...defaults, ...state.local }),
                    set: async value => { Object.assign(state.local, structuredClone(value)); }
                },
                onChanged: event('storage')
            },
            alarms: {
                clear: async name => state.alarms.delete(name),
                create: async (name, value) => { state.alarms.set(name, value); },
                onAlarm: event('alarm')
            },
            notifications: {
                create: async options => {
                    if (state.notificationError) throw state.notificationError;
                    state.notifications.push(options);
                    return String(state.notifications.length);
                }
            }
        }
    });
    const modules = new Map();
    function load(filename) {
        if (!modules.has(filename)) {
            modules.set(filename, new vm.SourceTextModule(readFileSync(filename, 'utf8'), {
                context, identifier: filename
            }));
        }
        return modules.get(filename);
    }
    const background = load(path.join(ROOT, 'background.js'));
    await background.link((specifier, parent) => load(path.resolve(path.dirname(parent.identifier), specifier)));
    await background.evaluate();
    state.fire = async scheduledTime => {
        // Chrome removes a one-shot alarm when it fires.
        state.alarms.delete(OFF_WORK);
        await listeners.alarm({ name: OFF_WORK, scheduledTime: at(scheduledTime) });
    };
    state.fireReminder = scheduledTime => listeners.alarm({ name: REMINDER, scheduledTime: at(scheduledTime) });
    return state;
}

test('a previous-day alarm delivered in the morning does not suppress today\'s notification', async () => {
    const state = await createBackground('2026-11-10T09:00:00');
    await state.fire('2026-11-09T18:00:00');
    assert.equal(state.notifications.length, 0);
    assert.equal(state.local.lastOffWorkNotifyDate, undefined);
    assert.equal(state.alarms.get(OFF_WORK).when, at('2026-11-10T18:00:00'));

    state.now = at('2026-11-10T18:00:01');
    await state.fire('2026-11-10T18:00:00');
    assert.equal(state.notifications.length, 1);
});

test('a notification delayed until early morning belongs to the previous workday', async () => {
    const state = await createBackground('2026-11-10T00:30:00');
    await state.fire('2026-11-09T18:00:00');
    assert.equal(state.notifications.length, 1);
    assert.equal(state.local.lastOffWorkNotifyDate, new Date('2026-11-09T18:00:00').toDateString());

    state.now = at('2026-11-10T18:00:01');
    await state.fire('2026-11-10T18:00:00');
    assert.equal(state.notifications.length, 2);
});

test('a notification failure does not remove the next daily alarm', async () => {
    const state = await createBackground('2026-11-10T18:00:01');
    state.notificationError = new Error('Notification delivery failed');
    await assert.rejects(state.fire('2026-11-10T18:00:00'), /Notification delivery failed/);
    assert.equal(state.alarms.get(OFF_WORK)?.when, at('2026-11-11T18:00:00'));
    assert.equal(state.local.lastOffWorkNotifyDate, undefined);

    state.notificationError = null;
    state.now = at('2026-11-11T18:00:01');
    await state.fire('2026-11-11T18:00:00');
    assert.equal(state.notifications.length, 1);
});

for (const idle of ['locked', 'idle']) {
    test(`${idle} still skips the notification and schedules tomorrow`, async () => {
        const state = await createBackground('2026-11-10T18:00:01');
        state.idle = idle;
        await state.fire('2026-11-10T18:00:00');
        assert.equal(state.notifications.length, 0);
        assert.equal(state.local.lastOffWorkNotifyDate, undefined);
        assert.equal(state.alarms.get(OFF_WORK).when, at('2026-11-11T18:00:00'));
    });
}

test('a delayed alarm for the old setting is ignored after the off-work time changes', async () => {
    const state = await createBackground('2026-11-10T18:01:00', { offWorkTime: '19:00' });
    await state.fire('2026-11-10T18:00:00');
    assert.equal(state.notifications.length, 0);
    assert.equal(state.alarms.get(OFF_WORK).when, at('2026-11-10T19:00:00'));
});

for (const now of ['2026-11-10T18:00:00.100', '2026-11-10T18:05:00']) {
    for (const reminderFirst of [true, false]) {
        test(`coincident alarms at ${now}, reminder first: ${reminderFirst}, consume only one message`, async () => {
            const state = await createBackground(now, { customMessages: ['A', 'B', 'C'], shuffleMessages: false });
            const offWork = () => state.fire('2026-11-10T18:00:00');
            const reminder = () => state.fireReminder('2026-11-10T18:00:00');
            await Promise.all(reminderFirst ? [reminder(), offWork()] : [offWork(), reminder()]);
            assert.equal(state.notifications.length, 1);
            assert.equal(state.notifications[0].requireInteraction, true);
            assert.match(state.notifications[0].message, /\nA$/);
            assert.deepEqual(state.local.messagePool, ['B', 'C']);

            state.now = at('2026-11-10T18:30:00.100');
            await state.fireReminder('2026-11-10T18:30:00');
            assert.equal(state.notifications.length, 2);
            assert.equal(state.notifications[1].requireInteraction, false);
            assert.match(state.notifications[1].message, /0小时30分钟/);
            assert.match(state.notifications[1].message, /\nB$/);
            assert.deepEqual(state.local.messagePool, ['C']);
        });
    }
}

test('a reminder with seconds offset does not show zero minutes of overtime', async () => {
    const state = await createBackground('2026-11-10T18:00:30.100');
    await Promise.all([
        state.fireReminder('2026-11-10T18:00:30'),
        state.fire('2026-11-10T18:00:00')
    ]);
    assert.equal(state.notifications.length, 1);
    assert.equal(state.notifications[0].requireInteraction, true);
});

test('the minimum one-minute interval still sends its next reminder', async () => {
    const state = await createBackground('2026-11-10T18:00:00.100', { reminderInterval: 1 });
    await state.fire('2026-11-10T18:00:00');
    state.now = at('2026-11-10T18:01:00');
    await state.fireReminder('2026-11-10T18:01:00');
    assert.equal(state.notifications.length, 2);
    assert.match(state.notifications[1].message, /0小时1分钟/);
});
