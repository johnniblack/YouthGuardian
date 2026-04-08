// YouthGuardian 密码安全模块
// 使用 Web Crypto API 进行 SHA-256 哈希

import { getPasswordMeta, setPasswordMeta } from './storage';

/**
 * 生成随机盐值
 */
export function generateSalt(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * SHA-256 哈希
 */
export async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 对密码进行哈希（密码 + 盐值）
 */
export async function hashPassword(password: string, salt: string): Promise<string> {
  return sha256(password + salt);
}

/**
 * 设置密码（首次设置）
 */
export async function setPassword(password: string): Promise<void> {
  const salt = generateSalt();
  const hash = await hashPassword(password, salt);

  await setPasswordMeta({
    passwordHash: hash,
    salt: salt,
    updatedAt: Date.now()
  });
}

/**
 * 验证密码
 */
export async function verifyPassword(password: string): Promise<boolean> {
  const meta = await getPasswordMeta();
  if (!meta) {
    return false;
  }

  const hash = await hashPassword(password, meta.salt);
  return hash === meta.passwordHash;
}

/**
 * 修改密码
 */
export async function changePassword(oldPassword: string, newPassword: string): Promise<boolean> {
  const valid = await verifyPassword(oldPassword);
  if (!valid) {
    return false;
  }

  await setPassword(newPassword);
  return true;
}
