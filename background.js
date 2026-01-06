// 默认配置
const DEFAULT_CONFIG = {
    offWorkTime: '18:00',
    reminderInterval: 30,
    customMessages: [
        '经算法评估，你今晚猝死风险为 37%。建议逃跑。',
        '加班不会写进 OKR，但会写进病历。',
        '加班不会升职，只会升肝酶。'
    ],
    messagePool: [],  // 剩余消息池
    shuffleMessages: true,  // 是否打乱顺序
    lastOffWorkNotifyDate: null  // 上次下班通知日期
};

// 固定提示前缀
const FIXED_PREFIX = '你已加班{hours}小时{minutes}分钟，别忘了回家！';


// 定时器名称
const ALARM_NAME = 'offwork-reminder-alarm';
const OFFWORK_ALARM_NAME = 'offwork-time-alarm';

// 设置空闲检测间隔（秒）
chrome.idle.setDetectionInterval(60);

// 监听系统空闲状态变化（用于日志记录）
chrome.idle.onStateChanged.addListener((newState) => {
    console.log('系统状态变化:', newState);
});

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
    // 设置默认配置
    const config = await getConfig();
    if (!config.offWorkTime) {
        await chrome.storage.sync.set(DEFAULT_CONFIG);
    }
    // 启动定时器
    await setupAlarm();
    await setupOffWorkAlarm();
});

// 启动时也要设置定时器
chrome.runtime.onStartup.addListener(async () => {
    await setupAlarm();
    await setupOffWorkAlarm();
});

// 监听定时器触发
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === ALARM_NAME) {
        // 常规加班提醒
        await checkAndNotify();
    } else if (alarm.name === OFFWORK_ALARM_NAME) {
        // 下班时间提醒
        await sendOffWorkTimeNotification();
        // 重新设置明天的下班提醒
        await setupOffWorkAlarm();
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
    }
});

// 获取配置
async function getConfig() {
    const result = await chrome.storage.sync.get(DEFAULT_CONFIG);
    return result;
}

// 设置定时器
async function setupAlarm() {
    // 先清除已有的定时器
    await chrome.alarms.clear(ALARM_NAME);

    const config = await getConfig();
    const intervalMinutes = config.reminderInterval || DEFAULT_CONFIG.reminderInterval;

    // 创建周期性定时器
    chrome.alarms.create(ALARM_NAME, {
        delayInMinutes: intervalMinutes,
        periodInMinutes: intervalMinutes
    });

    console.log(`定时器已设置，间隔 ${intervalMinutes} 分钟`);
}

// 设置下班时间定时器
async function setupOffWorkAlarm() {
    // 先清除已有的下班定时器
    await chrome.alarms.clear(OFFWORK_ALARM_NAME);

    const config = await getConfig();
    const [offHour, offMinute] = config.offWorkTime.split(':').map(Number);

    const now = new Date();
    const offWorkTime = new Date(now);
    offWorkTime.setHours(offHour, offMinute, 0, 0);

    // 如果今天的下班时间已过，设置为明天
    if (offWorkTime.getTime() <= now.getTime()) {
        offWorkTime.setDate(offWorkTime.getDate() + 1);
    }

    // 计算距离下班时间的分钟数
    const delayMs = offWorkTime.getTime() - now.getTime();
    const delayMinutes = Math.max(1, Math.ceil(delayMs / (1000 * 60)));

    // 创建一次性定时器
    chrome.alarms.create(OFFWORK_ALARM_NAME, {
        delayInMinutes: delayMinutes
    });

    console.log(`下班提醒已设置，将在 ${delayMinutes} 分钟后（${offWorkTime.toLocaleTimeString()}）触发`);
}

