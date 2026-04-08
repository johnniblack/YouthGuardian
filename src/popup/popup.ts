// YouthGuardian Popup 脚本
// 标签页切换、视频扫描、频道管理、密码交互

// ==================== 类型定义 ====================

interface AllowedChannel {
  id: string;
  platform: 'youtube' | 'bilibili';
  authorName: string;
  authorId?: string;
  authorUrl?: string;
  videoUrl?: string;
  createdAt: number;
  source: 'manual' | 'page-detected';
}

interface VideoItem {
  id: string;
  platform: 'youtube' | 'bilibili';
  title: string;
  authorName: string;
  authorId?: string;
  authorUrl?: string;
  duration?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
}

interface Settings {
  restrictionEnabled: boolean;
  passwordEnabled: boolean;
}

interface PasswordMeta {
  passwordHash: string;
  salt: string;
  updatedAt: number;
}

const STORAGE_KEYS = {
  ALLOWED_CHANNELS: 'allowed_channels',
  SETTINGS: 'settings',
  PASSWORD_META: 'password_meta'
};

// ==================== 存储层 ====================

async function getAllowedChannels(): Promise<AllowedChannel[]> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.ALLOWED_CHANNELS);
  return result[STORAGE_KEYS.ALLOWED_CHANNELS] || [];
}

async function setAllowedChannels(channels: AllowedChannel[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.ALLOWED_CHANNELS]: channels });
}

async function getSettings(): Promise<Settings> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  return result[STORAGE_KEYS.SETTINGS] || { restrictionEnabled: false, passwordEnabled: false };
}

async function setSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: settings });
}

async function getPasswordMeta(): Promise<PasswordMeta | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.PASSWORD_META);
  return result[STORAGE_KEYS.PASSWORD_META] || null;
}

async function setPasswordMeta(meta: PasswordMeta): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.PASSWORD_META]: meta });
}

// ==================== 密码安全 ====================

