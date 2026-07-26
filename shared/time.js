import { STATUS_MESSAGES } from './constants.js';

const OVERTIME_ROLLOVER_HOUR = 6;

export function getRelevantOffWorkDate(now, offWorkTime) {
    const [offHour, offMinute] = offWorkTime.split(':').map(Number);
    const offWorkDate = new Date(now);
    offWorkDate.setHours(offHour, offMinute, 0, 0);

    // 凌晨仍视为前一个工作日，避免跨过午夜后加班计时被重置。
    const isEarlyMorning = now.getHours() < OVERTIME_ROLLOVER_HOUR;
    const isDaytimeSchedule = offHour >= OVERTIME_ROLLOVER_HOUR;
    if (isEarlyMorning && isDaytimeSchedule && offWorkDate.getTime() > now.getTime()) {
        offWorkDate.setDate(offWorkDate.getDate() - 1);
    }

    return offWorkDate;
}

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

    const offWorkDate = getRelevantOffWorkDate(now, offWorkTime);

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
