// 默认配置
const DEFAULT_CONFIG = {
    offWorkTime: '18:00',
    reminderInterval: 30,
    customMessages: [
        '经算法评估，你今晚猝死风险为 37%。建议逃跑。',
        '加班不会写进 OKR，但会写进病历。',
        '加班不会升职，只会升肝酶。'
    ],
    messagePool: [],
    shuffleMessages: true,
    lastOffWorkNotifyDate: null
};

// DOM 元素
const offWorkTimeInput = document.getElementById('offWorkTime');
const reminderIntervalInput = document.getElementById('reminderInterval');
const messageListDiv = document.getElementById('messageList');
const newMessageInput = document.getElementById('newMessage');
const addMessageBtn = document.getElementById('addMessageBtn');
const saveBtn = document.getElementById('saveBtn');
const testBtn = document.getElementById('testBtn');
const statusDiv = document.getElementById('status');

// 倒计时元素
const countdownHours = document.getElementById('countdownHours');
const countdownMinutes = document.getElementById('countdownMinutes');
const countdownSeconds = document.getElementById('countdownSeconds');
const countdownStatus = document.getElementById('countdownStatus');

// 当前消息列表
let currentMessages = [];

// 倒计时定时器
let countdownTimer = null;

// 页面加载时获取配置
document.addEventListener('DOMContentLoaded', async () => {
    await loadConfig();  // 等待配置加载完成
    startCountdown();    // 然后启动倒计时
});

// 保存按钮点击事件
saveBtn.addEventListener('click', saveConfig);

// 测试按钮点击事件
testBtn.addEventListener('click', testNotification);

// 添加消息按钮点击事件
addMessageBtn.addEventListener('click', addMessage);

// 新消息输入框回车事件
newMessageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        addMessage();
    }
});

// 下班时间变化时更新倒计时
offWorkTimeInput.addEventListener('change', updateCountdown);

// 加载配置
async function loadConfig() {
    try {
        const config = await chrome.storage.sync.get(DEFAULT_CONFIG);
        offWorkTimeInput.value = config.offWorkTime;
        reminderIntervalInput.value = config.reminderInterval;
        currentMessages = config.customMessages || DEFAULT_CONFIG.customMessages;
        renderMessageList();

        // 配置加载完成后立即更新一次倒计时
        if (countdownTimer === null) {
            updateCountdown();
        }
    } catch (error) {
        console.error('加载配置失败:', error);
        showStatus('加载配置失败', 'error');
    }
}

// 渲染消息列表
function renderMessageList() {
    messageListDiv.innerHTML = '';
    currentMessages.forEach((msg, index) => {
        const item = document.createElement('div');
        item.className = 'message-item';

        const text = document.createElement('span');
        text.className = 'message-text';
        text.textContent = msg;

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.textContent = '删除';
        deleteBtn.onclick = () => deleteMessage(index);

        item.appendChild(text);
        item.appendChild(deleteBtn);
        messageListDiv.appendChild(item);
    });
}

// 添加消息
function addMessage() {
    const newMsg = newMessageInput.value.trim();
    if (!newMsg) {
        showStatus('请输入提示语', 'error');
        return;
    }

    if (currentMessages.includes(newMsg)) {
        showStatus('该提示语已存在', 'error');
        return;
    }

    currentMessages.push(newMsg);
    newMessageInput.value = '';
    renderMessageList();
    showStatus('✓ 已添加，记得保存', 'success');
}

// 删除消息
function deleteMessage(index) {
    if (currentMessages.length <= 1) {
        showStatus('至少保留一条提示语', 'error');
        return;
    }

    currentMessages.splice(index, 1);
    renderMessageList();
    showStatus('✓ 已删除，记得保存', 'success');
}