function generateSalt(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(password: string, salt: string): Promise<string> {
  return sha256(password + salt);
}

async function verifyPassword(password: string): Promise<boolean> {
  const meta = await getPasswordMeta();
  if (!meta) return false;
  const hash = await hashPassword(password, meta.salt);
  return hash === meta.passwordHash;
}

async function setPassword(password: string): Promise<void> {
  const salt = generateSalt();
  const hash = await hashPassword(password, salt);
  await setPasswordMeta({ passwordHash: hash, salt, updatedAt: Date.now() });
}

// ==================== 白名单 ====================

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

function generateChannelId(channel: Partial<AllowedChannel>): string {
  const platform = channel.platform;
  // 优先级：authorId（最稳定）> videoUrl（合辑/特殊视频）> authorUrl > authorName
  if (channel.authorId) {
    const id = `${platform}_id_${channel.authorId}`;
    console.log('[generateChannelId] 使用 authorId:', id);
    return id;
  }
  if (channel.videoUrl) {
    const id = `${platform}_video_${hashString(channel.videoUrl)}`;
    console.log('[generateChannelId] 使用 videoUrl:', id);
    return id;
  }
  if (channel.authorUrl) {
    const id = `${platform}_url_${hashString(channel.authorUrl)}`;
    console.log('[generateChannelId] 使用 authorUrl:', id);
    return id;
  }
  const id = `${platform}_name_${hashString(channel.authorName || '')}`;
  console.log('[generateChannelId] 使用 authorName:', id);
  return id;
}

async function isChannelAllowed(channel: Partial<AllowedChannel>): Promise<boolean> {
  const channels = await getAllowedChannels();
  const id = generateChannelId(channel);
  console.log('[isChannelAllowed] 生成的 ID:', id);
  console.log('[isChannelAllowed] 白名单中的所有 ID:', channels.map(c => c.id));

  // 首先尝试精确匹配生成的 ID
  let result = channels.some(c => c.id === id);

  // 如果未找到，尝试多字段匹配（向后兼容之前不同优先级生成的 ID）
  if (!result) {
    result = channels.some(c => {
      // 同平台且至少一个字段匹配
      if (c.platform !== channel.platform) return false;

      // 精确匹配 videoUrl（合辑场景）
      if (channel.videoUrl && c.videoUrl && channel.videoUrl === c.videoUrl) return true;

      // 精确匹配 authorId
      if (channel.authorId && c.authorId && channel.authorId === c.authorId) return true;

      // 精确匹配 authorUrl
      if (channel.authorUrl && c.authorUrl && channel.authorUrl === c.authorUrl) return true;

      // 匹配 authorName
      if (channel.authorName && c.authorName && channel.authorName === c.authorName) return true;

      return false;
    });
  }

  console.log('[isChannelAllowed] 匹配结果:', result);
  return result;
}

async function addChannel(channel: Omit<AllowedChannel, 'id' | 'createdAt' | 'source'>): Promise<AllowedChannel> {
  const channels = await getAllowedChannels();
  const id = generateChannelId(channel);
  const exists = channels.some(c => c.id === id);
  if (exists) return channels.find(c => c.id === id)!;
  const newChannel: AllowedChannel = { ...channel, id, createdAt: Date.now(), source: 'manual' };
  channels.push(newChannel);
  await setAllowedChannels(channels);
  return newChannel;
}

// ==================== 消息通信 ====================

function sendToBackground(message: unknown): Promise<unknown> {
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

async function getCurrentTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

// ==================== 状态 ====================

let currentVideos: VideoItem[] = [];
let currentChannels: AllowedChannel[] = [];
let restrictionEnabled = false;
let passwordEnabled = false;

// ==================== DOM 元素 ====================

const elements = {
  tabs: document.querySelectorAll('.tab') as NodeListOf<HTMLButtonElement>,
  panels: document.querySelectorAll('.tab-panel') as NodeListOf<HTMLElement>,
  platform: document.getElementById('platform') as HTMLDivElement,
  restrictionStatus: document.getElementById('restriction-status') as HTMLDivElement,
  channelCount: document.getElementById('channel-count') as HTMLSpanElement,
  btnToggle: document.getElementById('btn-toggle') as HTMLButtonElement,
  videoList: document.getElementById('video-list') as HTMLDivElement,
  videoEmpty: document.getElementById('video-empty') as HTMLDivElement,
  btnRescan: document.getElementById('btn-rescan') as HTMLButtonElement,
  // YouTube 频道列表
  youtubeList: document.getElementById('youtube-list') as HTMLDivElement,
  youtubeEmpty: document.getElementById('youtube-empty') as HTMLDivElement,
  youtubeCount: document.getElementById('youtube-count') as HTMLSpanElement,
  btnClearYoutube: document.getElementById('btn-clear-youtube') as HTMLButtonElement,
  // Bilibili 频道列表
  bilibiliList: document.getElementById('bilibili-list') as HTMLDivElement,
  bilibiliEmpty: document.getElementById('bilibili-empty') as HTMLDivElement,
  bilibiliCount: document.getElementById('bilibili-count') as HTMLSpanElement,
  btnClearBilibili: document.getElementById('btn-clear-bilibili') as HTMLButtonElement,
  // 全部清空
  btnClearAll: document.getElementById('btn-clear-all') as HTMLButtonElement,
  // 密码相关
  passwordNotSet: document.getElementById('password-not-set') as HTMLDivElement,
  passwordSet: document.getElementById('password-set') as HTMLDivElement,
  btnSetPassword: document.getElementById('btn-set-password') as HTMLButtonElement,
  btnChangePassword: document.getElementById('btn-change-password') as HTMLButtonElement,
  passwordModal: document.getElementById('password-modal') as HTMLDivElement,
  modalTitle: document.getElementById('modal-title') as HTMLHeadingElement,
  modalMessage: document.getElementById('modal-message') as HTMLParagraphElement,
  passwordInput: document.getElementById('password-input') as HTMLInputElement,
  confirmPasswordGroup: document.getElementById('confirm-password-group') as HTMLDivElement,
  confirmPasswordInput: document.getElementById('confirm-password-input') as HTMLInputElement,
  modalCancel: document.getElementById('modal-cancel') as HTMLButtonElement,
  modalConfirm: document.getElementById('modal-confirm') as HTMLButtonElement,
  modalError: document.getElementById('modal-error') as HTMLParagraphElement
};

// ==================== 初始化 ====================

async function init(): Promise<void> {
  console.log('YouthGuardian popup init');
  await loadStatus();
  await loadChannels();
  setupEventListeners();
  renderVideoList();
}

// ==================== 状态加载 ====================

async function loadStatus(): Promise<void> {
  try {
    console.log('loadStatus called');
    const tab = await getCurrentTab();
    console.log('tab:', tab);
    const url = tab?.url || '';
    console.log('url:', url);
    let platform: 'youtube' | 'bilibili' | 'unsupported' = 'unsupported';
    if (url.includes('youtube.com')) platform = 'youtube';
    else if (url.includes('bilibili.com')) platform = 'bilibili';
    const platformName = platform === 'youtube' ? 'YouTube' : platform === 'bilibili' ? 'Bilibili' : '不支持';
    elements.platform.textContent = platformName;
    console.log('platform set to:', platformName);

    const settings = await getSettings();
    restrictionEnabled = settings.restrictionEnabled;
    passwordEnabled = settings.passwordEnabled;
    updateRestrictionUI();
    updatePasswordUI();

    // 更新当前平台频道数量
    const channels = await getAllowedChannels();
    const platformChannels = channels.filter(c => c.platform === platform);
    elements.channelCount.textContent = platformChannels.length.toString();
  } catch (error) {
    console.error('加载状态失败:', error);
  }
}

async function loadChannels(): Promise<void> {
  try {
    currentChannels = await getAllowedChannels();
    await renderChannelList();
  } catch (error) {
    console.error('加载频道失败:', error);
  }
}

// ==================== UI 更新 ====================

function updateRestrictionUI(): void {
  const statusDot = elements.restrictionStatus.querySelector('.status-dot') as HTMLSpanElement;
  const statusText = elements.restrictionStatus.querySelector('.status-text') as HTMLSpanElement;
  if (restrictionEnabled) {
    statusDot.classList.add('active');
    statusText.textContent = '已开启';
    elements.btnToggle.textContent = '解除限制';
  } else {
    statusDot.classList.remove('active');
    statusText.textContent = '已关闭';
    elements.btnToggle.textContent = '开启限制';
  }
}

function updatePasswordUI(): void {
  elements.passwordNotSet.style.display = passwordEnabled ? 'none' : 'block';
  elements.passwordSet.style.display = passwordEnabled ? 'block' : 'none';
}

// ==================== 渲染 ====================

async function renderChannelList(): Promise<void> {
  // 按平台分组
  const youtubeChannels = currentChannels.filter(c => c.platform === 'youtube');
  const bilibiliChannels = currentChannels.filter(c => c.platform === 'bilibili');

  // 获取当前平台，更新为仅显示当前平台的频道数量
  const tab = await getCurrentTab();
  const url = tab?.url || '';
  let platform: 'youtube' | 'bilibili' | 'unsupported' = 'unsupported';
  if (url.includes('youtube.com')) platform = 'youtube';
  else if (url.includes('bilibili.com')) platform = 'bilibili';
  const platformChannels = currentChannels.filter(c => c.platform === platform);
  elements.channelCount.textContent = platformChannels.length.toString();

  // 渲染 YouTube 列表
  if (youtubeChannels.length === 0) {
    elements.youtubeEmpty.style.display = 'block';
    elements.youtubeList.innerHTML = '';
    elements.youtubeList.appendChild(elements.youtubeEmpty);
  } else {
    elements.youtubeEmpty.style.display = 'none';
    elements.youtubeList.innerHTML = youtubeChannels.map(channel => {
      const avatarUrl = channel.authorId
        ? `https://yt3.ggpht.com/ytc/${channel.authorId}`
        : '';
      const initial = channel.authorName.charAt(0).toUpperCase();
      return `
        <div class="channel-item" data-id="${channel.id}">
          ${avatarUrl
            ? `<img class="channel-avatar" src="${avatarUrl}" alt="${escapeAttr(channel.authorName)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">`
            : ''}
          <div class="channel-avatar-placeholder" style="display:${avatarUrl ? 'none' : 'flex'};">${initial}</div>
          <div class="channel-info">
            <div class="channel-name">${escapeHtml(channel.authorName)}</div>
            <div class="channel-platform youtube ${channel.videoUrl ? 'playlist' : 'channel'}">${channel.videoUrl ? '合辑' : '频道'}</div>
          </div>
          <button class="btn btn-small btn-danger btn-remove" data-id="${channel.id}">删除</button>
        </div>
      `;
    }).join('');
    elements.youtubeList.querySelectorAll('.btn-remove').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = (e.target as HTMLButtonElement).dataset.id;
        if (id) await removeChannel(id);
      });
    });
  }
  elements.youtubeCount.textContent = `(${youtubeChannels.length})`;

  // 渲染 Bilibili 列表
  if (bilibiliChannels.length === 0) {
    elements.bilibiliEmpty.style.display = 'block';
    elements.bilibiliList.innerHTML = '';
    elements.bilibiliList.appendChild(elements.bilibiliEmpty);
  } else {
    elements.bilibiliEmpty.style.display = 'none';
    elements.bilibiliList.innerHTML = bilibiliChannels.map(channel => {
      const initial = channel.authorName.charAt(0).toUpperCase();
      return `
        <div class="channel-item" data-id="${channel.id}">
          <div class="channel-avatar-placeholder" style="display:flex;">${initial}</div>
          <div class="channel-info">
            <div class="channel-name">${escapeHtml(channel.authorName)}</div>
            <div class="channel-platform bilibili ${channel.videoUrl ? 'playlist' : 'channel'}">${channel.videoUrl ? '合辑' : '频道'}</div>
          </div>
          <button class="btn btn-small btn-danger btn-remove" data-id="${channel.id}">删除</button>
        </div>
      `;
    }).join('');
    elements.bilibiliList.querySelectorAll('.btn-remove').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = (e.target as HTMLButtonElement).dataset.id;
        if (id) await removeChannel(id);
      });
    });
  }
  elements.bilibiliCount.textContent = `(${bilibiliChannels.length})`;
}