// 检查并发送通知
async function checkAndNotify() {
    // 主动查询系统空闲状态
    const idleState = await chrome.idle.queryState(60);
    console.log('当前系统状态:', idleState);

    // 如果系统已锁屏或空闲，跳过通知
    if (idleState === 'locked' || idleState === 'idle') {
        console.log('系统已锁屏或空闲，跳过本次通知');
        return;
    }

    const config = await getConfig();
    const now = new Date();

    // 解析下班时间
    const [offHour, offMinute] = config.offWorkTime.split(':').map(Number);
    const offWorkDate = new Date(now);
    offWorkDate.setHours(offHour, offMinute, 0, 0);

    // 计算加班时长（毫秒）
    const overtimeMs = now.getTime() - offWorkDate.getTime();

    // 检查是否刚好到下班时间（容差 1 分钟内）
    const isOffWorkTime = Math.abs(overtimeMs) <= 60 * 1000;
    const today = now.toDateString();

    if (isOffWorkTime && config.lastOffWorkNotifyDate !== today) {
        // 发送下班提醒
        await sendOffWorkNotification(config);
        // 记录今天已发送下班通知
        await chrome.storage.sync.set({ lastOffWorkNotifyDate: today });
        console.log('已发送下班通知');
        return;
    }

    // 如果还没到下班时间，不发送通知
    if (overtimeMs <= 0) {
        console.log('还没到下班时间，无需提醒');
        return;
    }

    // 计算小时和分钟
    const totalMinutes = Math.floor(overtimeMs / (1000 * 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    // 生成固定前缀
    const prefix = FIXED_PREFIX
        .replace('{hours}', hours.toString())
        .replace('{minutes}', minutes.toString());

    // 从消息池获取一条提示语
    const selectedMessage = await getNextMessage(config);

    // 拼接完整消息
    const message = prefix + '\n' + selectedMessage;

    // 获取或生成图标
    if (!cachedIconUrl) {
        cachedIconUrl = await generateIconDataUrl();
    }

    // 发送通知
    chrome.notifications.create({
        type: 'basic',
        iconUrl: cachedIconUrl,
        title: '⏰ 加班提醒',
        message: message,
        priority: 2,
        requireInteraction: false
    });

    console.log('已发送加班提醒:', message);
}

// 发送下班通知
async function sendOffWorkNotification(config) {
    // 固定前缀
    const prefix = '下班！别忘了打卡！';

    // 从消息池获取一条提示语
    const selectedMessage = await getNextMessage(config);

    // 拼接完整消息
    const message = prefix + '\n' + selectedMessage;

    // 获取或生成图标
    if (!cachedIconUrl) {
        cachedIconUrl = await generateIconDataUrl();
    }

    // 发送通知
    chrome.notifications.create({
        type: 'basic',
        iconUrl: cachedIconUrl,
        title: '🎉 下班时间到！',
        message: message,
        priority: 2,
        requireInteraction: true  // 要求用户交互，更醒目
    });

    console.log('已发送下班通知:', message);
}

// 发送下班时间通知（由专门的定时器触发）
async function sendOffWorkTimeNotification() {
    // 主动查询系统空闲状态
    const idleState = await chrome.idle.queryState(60);

    // 如果系统已锁屏或空闲，跳过通知
    if (idleState === 'locked' || idleState === 'idle') {
        console.log('系统已锁屏或空闲，跳过下班通知');
        return;
    }

    const config = await getConfig();
    const today = new Date().toDateString();

    // 检查今天是否已发送过
    if (config.lastOffWorkNotifyDate === today) {
        console.log('今天已发送过下班通知');
        return;
    }

    // 发送通知
    await sendOffWorkNotification(config);

    // 记录今天已发送下班通知
    await chrome.storage.sync.set({ lastOffWorkNotifyDate: today });
    console.log('已发送下班时间通知');
}

// 从消息池获取下一条消息
async function getNextMessage(config) {
    let pool = config.messagePool || [];
    const customMessages = config.customMessages || DEFAULT_CONFIG.customMessages;
    const shouldShuffle = config.shuffleMessages !== false;  // 默认为 true

    // 如果池为空，重新填充
    if (pool.length === 0) {
        pool = [...customMessages];

        // 打乱顺序
        if (shouldShuffle) {
            for (let i = pool.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [pool[i], pool[j]] = [pool[j], pool[i]];
            }
        }
    }

    // 从池中取出第一条
    const message = pool.shift();

    // 更新存储中的消息池
    await chrome.storage.sync.set({ messagePool: pool });

    return message;
}

// 监听来自 popup 的测试通知请求
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'testNotification') {
        const message = request.message;

        // 使用异步函数处理
        (async () => {
            try {
                // 获取或生成图标
                if (!cachedIconUrl) {
                    cachedIconUrl = await generateIconDataUrl();
                }

                chrome.notifications.create({
                    type: 'basic',
                    iconUrl: cachedIconUrl,
                    title: '⏰ 加班提醒（测试）',
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

        // 返回 true 表示将异步发送响应
        return true;
    }
});
