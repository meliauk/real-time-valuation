/**
 * 资讯来源黑名单过滤
 *
 * 用户可屏蔽某些来源（如广告多的媒体），黑名单持久化 localStorage。
 */

/** 黑名单匹配：来源名完全匹配或包含 */
export function isBlacklisted(source: string, blacklist: string[]): boolean {
  if (!source || blacklist.length === 0) return false
  const s = source.toLowerCase()
  return blacklist.some(b => b && s.includes(b.toLowerCase()))
}

/** 过滤掉黑名单来源的资讯 */
export function filterByBlacklist<T extends { source: string }>(items: T[], blacklist: string[]): T[] {
  if (blacklist.length === 0) return items
  return items.filter(item => !isBlacklisted(item.source, blacklist))
}
