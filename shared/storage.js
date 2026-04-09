import { LOCAL_DEFAULT_STATE, SYNC_DEFAULT_CONFIG } from './constants.js';

export async function getConfig() {
    const [config, runtimeState] = await Promise.all([
        chrome.storage.sync.get(SYNC_DEFAULT_CONFIG),
        chrome.storage.local.get(LOCAL_DEFAULT_STATE)
    ]);

    return { ...config, ...runtimeState };
}

export async function getSyncConfig() {
    return chrome.storage.sync.get(SYNC_DEFAULT_CONFIG);
}

export async function saveSyncConfig(partialConfig) {
    await chrome.storage.sync.set(partialConfig);
}

export async function setRuntimeState(partialState) {
    await chrome.storage.local.set(partialState);
}

export async function resetMessagePool() {
    await setRuntimeState({ messagePool: [] });
}

export async function migrateRuntimeState() {
    const legacyState = await chrome.storage.sync.get(['messagePool', 'lastOffWorkNotifyDate']);
    const nextRuntimeState = {};
    const keysToRemove = [];

    if (Array.isArray(legacyState.messagePool)) {
        nextRuntimeState.messagePool = legacyState.messagePool;
        keysToRemove.push('messagePool');
    }

    if (typeof legacyState.lastOffWorkNotifyDate === 'string' || legacyState.lastOffWorkNotifyDate === null) {
        nextRuntimeState.lastOffWorkNotifyDate = legacyState.lastOffWorkNotifyDate;
        keysToRemove.push('lastOffWorkNotifyDate');
    }

    if (Object.keys(nextRuntimeState).length > 0) {
        await chrome.storage.local.set(nextRuntimeState);
    }

    if (keysToRemove.length > 0) {
        await chrome.storage.sync.remove(keysToRemove);
    }
}
