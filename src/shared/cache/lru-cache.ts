/**
 * LRU 缓存通用实现
 *
 * 最近最少使用淘汰策略的 Map 封装。超出容量时淘汰最久未访问的项。
 * 用于：基金板块持仓缓存（estimatedHoldingsCache / t1HoldingsCache）、symbol 缓存等。
 *
 * 不依赖任何业务类型，泛型实现，跨板块复用。
 */

/**
 * 往 LRU Map 写入一项：若已达容量上限，淘汰最久未访问项（Map 迭代顺序=插入顺序，首项最旧）。
 * @param map    目标 Map（会被原地修改）
 * @param key    缓存键
 * @param value  缓存值
 * @param maxSize 最大容量
 */
export function lruSet<K, V>(map: Map<K, V>, key: K, value: V, maxSize: number): void {
  // 已存在则先删，保证写到末尾（最新访问）
  if (map.has(key)) map.delete(key)
  map.set(key, value)
  // 超容量淘汰最旧项（Map 首项）
  if (map.size > maxSize) {
    const oldest = map.keys().next().value
    if (oldest !== undefined) map.delete(oldest)
  }
}

/**
 * LRU 读取：命中时把项移到末尾（标记为最近访问），返回值。
 * @returns 命中返回值，未命中返回 undefined
 */
export function lruGet<K, V>(map: Map<K, V>, key: K): V | undefined {
  if (!map.has(key)) return undefined
  const value = map.get(key)!
  // 移到末尾（标记最近访问）
  map.delete(key)
  map.set(key, value)
  return value
}

/**
 * 创建一个独立 LRU 缓存实例（封装内部 Map）。
 * 适合需要独立生命周期的场景。
 */
export function createLRU<K, V>(maxSize: number): {
  get: (key: K) => V | undefined
  set: (key: K, value: V) => void
  has: (key: K) => boolean
  delete: (key: K) => boolean
  size: () => number
  clear: () => void
} {
  const map = new Map<K, V>()
  return {
    get: (key) => lruGet(map, key),
    set: (key, value) => lruSet(map, key, value, maxSize),
    has: (key) => map.has(key),
    delete: (key) => map.delete(key),
    size: () => map.size,
    clear: () => map.clear(),
  }
}