async function renderVideoList(): Promise<void> {
  console.log('renderVideoList called');
  try {
    const tab = await getCurrentTab();
    console.log('tab for scan:', tab);
    if (!tab?.id) { console.log('no tab id'); showVideoEmpty(); return; }
    console.log('sending SCAN_VIDEOS to tab', tab.id);
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'SCAN_VIDEOS' }) as { videos: VideoItem[] };
    console.log('scan response:', response);
    currentVideos = response?.videos || [];

    // 按频道名称去重：保留每个频道的第一个视频
    const seenChannels = new Set<string>();
    const uniqueVideos = currentVideos.filter(video => {
      const channelKey = video.authorName || '(未知频道)';
      if (seenChannels.has(channelKey)) {
        return false;
      }
      seenChannels.add(channelKey);
      return true;
    });

    if (uniqueVideos.length === 0) { console.log('no videos'); showVideoEmpty(); return; }
    elements.videoEmpty.style.display = 'none';
    const html = await Promise.all(uniqueVideos.map(async video => {
      const channelCheck = { platform: video.platform, authorId: video.authorId, authorUrl: video.authorUrl, authorName: video.authorName, videoUrl: video.videoUrl };
      console.log(`[renderVideoList] ${video.authorName}:`, {
        authorId: video.authorId || '(空)',
        authorUrl: video.authorUrl || '(空)',
        videoUrl: video.videoUrl || '(空)'
      });
      const allowed = await isChannelAllowed(channelCheck);
      console.log(`[renderVideoList] 频道 ${video.authorName} 的检查结果: ${allowed ? '已允许' : '未允许'}`);
      // 判断是合辑还是普通频道
      const isPlaylist = video.authorName === '合辑';
      const allowButtonText = isPlaylist ? (allowed ? '已允许' : '允许此视频') : (allowed ? '已允许' : '允许此频道');
      return `
        <div class="video-item" data-id="${video.id}">
          ${video.thumbnailUrl ? `<img class="video-thumbnail" src="${video.thumbnailUrl}" alt="${escapeAttr(video.title)}" loading="lazy">` : ''}
          <div class="video-info">
            <div class="video-title">${escapeHtml(video.title)}</div>
            <div class="video-meta">${escapeHtml(video.authorName)}</div>
            ${video.duration ? `<div class="video-duration">${video.duration}</div>` : ''}
          </div>
          <div class="video-actions">
            <button class="btn btn-small ${allowed ? 'btn-secondary' : 'btn-primary'} btn-allow"
                    data-author-name="${escapeAttr(video.authorName || '')}"
                    data-author-id="${escapeAttr(video.authorId || '')}"
                    data-author-url="${escapeAttr(video.authorUrl || '')}"
                    data-video-url="${escapeAttr(video.videoUrl || '')}"
                    data-platform="${video.platform}"
                    ${allowed ? 'disabled' : ''}>
              ${allowButtonText}
            </button>
          </div>
        </div>
      `;
    }));
    elements.videoList.innerHTML = html.join('');
    elements.videoList.querySelectorAll('.btn-allow:not([disabled])').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const target = e.target as HTMLButtonElement;
        const isPlaylist = target.dataset.authorName === '合辑';
        const channel = {
          authorName: target.dataset.authorName || '',
          authorId: target.dataset.authorId || undefined,
          authorUrl: target.dataset.authorUrl || undefined,
          videoUrl: isPlaylist ? (target.dataset.videoUrl || undefined) : undefined,
          platform: target.dataset.platform as 'youtube' | 'bilibili'
        };
        await addChannelToWhitelist(channel, target);
      });
    });
  } catch (error) {
    console.error('扫描视频失败:', error);
    showVideoEmpty();
  }
}

