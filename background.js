// 默认配置
const DEFAULT_CONFIG = {
    offWorkTime: '18:00',
    reminderInterval: 30,
    customMessages: [
        '你的工位不会给你养老，但你的腰会。',
        '加班不会写进 OKR，但会写进病历。',
        '加班不会升职，只会升肝酶。'
    ]
};

// 固定提示前缀
const FIXED_PREFIX = '你已加班{hours}小时{minutes}分钟，别忘了回家！';


// 定时器名称
const ALARM_NAME = 'offwork-reminder-alarm';

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
});

// 启动时也要设置定时器
chrome.runtime.onStartup.addListener(async () => {
    await setupAlarm();
});

// 监听定时器触发
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === ALARM_NAME) {
        await checkAndNotify();
    }
});

// 监听配置变化
chrome.storage.onChanged.addListener(async (changes, areaName) => {
    if (areaName === 'sync') {
        if (changes.reminderInterval) {
            await setupAlarm();
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

// 检查并发送通知
async function checkAndNotify() {
    const config = await getConfig();
    const now = new Date();

    // 解析下班时间
    const [offHour, offMinute] = config.offWorkTime.split(':').map(Number);
    const offWorkDate = new Date(now);
    offWorkDate.setHours(offHour, offMinute, 0, 0);

    // 计算加班时长（毫秒）
    const overtimeMs = now.getTime() - offWorkDate.getTime();

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

    // 随机选择一条自定义提示语
    const customMessages = config.customMessages || DEFAULT_CONFIG.customMessages;
    const randomMessage = customMessages[Math.floor(Math.random() * customMessages.length)];

    // 拼接完整消息
    const message = prefix + '\n' + randomMessage;

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
