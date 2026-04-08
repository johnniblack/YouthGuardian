// YouthGuardian 消息通信层
// 封装 Popup、Background、Content Script 之间的通信

import {
  PopupToBackgroundMessage,
  BackgroundToPopupMessage,
  ContentToBackgroundMessage
} from './types';

/**
 * 发送到后台服务线程
 */
export function sendToBackground(
  message: PopupToBackgroundMessage | ContentToBackgroundMessage
): Promise<BackgroundToPopupMessage> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

/**
 * 发送到指定标签页的内容脚本
 */
export function sendToContent(
  tabId: number,
  message: ContentToBackgroundMessage
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

/**
 * 获取当前活动标签
 */
export async function getCurrentTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

/**
 * 消息回调类型
 */
type MessageCallback = (
  message: PopupToBackgroundMessage | ContentToBackgroundMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void
) => Promise<boolean | void>;

/**
 * 监听消息（用于 Background Service Worker）
 */
export function onMessage(callback: MessageCallback): void {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    callback(message as PopupToBackgroundMessage | ContentToBackgroundMessage, sender, sendResponse);
    return true; // 保持消息通道开放
  });
}

/**
 * 监听来自内容脚本的消息
 */
export function onContentMessage(callback: MessageCallback): void {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.tab) {
      callback(message as ContentToBackgroundMessage, sender, sendResponse);
    }
    return true;
  });
}
