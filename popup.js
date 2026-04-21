import { FIXED_PREFIX, STATUS_MESSAGES } from './shared/constants.js';
import { getSyncConfig, saveSyncConfig } from './shared/storage.js';
import { formatTimeUnit, getCountdownState } from './shared/time.js';

// DOM 元素
const offWorkTimeInput = document.getElementById('offWorkTime');
const reminderIntervalInput = document.getElementById('reminderInterval');
const messageListDiv = document.getElementById('messageList');
const newMessageInput = document.getElementById('newMessage');
const addMessageBtn = document.getElementById('addMessageBtn');
const saveBtn = document.getElementById('saveBtn');
const testBtn = document.getElementById('testBtn');
const statusDiv = document.getElementById('status');

// 折叠面板元素
const toggleBasicSettingsBtn = document.getElementById('toggleBasicSettingsBtn');
const basicSettingsSection = document.getElementById('basicSettingsSection');
const toggleCustomMessagesBtn = document.getElementById('toggleCustomMessagesBtn');
const customMessagesSection = document.getElementById('customMessagesSection');

// 倒计时元素
const countdownHours = document.getElementById('countdownHours');
const countdownMinutes = document.getElementById('countdownMinutes');
const countdownSeconds = document.getElementById('countdownSeconds');
const countdownStatus = document.getElementById('countdownStatus');
const countdownLabel = document.querySelector('.countdown-label');
const countdownDisplay = document.querySelector('.countdown-display');
const countdownSection = document.querySelector('.countdown-section');

// 当前消息列表
let currentMessages = [];

// 倒计时定时器
let countdownTimer = null;

// 页面加载时获取配置
document.addEventListener('DOMContentLoaded', async () => {
    await loadConfig();
    startCountdown();
});

// 折叠面板点击事件
toggleBasicSettingsBtn.addEventListener('click', () => {
    basicSettingsSection.classList.toggle('hidden');
    toggleBasicSettingsBtn.classList.toggle('expanded');
});

toggleCustomMessagesBtn.addEventListener('click', () => {
    customMessagesSection.classList.toggle('hidden');
    toggleCustomMessagesBtn.classList.toggle('expanded');
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
        const config = await getSyncConfig();
        offWorkTimeInput.value = config.offWorkTime;
        reminderIntervalInput.value = config.reminderInterval;
        currentMessages = config.customMessages;
        renderMessageList();

        if (countdownTimer === null) {
            updateCountdown();
        }
    } catch (error) {
        console.error('加载配置失败:', error);
        showStatus(STATUS_MESSAGES.loadConfigFailed, 'error');
    }
}

// 渲染消息列表
function renderMessageList() {
    messageListDiv.innerHTML = '';

    if (currentMessages.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'empty-message';
        emptyDiv.textContent = '暂无自定义提示语，请添加';
        messageListDiv.appendChild(emptyDiv);
        return;
    }

    currentMessages.forEach((msg, index) => {
        const item = document.createElement('div');
        item.className = 'message-item';

        const number = document.createElement('span');
        number.className = 'message-number';
        number.textContent = index + 1;

        const text = document.createElement('span');
        text.className = 'message-text';
        text.textContent = msg;

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.textContent = '删除';
        deleteBtn.onclick = () => deleteMessage(index);

        item.appendChild(number);
        item.appendChild(text);
        item.appendChild(deleteBtn);
        messageListDiv.appendChild(item);
    });
}

// 添加消息
function addMessage() {
    const newMsg = newMessageInput.value.trim();
    if (!newMsg) {
        showStatus(STATUS_MESSAGES.emptyMessage, 'error');
        return;
    }

    if (currentMessages.includes(newMsg)) {
        showStatus(STATUS_MESSAGES.duplicateMessage, 'error');
        return;
    }

    currentMessages.push(newMsg);
    newMessageInput.value = '';
    renderMessageList();
    showStatus(STATUS_MESSAGES.addedMessage, 'success');
}

