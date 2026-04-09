import { STATUS_MESSAGES } from './constants.js';

export function getCountdownState(now, offWorkTime) {
    if (!offWorkTime) {
        return {
            hours: '--',
            minutes: '--',
            seconds: '--',
            isOvertime: false,
            label: STATUS_MESSAGES.countdownBeforeOffWork,
            status: STATUS_MESSAGES.countdownMissingOffWorkTime
        };
    }

    const [offHour, offMinute] = offWorkTime.split(':').map(Number);
    const offWorkDate = new Date(now);
    offWorkDate.setHours(offHour, offMinute, 0, 0);

    const diff = offWorkDate.getTime() - now.getTime();
    const isOvertime = diff < 0;
    const timeDiff = Math.abs(diff);

    const hours = Math.floor(timeDiff / (1000 * 60 * 60));
    const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((timeDiff % (1000 * 60)) / 1000);

    return {
        hours,
        minutes,
        seconds,
        isOvertime,
        label: isOvertime ? STATUS_MESSAGES.countdownAfterOffWork : STATUS_MESSAGES.countdownBeforeOffWork,
        status: ''
    };
}

export function formatTimeUnit(value) {
    return String(value).padStart(2, '0');
}