function showVideoEmpty(): void {
  elements.videoEmpty.style.display = 'block';
  elements.videoList.innerHTML = '';
  elements.videoList.appendChild(elements.videoEmpty);
}

// ==================== 操作 ====================

async function toggleRestriction(): Promise<void> {
  const newState = !restrictionEnabled;
  if (newState && passwordEnabled) {
    showPasswordModal('开启限制', '请输入密码以开启限制', async (password) => {
      const valid = await verifyPassword(password);
      if (!valid) { showModalError('密码错误'); return; }
      hidePasswordModal();
      await setSettings({ restrictionEnabled: true, passwordEnabled });
      restrictionEnabled = true;
      updateRestrictionUI();
    });
  } else if (newState) {
    await setSettings({ restrictionEnabled: true, passwordEnabled });
    restrictionEnabled = true;
    updateRestrictionUI();
  } else {
    showPasswordModal('解除限制', '请输入密码以解除限制', async (password) => {
      const valid = await verifyPassword(password);
      if (!valid) { showModalError('密码错误'); return; }
      hidePasswordModal();
      await setSettings({ restrictionEnabled: false, passwordEnabled });
      restrictionEnabled = false;
      updateRestrictionUI();
    });
  }
}

async function removeChannel(id: string): Promise<void> {
  showPasswordModal('删除频道', '请输入密码以确认删除', async (password) => {
    const valid = await verifyPassword(password);
    if (!valid) { showModalError('密码错误'); return; }
    hidePasswordModal();
    const channels = await getAllowedChannels();
    const filtered = channels.filter(c => c.id !== id);
    await setAllowedChannels(filtered);
    currentChannels = filtered;
    elements.channelCount.textContent = currentChannels.length.toString();
    renderChannelList();
  });
}