// 删除消息
function deleteMessage(index) {
    if (currentMessages.length <= 1) {
        showStatus(STATUS_MESSAGES.keepOneMessage, 'error');
        return;
    }

    currentMessages.splice(index, 1);
    renderMessageList();
    showStatus(STATUS_MESSAGES.deletedMessage, 'success');
}

function collectFormData() {
    return {
        offWorkTime: offWorkTimeInput.value,
        reminderInterval: parseInt(reminderIntervalInput.value, 10),
        customMessages: currentMessages
    };
}

function validateFormData({ offWorkTime, reminderInterval, customMessages }) {
    if (!offWorkTime) {
        return STATUS_MESSAGES.missingOffWorkTime;
    }

    if (!reminderInterval || reminderInterval < 1 || reminderInterval > 120) {
        return STATUS_MESSAGES.invalidReminderInterval;
    }

    if (customMessages.length === 0) {
        return STATUS_MESSAGES.missingCustomMessages;
    }

    return null;
}

async function saveConfig() {
    const formData = collectFormData();
    const validationError = validateFormData(formData);

    if (validationError) {
        showStatus(validationError, 'error');
        return;
    }

    try {
        await saveSyncConfig(formData);
        showStatus(STATUS_MESSAGES.saveSuccess, 'success');
    } catch (error) {
        console.error('保存配置失败:', error);
        showStatus(STATUS_MESSAGES.saveFailed, 'error');
    }
}

// 测试通知
async function testNotification() {
    if (currentMessages.length === 0) {
        showStatus(STATUS_MESSAGES.missingTestMessage, 'error');
        return;
    }

    const prefix = FIXED_PREFIX
        .replace('{hours}', '2')
        .replace('{minutes}', '30');
    const randomMessage = currentMessages[Math.floor(Math.random() * currentMessages.length)];
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
                showStatus(STATUS_MESSAGES.testNotificationSuccess, 'success');
            } else if (response && response.error) {
                console.error('通知错误:', response.error);
                showStatus('错误: ' + response.error, 'error');
            } else {
                showStatus(STATUS_MESSAGES.sendFailed, 'error');
            }
        });
    } catch (error) {
        console.error('发送请求失败:', error);
        showStatus(STATUS_MESSAGES.requestFailed, 'error');
    }
}

// 启动倒计时
function startCountdown() {
    updateCountdown();
    countdownTimer = setInterval(updateCountdown, 1000);
}

function renderCountdown(countdownState) {
    countdownHours.textContent = formatTimeUnit(countdownState.hours);
    countdownMinutes.textContent = formatTimeUnit(countdownState.minutes);
    countdownSeconds.textContent = formatTimeUnit(countdownState.seconds);
    countdownLabel.textContent = countdownState.label;
    countdownLabel.classList.toggle('overtime', countdownState.isOvertime);
    countdownDisplay.classList.toggle('overtime', countdownState.isOvertime);
    
    countdownSection.classList.remove('overtime', 'overtime-level-1', 'overtime-level-2', 'overtime-level-3');
    if (countdownState.isOvertime) {
        let levelClass = 'overtime-level-1'; // < 1h
        if (countdownState.hours >= 2) {
            levelClass = 'overtime-level-3'; // >= 2h
        } else if (countdownState.hours >= 1) {
            levelClass = 'overtime-level-2'; // 1h <= t < 2h
        }
        countdownSection.classList.add('overtime', levelClass);
    }
    
    countdownStatus.textContent = countdownState.status;
    countdownStatus.className = countdownState.isOvertime ? 'countdown-status overtime' : 'countdown-status';
}

function updateCountdown() {
    const countdownState = getCountdownState(new Date(), offWorkTimeInput.value);
    renderCountdown(countdownState);
}

// 显示状态消息
function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = 'status ' + type;

    setTimeout(() => {
        statusDiv.className = 'status';
        statusDiv.textContent = '';
    }, 3000);
}
