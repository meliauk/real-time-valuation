/**
 * 基金搜索 Composable - 封装搜索防抖和结果管理
 * 用户输入关键词后延迟 300ms 发起搜索，避免频繁请求
 */

import { ref, watch } from 'vue'
import { searchFunds } from '@/modules/fund/catalog/fund-search'
import type { SearchResult } from '@/modules/fund/fund-types'
import { isValidFundCode } from '@/shared/utils/validation'

export function useFundSearch() {
  /** 搜索关键词 */
  const keyword = ref('')

  /** 搜索结果列表 */
  const results = ref<SearchResult[]>([])

  /** 是否正在搜索 */
  const searching = ref(false)

  /** 搜索防抖定时器 */
  let debounceTimer: number | null = null

  /** 执行搜索 */
  async function doSearch(query: string): Promise<void> {
    if (!query || query.trim().length < 2) {
      results.value = []
      return
    }

    searching.value = true
    try {
      results.value = await searchFunds(query.trim())
    } catch {
      results.value = []
    } finally {
      searching.value = false
    }
  }

  /** 监听关键词变化，防抖搜索 */
  watch(keyword, (newVal) => {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = window.setTimeout(() => {
      doSearch(newVal)
    }, 300)
  })

  /** 清空搜索 */
  function clearSearch(): void {
    keyword.value = ''
    results.value = []
    if (debounceTimer) clearTimeout(debounceTimer)
  }

  /** 验证并直接添加基金代码 - 用户输入6位数字时跳过搜索 */
  function isDirectCode(input: string): boolean {
    return isValidFundCode(input.trim())
  }

  return {
    keyword,
    results,
    searching,
    clearSearch,
    isDirectCode,
  }
}