async function clearAllChannels(): Promise<void> {
  showPasswordModal('清空全部', '请输入密码以确认清空所有允许频道', async (password) => {
    const valid = await verifyPassword(password);
    if (!valid) { showModalError('密码错误'); return; }
    hidePasswordModal();
    await setAllowedChannels([]);
    currentChannels = [];
    elements.channelCount.textContent = '0';
    renderChannelList();
  });
}

async function clearYoutubeChannels(): Promise<void> {
  showPasswordModal('清空YouTube', '请输入密码以确认清空所有YouTube允许频道', async (password) => {
    const valid = await verifyPassword(password);
    if (!valid) { showModalError('密码错误'); return; }
    hidePasswordModal();
    const filtered = currentChannels.filter(c => c.platform !== 'youtube');
    await setAllowedChannels(filtered);
    currentChannels = filtered;
    elements.channelCount.textContent = currentChannels.length.toString();
    renderChannelList();
  });
}

async function clearBilibiliChannels(): Promise<void> {
  showPasswordModal('清空Bilibili', '请输入密码以确认清空所有Bilibili允许频道', async (password) => {
    const valid = await verifyPassword(password);
    if (!valid) { showModalError('密码错误'); return; }
    hidePasswordModal();
    const filtered = currentChannels.filter(c => c.platform !== 'bilibili');
    await setAllowedChannels(filtered);
    currentChannels = filtered;
    elements.channelCount.textContent = currentChannels.length.toString();
    renderChannelList();
  });
}

