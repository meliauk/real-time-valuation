/**
 * localStorage 安全读写封装
 *
 * 防止 localStorage 读写异常（隐私模式/配额超限/JSON 解析失败）导致整个流程崩溃。
 * 所有 localStorage 操作都应走此模块，失败静默返回默认值。
 *
 * sessionStorage 同理：与 localStorage 同 API，但仅当前标签页会话有效——刷新页面保留、
 * 关闭标签页/应用即清空。适合"本会话已处理过某事"的幂等标记。
 */

/** 安全读取并 JSON.parse：失败或不存在返回 fallback */
export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

/** 安全 JSON.stringify 并写入：失败静默 */
export function saveJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // 配额超限或隐私模式，静默
  }
}

/** 安全删除：失败静默 */
export function removeKey(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // 静默
  }
}

/** 安全读取原始字符串：不存在或失败返回 null */
export function loadString(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/** 安全写入原始字符串：失败静默 */
export function saveString(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // 静默
  }
}

// ===== sessionStorage（刷新保留、关闭应用清空，适合"本会话幂等"标记） =====

/** sessionStorage：取一个 boolean 标记是否存在 */
export function hasSessionFlag(key: string): boolean {
  try {
    return sessionStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

/** sessionStorage：置一个 boolean 标记（值恒为 '1'）。失败静默 */
export function setSessionFlag(key: string): void {
  try {
    sessionStorage.setItem(key, '1')
  } catch {
    // 隐私模式等，静默
  }
}