// 保存配置
async function saveConfig() {
    const offWorkTime = offWorkTimeInput.value;
    const reminderInterval = parseInt(reminderIntervalInput.value, 10);

    // 验证
    if (!offWorkTime) {
        showStatus('请设置下班时间', 'error');
        return;
    }

    if (!reminderInterval || reminderInterval < 1 || reminderInterval > 120) {
        showStatus('提醒频率需在 1-120 分钟之间', 'error');
        return;
    }

    if (currentMessages.length === 0) {
        showStatus('至少需要一条提示语', 'error');
        return;
    }

    try {
        await chrome.storage.sync.set({
            offWorkTime,
            reminderInterval,
            customMessages: currentMessages,
            messagePool: []  // 重置消息池，确保新配置生效
        });
        showStatus('✓ 设置已保存', 'success');
    } catch (error) {
        console.error('保存配置失败:', error);
        showStatus('保存失败，请重试', 'error');
    }
}

// 测试通知
async function testNotification() {
    if (currentMessages.length === 0) {
        showStatus('请先添加提示语', 'error');
        return;
    }

    // 生成固定前缀（使用示例时间）
    const prefix = '你已加班2小时30分钟，别忘了回家！';

    // 随机选择一条提示语
    const randomMessage = currentMessages[Math.floor(Math.random() * currentMessages.length)];

    // 拼接完整消息
    const testMessage = prefix + '\n' + randomMessage;

    try {
        chrome.runtime.sendMessage({
            action: 'testNotification',
            message: testMessage
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('通信错误:', chrome.runtime.lastError);
                showStatus('错误: ' + chrome.runtime.lastError.message, 'error');
            } else if (response && response.success) {
                showStatus('✓ 测试通知已发送', 'success');
            } else if (response && response.error) {
                console.error('通知错误:', response.error);
                showStatus('错误: ' + response.error, 'error');
            } else {
                showStatus('发送失败', 'error');
            }
        });
    } catch (error) {
        console.error('发送请求失败:', error);
        showStatus('请求失败', 'error');
    }
}

// 启动倒计时
function startCountdown() {
    updateCountdown();
    countdownTimer = setInterval(updateCountdown, 1000);
}

// 更新倒计时显示
function updateCountdown() {
    const offWorkTime = offWorkTimeInput.value;
    const countdownLabel = document.querySelector('.countdown-label');
    const countdownDisplay = document.querySelector('.countdown-display');

    if (!offWorkTime) {
        countdownHours.textContent = '--';
        countdownMinutes.textContent = '--';
        countdownSeconds.textContent = '--';
        countdownStatus.textContent = '请设置下班时间';
        countdownLabel.textContent = '距离下班还有';
        countdownLabel.classList.remove('overtime');
        countdownDisplay.classList.remove('overtime');
        return;
    }

    const now = new Date();
    const [offHour, offMinute] = offWorkTime.split(':').map(Number);
    const offWorkDate = new Date(now);
    offWorkDate.setHours(offHour, offMinute, 0, 0);

    const diff = offWorkDate.getTime() - now.getTime();

    if (diff < 0) {
        // 已经过了下班时间
        const overtimeDiff = Math.abs(diff);
        const hours = Math.floor(overtimeDiff / (1000 * 60 * 60));
        const minutes = Math.floor((overtimeDiff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((overtimeDiff % (1000 * 60)) / 1000);

        countdownHours.textContent = String(hours).padStart(2, '0');
        countdownMinutes.textContent = String(minutes).padStart(2, '0');
        countdownSeconds.textContent = String(seconds).padStart(2, '0');
        countdownLabel.textContent = '已加班时长';
        countdownLabel.classList.add('overtime');
        countdownDisplay.classList.add('overtime');
        countdownStatus.textContent = '';
        countdownStatus.className = 'countdown-status overtime';
    } else {
        // 还没到下班时间
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);

        countdownHours.textContent = String(hours).padStart(2, '0');
        countdownMinutes.textContent = String(minutes).padStart(2, '0');
        countdownSeconds.textContent = String(seconds).padStart(2, '0');
        countdownLabel.textContent = '距离下班还有';
        countdownLabel.classList.remove('overtime');
        countdownDisplay.classList.remove('overtime');
        countdownStatus.textContent = '';
        countdownStatus.className = 'countdown-status';
    }
}

// 显示状态消息
function showStatus(message, type) {

    // 3秒后隐藏
    setTimeout(() => {
        statusDiv.className = 'status';
    }, 3000);
}