async function addChannelToWhitelist(channel: { authorName: string; authorId?: string; authorUrl?: string; videoUrl?: string; platform: 'youtube' | 'bilibili' }, button: HTMLButtonElement): Promise<void> {
  try {
    console.log('[addChannelToWhitelist] 准备添加频道:', {
      name: channel.authorName,
      authorId: channel.authorId || '(空)',
      authorUrl: channel.authorUrl || '(空)',
      videoUrl: channel.videoUrl || '(空)',
      platform: channel.platform
    });
    const added = await addChannel(channel);
    console.log('[addChannelToWhitelist] 添加完成，频道 ID:', added.id);
    button.textContent = '已允许';
    button.disabled = true;
    button.classList.remove('btn-primary');
    button.classList.add('btn-secondary');
    currentChannels = await getAllowedChannels();
    console.log('[addChannelToWhitelist] 所有白名单频道的 ID:', currentChannels.map(c => `${c.platform}_${c.authorName}: ${c.id}`));
    await renderChannelList();
  } catch (error) {
    console.error('添加频道失败:', error);
  }
}

// ==================== 密码模态框 ====================

let pendingAction: ((password: string) => Promise<void>) | null = null;

function showPasswordModal(title: string, message: string, action: (password: string) => Promise<void>): void {
  pendingAction = action;
  elements.modalTitle.textContent = title;
  elements.modalMessage.textContent = message;
  elements.passwordInput.value = '';
  elements.confirmPasswordInput.value = '';
  elements.modalError.textContent = '';
  const isSetPassword = title.includes('设置') || title.includes('修改');
  elements.confirmPasswordGroup.style.display = isSetPassword ? 'block' : 'none';
  elements.passwordModal.classList.add('active');
  elements.passwordInput.focus();
}

function hidePasswordModal(): void {
  elements.passwordModal.classList.remove('active');
  pendingAction = null;
}

function showModalError(message: string): void {
  elements.modalError.textContent = message;
}

// ==================== 事件绑定 ====================

function setupEventListeners(): void {
  elements.tabs.forEach(tab => {
    tab.addEventListener('click', async () => {
      const tabId = tab.dataset.tab;
      elements.tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      elements.panels.forEach(panel => {
        panel.classList.toggle('active', panel.id === `tab-${tabId}`);
      });
      if (tabId === 'videos') await renderVideoList();
      if (tabId === 'manage') await renderChannelList();
    });
  });

  elements.btnToggle.addEventListener('click', toggleRestriction);
  elements.btnRescan.addEventListener('click', renderVideoList);
  elements.btnClearYoutube.addEventListener('click', clearYoutubeChannels);
  elements.btnClearBilibili.addEventListener('click', clearBilibiliChannels);
  elements.btnClearAll.addEventListener('click', clearAllChannels);
  elements.btnSetPassword.addEventListener('click', () => {
    showPasswordModal('设置密码', '请设置管理密码（至少4位）', async (password) => {
      if (password.length < 4) { showModalError('密码长度至少4位'); return; }
      const confirmPwd = elements.confirmPasswordInput.value;
      if (password !== confirmPwd) { showModalError('两次输入的密码不一致'); return; }
      await setPassword(password);
      await setSettings({ restrictionEnabled, passwordEnabled: true });
      passwordEnabled = true;
      updatePasswordUI();
      hidePasswordModal();
    });
  });
  elements.btnChangePassword.addEventListener('click', () => {
    // 先验证原密码
    showPasswordModal('验证密码', '请输入原密码', async (oldPassword) => {
      const valid = await verifyPassword(oldPassword);
      if (!valid) { showModalError('原密码错误'); return; }
      hidePasswordModal();
      // 再输入新密码
      setTimeout(() => {
        showPasswordModal('设置新密码', '请输入新密码（至少4位）', async (newPassword) => {
          if (newPassword.length < 4) { showModalError('密码长度至少4位'); return; }
          const confirmPwd = elements.confirmPasswordInput.value;
          if (newPassword !== confirmPwd) { showModalError('两次输入的密码不一致'); return; }
          await setPassword(newPassword);
          hidePasswordModal();
        });
        elements.confirmPasswordGroup.style.display = 'block';
      }, 100);
    });
  });
  elements.modalCancel.addEventListener('click', hidePasswordModal);
  elements.modalConfirm.addEventListener('click', async () => {
    const password = elements.passwordInput.value;
    if (pendingAction) await pendingAction(password);
  });
  elements.passwordModal.addEventListener('click', (e) => {
    if (e.target === elements.passwordModal) hidePasswordModal();
  });
}

// ==================== 工具函数 ====================

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str: string): string {
  return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ==================== 启动 ====================

document.addEventListener('DOMContentLoaded', init);
