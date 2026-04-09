export const SYNC_DEFAULT_CONFIG = {
    offWorkTime: '18:00',
    reminderInterval: 30,
    customMessages: [
        '经算法评估，你今晚猝死风险为 37%。建议逃跑。',
        '加班不会写进 OKR，但会写进病历。',
        '加班不会升职，只会升肝酶。'
    ],
    shuffleMessages: true
};

export const LOCAL_DEFAULT_STATE = {
    messagePool: [],
    lastOffWorkNotifyDate: null
};

export const FIXED_PREFIX = '你已加班{hours}小时{minutes}分钟，别忘了回家！';

export const STATUS_MESSAGES = {
    loadConfigFailed: '加载配置失败',
    emptyMessage: '请输入提示语',
    duplicateMessage: '该提示语已存在',
    addedMessage: '✓ 已添加，记得保存',
    keepOneMessage: '至少保留一条提示语',
    deletedMessage: '✓ 已删除，记得保存',
    missingOffWorkTime: '请设置下班时间',
    invalidReminderInterval: '提醒频率需在 1-120 分钟之间',
    missingCustomMessages: '至少需要一条提示语',
    saveSuccess: '✓ 设置已保存',
    saveFailed: '保存失败，请重试',
    missingTestMessage: '请先添加提示语',
    testNotificationSuccess: '✓ 测试通知已发送',
    requestFailed: '请求失败',
    sendFailed: '发送失败',
    countdownMissingOffWorkTime: '请设置下班时间',
    countdownBeforeOffWork: '距离下班还有',
    countdownAfterOffWork: '已加班时长'
};

export const ALARM_NAMES = {
    reminder: 'offwork-reminder-alarm',
    offWork: 'offwork-time-alarm'
};

export const NOTIFICATION_TITLES = {
    reminder: '⏰ 加班提醒',
    offWork: '🎉 下班时间到！',
    test: '⏰ 加班提醒（测试）'
};
