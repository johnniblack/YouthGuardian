// YouthGuardian Background Service Worker
// 青少年视频网站白名单限制插件 - 后台服务线程

import { onMessage } from '../shared/messaging';
import { getSettings, setSettings } from '../shared/storage';
import { verifyPassword, setPassword } from '../shared/security';
import {
  addChannel,
  removeChannel,
  clearAllChannels,
  getAllowedChannelsList
} from '../shared/whitelist';

// 消息处理
onMessage(async (message, sender, sendResponse) => {
  switch (message.type) {
    case 'GET_RESTRICTION_STATUS': {
      const settings = await getSettings();
      sendResponse({ restrictionEnabled: settings.restrictionEnabled });
      break;
    }

    case 'TOGGLE_RESTRICTION': {
      const { enabled, password } = message.payload;
      const settings = await getSettings();

      // 如果启用密码保护，需要验证
      if (settings.passwordEnabled) {
        const valid = await verifyPassword(password);
        if (!valid) {
          sendResponse({ success: false, error: '密码错误' });
          return;
        }
      }

      settings.restrictionEnabled = enabled;
      await setSettings(settings);

      // 通知所有标签页
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'RESTRICTION_CHANGED',
            payload: { restrictionEnabled: enabled }
          }).catch(() => {});
        }
      }

      sendResponse({ success: true });
      break;
    }

    case 'GET_ALLOWED_CHANNELS': {
      const channels = await getAllowedChannelsList();
      sendResponse({ channels });
      break;
    }

    case 'ADD_CHANNEL': {
      const { channel } = message.payload;
      await addChannel(channel);
      sendResponse({ success: true });
      break;
    }

    case 'REMOVE_CHANNEL': {
      const { id, password } = message.payload;
      const settings = await getSettings();

      if (settings.passwordEnabled) {
        const valid = await verifyPassword(password);
        if (!valid) {
          sendResponse({ success: false, error: '密码错误' });
          return;
        }
      }

      await removeChannel(id);
      sendResponse({ success: true });
      break;
    }

    case 'CLEAR_CHANNELS': {
      const { password } = message.payload;
      const settings = await getSettings();

      if (settings.passwordEnabled) {
        const valid = await verifyPassword(password);
        if (!valid) {
          sendResponse({ success: false, error: '密码错误' });
          return;
        }
      }

      await clearAllChannels();
      sendResponse({ success: true });
      break;
    }

    case 'SET_PASSWORD': {
      const { password } = message.payload;
      await setPassword(password);
      const settings = await getSettings();
      settings.passwordEnabled = true;
      await setSettings(settings);
      sendResponse({ success: true });
      break;
    }

    case 'CHECK_PASSWORD_SET': {
      const settings = await getSettings();
      sendResponse({ passwordEnabled: settings.passwordEnabled });
      break;
    }

    default:
      sendResponse({ error: '未知消息类型' });
  }

  return true;
});
