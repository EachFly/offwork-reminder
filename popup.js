// 默认配置
const DEFAULT_CONFIG = {
    offWorkTime: '18:00',
    reminderInterval: 30,
    customMessages: [
        '你的工位不会给你养老，但你的腰会。',
        '加班不会写进 OKR，但会写进病历。',
        '加班不会升职，只会升肝酶。'
    ],
    messagePool: [],
    shuffleMessages: true
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

// 当前消息列表
let currentMessages = [];

// 页面加载时获取配置
document.addEventListener('DOMContentLoaded', loadConfig);

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

// 加载配置
async function loadConfig() {
    try {
        const config = await chrome.storage.sync.get(DEFAULT_CONFIG);
        offWorkTimeInput.value = config.offWorkTime;
        reminderIntervalInput.value = config.reminderInterval;
        currentMessages = config.customMessages || DEFAULT_CONFIG.customMessages;
        renderMessageList();
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

// 显示状态消息
function showStatus(message, type) {

    // 3秒后隐藏
    setTimeout(() => {
        statusDiv.className = 'status';
    }, 3000);
}
