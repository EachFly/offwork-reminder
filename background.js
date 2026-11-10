import { ALARM_NAMES, FIXED_PREFIX, NOTIFICATION_TITLES, SYNC_DEFAULT_CONFIG } from './shared/constants.js';
import { getConfig, migrateRuntimeState, resetMessagePool, setRuntimeState } from './shared/storage.js';
import { getRelevantOffWorkDate } from './shared/time.js';

// 设置空闲检测间隔（秒）
chrome.idle.setDetectionInterval(60);

// 监听系统空闲状态变化（用于日志记录）
chrome.idle.onStateChanged.addListener((newState) => {
    console.log('系统状态变化:', newState);
});

// 检查系统是否处于活跃状态
async function isSystemActive() {
    const idleState = await chrome.idle.queryState(60);
    console.log('当前系统状态:', idleState);
    return idleState === 'active';
}

// 生成通知图标（使用 canvas 创建一个简单的紫色圆形图标）
function generateIconDataUrl() {
    const canvas = new OffscreenCanvas(128, 128);
    const ctx = canvas.getContext('2d');

    // 绘制渐变背景
    const gradient = ctx.createLinearGradient(0, 0, 128, 128);
    gradient.addColorStop(0, '#667eea');
    gradient.addColorStop(1, '#764ba2');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(64, 64, 60, 0, Math.PI * 2);
    ctx.fill();

    // 绘制时钟指针
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';

    // 时针
    ctx.beginPath();
    ctx.moveTo(64, 64);
    ctx.lineTo(64, 32);
    ctx.stroke();

    // 分针
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(64, 64);
    ctx.lineTo(88, 64);
    ctx.stroke();

    // 中心点
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(64, 64, 5, 0, Math.PI * 2);
    ctx.fill();

    return canvas.convertToBlob({ type: 'image/png' }).then(blob => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
        });
    });
}

// 缓存生成的图标
let cachedIconUrl = null;

// 初始化
chrome.runtime.onInstalled.addListener(async () => {
    await migrateRuntimeState();
    await warmUpIcon();
    await initializeAlarms();
});

// 启动时也要设置定时器
chrome.runtime.onStartup.addListener(async () => {
    await migrateRuntimeState();
    await initializeAlarms();
});

// 监听定时器触发
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === ALARM_NAMES.reminder) {
        await checkAndNotify(alarm.scheduledTime);
    } else if (alarm.name === ALARM_NAMES.offWork) {
        try {
            await sendOffWorkTimeNotification(alarm.scheduledTime);
        } finally {
            // 下班闹钟只触发一次；本次通知失败也不能中断下一天的提醒。
            await setupOffWorkAlarm();
        }
    }
});

// 监听配置变化
chrome.storage.onChanged.addListener(async (changes, areaName) => {
    if (areaName === 'sync') {
        if (changes.reminderInterval) {
            await setupAlarm();
        }
        if (changes.offWorkTime) {
            await setupOffWorkAlarm();
        }
        if (changes.customMessages || changes.shuffleMessages) {
            await resetMessagePool();
        }
    }
});

async function initializeAlarms() {
    await setupAlarm();
    await setupOffWorkAlarm();
}

async function warmUpIcon() {
    if (!cachedIconUrl) {
        cachedIconUrl = await generateIconDataUrl();
    }
}

// 设置定时器
async function setupAlarm() {
    await chrome.alarms.clear(ALARM_NAMES.reminder);

    const config = await getConfig();
    const intervalMinutes = config.reminderInterval || SYNC_DEFAULT_CONFIG.reminderInterval;
    const firstTriggerTime = getNextReminderTriggerTime(intervalMinutes);

    chrome.alarms.create(ALARM_NAMES.reminder, {
        when: firstTriggerTime.getTime(),
        periodInMinutes: intervalMinutes
    });

    console.log(`定时器已设置，间隔 ${intervalMinutes} 分钟，首次触发时间 ${firstTriggerTime.toLocaleTimeString()}`);
}

// 设置下班时间定时器
async function setupOffWorkAlarm() {
    await chrome.alarms.clear(ALARM_NAMES.offWork);

    const config = await getConfig();
    const [offHour, offMinute] = config.offWorkTime.split(':').map(Number);

    const now = new Date();
    const offWorkTime = new Date(now);
    offWorkTime.setHours(offHour, offMinute, 0, 0);

    // 如果今天的下班时间已过，设置为明天
    if (offWorkTime.getTime() <= now.getTime()) {
        offWorkTime.setDate(offWorkTime.getDate() + 1);
    }

    await chrome.alarms.create(ALARM_NAMES.offWork, {
        when: offWorkTime.getTime()
    });

    console.log(`下班提醒已设置，将在 ${offWorkTime.toLocaleTimeString()} 触发`);
}

