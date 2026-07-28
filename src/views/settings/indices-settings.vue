<template>
  <!-- 指数选择页 - 选择在基金页底部展示哪些指数 -->
  <div class="indices-settings-page">
    <!-- 顶部导航 -->
    <header class="is-header glass-card">
      <button class="back-btn" @click="router.back()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        <span>返回</span>
      </button>
      <h2 class="page-title">指数选择</h2>
      <div class="header-placeholder"></div>
    </header>

    <!-- 可滚动主体 -->
    <div class="is-body">
      <div class="is-tip glass-card">
        <span class="tip-text">勾选要在基金页底部展示的指数，所选即时生效</span>
        <span class="tip-count font-number">{{ marketStore.selectedIndices.length }} / {{ marketStore.allIndices.length }}</span>
      </div>

      <!-- 按市场分组 -->
      <section v-for="group in groupedIndices" :key="group.label" class="is-group glass-card">
        <div class="group-header">
          <span class="group-label">{{ group.label }}</span>
          <span class="group-count font-number">{{ group.selectedCount }}/{{ group.items.length }}</span>
        </div>
        <div class="chip-list">
          <button
            v-for="idx in group.items"
            :key="idx.secid"
            :class="['chip', { selected: idx.selected }]"
            @click="marketStore.toggleIndex(idx.secid)"
          >
            {{ idx.name }}
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
// TODO[迁移]: 旧项目用 useMarketStore(@/stores/market) 一次性管指数/自选股/资讯。
// 新项目已拆分为 index/stock/news 三个 store。本页仅用指数能力，故指向 index-store。
// 但新 index-store API 与旧 marketStore 不兼容（见文件末尾 TODO 列表），逻辑未改，编译会报错。
import { useIndexStore } from '@/modules/index/index-store'

const router = useRouter()
const marketStore = useIndexStore()

/** 市场分组顺序 */
const GROUP_ORDER: Record<string, number> = {
  'A股': 1, '港股': 2, '美股': 3, '亚太': 4, '欧洲': 5,
}

/** 按市场分组的指数列表（依 INDEX_PRESETS 的 market 字段聚合） */
const groupedIndices = computed(() => {
  const map = new Map<string, typeof marketStore.allIndices[number][]>()
  for (const idx of marketStore.allIndices) {
    const mkt = (idx as { market?: string }).market ?? '其他'
    if (!map.has(mkt)) map.set(mkt, [])
    map.get(mkt)!.push(idx)
  }
  return Array.from(map.entries())
    .map(([label, items]) => ({
      label,
      items,
      selectedCount: items.filter(i => i.selected).length,
    }))
    .sort((a, b) => (GROUP_ORDER[a.label] ?? 99) - (GROUP_ORDER[b.label] ?? 99))
})

onMounted(() => {
  marketStore.restoreSelected()
  // 若行情尚未加载，进入页面时刷新一次，便于直观看到选中项的实时数值
  if (marketStore.indexQuotes.size === 0) {
    marketStore.refresh()
  }
})
</script>

<style scoped>
.indices-settings-page {
  height: 100vh;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: var(--spacing-md);
  /* 底部为悬浮导航栏预留空间 */
  padding-bottom: calc(var(--spacing-md) + 56px + env(safe-area-inset-bottom, 0px));
  gap: var(--spacing-sm);
}

.is-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  flex-shrink: 0;
}
.back-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border-default);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-size: var(--font-xs);
  transition: all var(--transition-fast);
}
.back-btn:hover {
  color: var(--text-primary);
  border-color: var(--border-hover);
}
.page-title {
  flex: 1;
  font-size: var(--font-lg);
  font-weight: 700;
  color: var(--text-primary);
  text-align: center;
}
.header-placeholder {
  width: 60px;
  flex-shrink: 0;
}

/* ===== 可滚动主体 ===== */
.is-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  width: 100%;
  padding-bottom: var(--spacing-sm);
}

.is-tip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
}
.tip-text {
  font-size: var(--font-xs);
  color: var(--text-muted);
}
.tip-count {
  font-size: var(--font-xs);
  color: var(--color-primary-light);
  background: var(--color-primary-glow);
  padding: 1px 8px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
}

.is-group {
  padding: var(--spacing-sm) var(--spacing-md);
}
.group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--spacing-sm);
}
.group-label {
  font-size: var(--font-sm);
  font-weight: 600;
  color: var(--text-primary);
}
.group-count {
  font-size: var(--font-xs);
  color: var(--text-muted);
}

/* chip 选择器（复制自 market.vue） */
.chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-xs);
}
.chip {
  padding: 4px 12px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border-default);
  background: transparent;
  color: var(--text-muted);
  font-size: var(--font-xs);
  cursor: pointer;
  transition: all var(--transition-fast);
}
.chip:hover {
  border-color: var(--color-primary);
  color: var(--color-primary-light);
}
.chip.selected {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: #fff;
  font-weight: 600;
}
</style>