// 检查并发送通知
async function checkAndNotify(scheduledTime) {
    if (!await isSystemActive()) {
        console.log('系统已锁屏或空闲，跳过本次通知');
        return;
    }

    const config = await getConfig();
    const now = new Date();

    const offWorkDate = getRelevantOffWorkDate(now, config.offWorkTime);

    const overtimeMs = now.getTime() - offWorkDate.getTime();

    // 下班首分钟由下班通知负责；按计划时间判断，回调延迟也不会重复提醒。
    if (overtimeMs < 60_000 || scheduledTime < offWorkDate.getTime() + 60_000) {
        console.log('下班首分钟及之前的周期闹钟不发送加班提醒');
        return;
    }

    const totalMinutes = Math.floor(overtimeMs / (1000 * 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    const prefix = FIXED_PREFIX
        .replace('{hours}', hours.toString())
        .replace('{minutes}', minutes.toString());

    const selectedMessage = await getNextMessage(config);
    const message = prefix + '\n' + selectedMessage;
    await createNotification({
        title: NOTIFICATION_TITLES.reminder,
        message,
        requireInteraction: false
    });

    console.log('已发送加班提醒:', message);
}

async function sendOffWorkNotification(config) {
    const prefix = '下班！别忘了打卡！';
    const selectedMessage = await getNextMessage(config);
    const message = prefix + '\n' + selectedMessage;
    await createNotification({
        title: NOTIFICATION_TITLES.offWork,
        message,
        requireInteraction: true
    });

    console.log('已发送下班通知:', message);
}

async function sendOffWorkTimeNotification(scheduledTime) {
    if (!await isSystemActive()) {
        console.log('系统已锁屏或空闲，跳过下班通知');
        return;
    }

    const config = await getConfig();
    const now = new Date();
    const offWorkDate = getRelevantOffWorkDate(now, config.offWorkTime);

    // 唤醒后可能收到之前工作日或旧配置的闹钟，不能占用当前工作日的提醒。
    if (scheduledTime !== offWorkDate.getTime() || now.getTime() < scheduledTime) {
        console.log('下班闹钟不属于当前工作时段，跳过通知');
        return;
    }

    const notifyDate = offWorkDate.toDateString();
    if (config.lastOffWorkNotifyDate === notifyDate) {
        console.log('本工作日已发送过下班通知');
        return;
    }

    await sendOffWorkNotification(config);
    await setRuntimeState({ lastOffWorkNotifyDate: notifyDate });
    console.log('已发送下班时间通知');
}

async function getNextMessage(config) {
    let pool = config.messagePool || [];
    const customMessages = config.customMessages || SYNC_DEFAULT_CONFIG.customMessages;
    const shouldShuffle = config.shuffleMessages !== false;

    if (pool.length === 0) {
        pool = [...customMessages];

        if (shouldShuffle) {
            for (let i = pool.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [pool[i], pool[j]] = [pool[j], pool[i]];
            }
        }
    }

    const message = pool.shift();
    await setRuntimeState({ messagePool: pool });

    return message;
}

async function createNotification({ title, message, requireInteraction }) {
    await warmUpIcon();

    return chrome.notifications.create({
        type: 'basic',
        iconUrl: cachedIconUrl,
        title,
        message,
        priority: 2,
        requireInteraction
    });
}

function getNextReminderTriggerTime(intervalMinutes) {
    const now = new Date();
    const nextTriggerTime = new Date(now);

    nextTriggerTime.setSeconds(0, 0);

    if (nextTriggerTime.getTime() <= now.getTime()) {
        nextTriggerTime.setMinutes(nextTriggerTime.getMinutes() + 1);
    }

    const minutesSinceMidnight =
        nextTriggerTime.getHours() * 60 + nextTriggerTime.getMinutes();
    const remainder = minutesSinceMidnight % intervalMinutes;
    if (remainder !== 0) {
        nextTriggerTime.setMinutes(nextTriggerTime.getMinutes() + (intervalMinutes - remainder));
    }

    return nextTriggerTime;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'testNotification') {
        const message = request.message;

        (async () => {
            try {
                await warmUpIcon();

                chrome.notifications.create({
                    type: 'basic',
                    iconUrl: cachedIconUrl,
                    title: NOTIFICATION_TITLES.test,
                    message: message,
                    priority: 2,
                    requireInteraction: true
                }, (notificationId) => {
                    if (chrome.runtime.lastError) {
                        console.error('通知创建失败:', chrome.runtime.lastError);
                        sendResponse({ success: false, error: chrome.runtime.lastError.message });
                    } else {
                        console.log('测试通知已发送 ID:', notificationId);
                        sendResponse({ success: true, notificationId });
                    }
                });
            } catch (error) {
                console.error('发送通知异常:', error);
                sendResponse({ success: false, error: error.message });
            }
        })();

        return true;
    }
});
