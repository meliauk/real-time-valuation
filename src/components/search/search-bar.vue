<template>
  <!-- 炫彩搜索框 - 顶部胶囊，点击后放大移到屏幕中央 -->
  <Teleport to="body">
    <Transition name="overlay" @after-leave="onAfterLeave">
      <div v-if="expanded" class="search-overlay" @mousedown.self="collapse">
        <div class="search-expanded-wrap">
          <div class="search-expanded-glow" v-if="settingsStore.showSearchGlow"></div>
          <div class="search-expanded" ref="expandedRef" :style="expandedStyle">
            <div class="expanded-input">
              <el-icon class="search-icon" :size="18"><Search /></el-icon>
              <input
                ref="expandedInputRef"
                v-model="searchKeyword"
                placeholder=""
                class="expanded-search-input"
                @keydown.escape="collapse"
              />
              <button v-if="searchKeyword" class="clear-btn" @mousedown.prevent="clearAndFocus">
                <el-icon :size="14"><Close /></el-icon>
              </button>
              <div class="divider"></div>
              <button class="camera-btn" @click="triggerFileSelect" title="识图导入">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
              </button>
              <input ref="fileInput" type="file" accept="image/*" multiple class="hidden-file-input" @change="handleFileSelect" />
            </div>

            <!-- 识图识别中 -->
            <div v-if="isRecognizing && imageFunds.length === 0" class="recognition-loading">
              <span class="animate-breathe">正在识别图片中...</span>
              <button class="btn-text" @click="handleCancelRecognition">取消</button>
            </div>

            <!-- 识图结果 -->
            <div v-if="imageFunds.length > 0 || recognitionStatus === 'error'" class="image-section">
              <div class="image-header">
                <span class="image-label">{{ imageFunds.length > 0 ? `识别到 ${imageFunds.length} 个基金` : '识别结果' }}</span>
                <button v-if="!isRecognizing" class="btn-text" @click="resetRecognition">清除</button>
                <button v-else class="btn-text" @click="handleCancelRecognition">取消</button>
              </div>
              <div class="recognized-list">
                <div v-for="fund in imageFunds" :key="fund.fundCode" class="recognized-item" :class="{ 'is-existing': fundStore.fundCodes.includes(fund.fundCode) }">
                  <span class="font-number recognized-code">{{ fund.fundCode }}</span>
                  <span class="recognized-name">{{ fund.fundName }}</span>
                  <span v-if="fund.holdingAmount != null" class="font-number recognized-amount">{{ fund.holdingAmount.toFixed(2) }}</span>
                  <span v-if="fund.holdingProfit != null" class="font-number recognized-profit" :class="fund.holdingProfit > 0 ? 'text-profit' : fund.holdingProfit < 0 ? 'text-loss' : ''">{{ fund.holdingProfit > 0 ? '+' : '' }}{{ fund.holdingProfit.toFixed(2) }}</span>
                  <span v-if="fundStore.fundCodes.includes(fund.fundCode)" class="recognized-tag">已存在</span>
                </div>
              </div>
              <div v-if="isRecognizing" class="progress-bar">
                <div class="progress-fill" :style="{ width: `${(progress.done / progress.total) * 100}%` }"></div>
                <span class="progress-text font-number">{{ progress.done }}/{{ progress.total }}</span>
              </div>
              <div v-if="recognitionError" class="recognition-error">{{ recognitionError }}</div>
              <button v-if="imageFunds.length > 0" class="btn-add-batch" @click="handleBatchAdd">
                确认添加 ({{ imageFunds.filter((f: RecognizedFund) => !fundStore.fundCodes.includes(f.fundCode)).length }})
              </button>
            </div>

            <!-- 搜索结果 -->
            <div v-if="searchResults.length > 0" class="result-list">
              <div v-for="item in searchResults" :key="item.fundCode" class="result-item" @mousedown.prevent="handleSelect(item)">
                <span class="result-code font-number">{{ item.fundCode }}</span>
                <span class="result-name">{{ item.fundName }}</span>
                <span class="result-type">{{ item.fundType }}</span>
              </div>
            </div>

            <!-- 搜索中 -->
            <div v-if="searching" class="dropdown-empty">
              <span class="animate-breathe">搜索中...</span>
            </div>

            <!-- 无结果 -->
            <div v-else-if="searchKeyword.length >= 2 && !searching && imageFunds.length === 0 && searchResults.length === 0" class="dropdown-empty">
              未找到匹配基金
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- 顶部炫彩胶囊搜索框 -->
  <div class="search-bar-wrap" ref="triggerRef" @click="expand">
    <div v-if="settingsStore.showSearchGlow" class="search-glow"></div>
    <div class="search-input-wrap">
      <el-icon class="search-icon" :size="16"><Search /></el-icon>
      <span class="search-placeholder"></span>
      <div class="divider"></div>
      <button class="camera-btn" title="识图导入">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
          <circle cx="12" cy="13" r="4"/>
        </svg>
      </button>
      <!-- <kbd class="search-kbd"></kbd> -->
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { Search, Close } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
// 识图导入走 use-image-recognition composable（依赖 recognizeFundFromImage
//   @/modules/ai/glm-vision、RecognizedFund/RecognitionStatus @/modules/ai/ai-types）。
//   持仓板块类型适配后已无类型错误，识图导入已启用。
import { useFundSearch } from '@/composables/use-fund-search'
import { useImageRecognition } from '@/composables/use-image-recognition'
import { useFundStore } from '@/modules/fund/fund-store'
import { useSettingsStore } from '@/modules/settings/settings-store'
import type { SearchResult } from '@/modules/fund/fund-types'
import type { RecognizedFund } from '@/modules/ai/ai-types'

const fundStore = useFundStore()
const settingsStore = useSettingsStore()
const { keyword, results, searching, clearSearch } = useFundSearch()
const {
  recognizedFunds: imageFunds,
  status: recognitionStatus,
  progress,
  errorMessage: recognitionError,
  recognizeImages,
  cancelRecognition,
  importRecognized,
  resetRecognition,
} = useImageRecognition()

const triggerRef = ref<HTMLElement | null>(null)
const expandedRef = ref<HTMLElement | null>(null)
const expandedInputRef = ref<HTMLInputElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

const expanded = ref(false)
const animating = ref(false)

const originRect = ref<{ left: number; top: number; width: number; height: number } | null>(null)

const searchKeyword = computed({
  get: () => keyword.value,
  set: (val) => { keyword.value = val },
})

const searchResults = computed(() => results.value)

/** 是否正在识别中（reading 或 recognizing 状态） */
const isRecognizing = computed(() => recognitionStatus.value === 'reading' || recognitionStatus.value === 'recognizing')

const expandedStyle = computed(() => {
  if (!originRect.value || !animating.value) return {}
  const r = originRect.value
  return {
    '--origin-left': `${r.left}px`,
    '--origin-top': `${r.top}px`,
    '--origin-width': `${r.width}px`,
    '--origin-height': `${r.height}px`,
  }
})

function expand(): void {
  if (expanded.value) return
  if (triggerRef.value) {
    originRect.value = triggerRef.value.getBoundingClientRect()
  }
  expanded.value = true
  animating.value = true
  nextTick(() => {
    expandedInputRef.value?.focus()
    setTimeout(() => { animating.value = false }, 500)
  })
}

function collapse(): void {
  if (triggerRef.value) {
    originRect.value = triggerRef.value.getBoundingClientRect()
  }
  animating.value = true
  expanded.value = false
}

function onAfterLeave(): void {
  animating.value = false
  clearSearch()
  resetRecognition()
}

function handleGlobalKeydown(e: KeyboardEvent): void {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault()
    if (expanded.value) collapse()
    else expand()
  }
  if (e.key === 'Escape' && expanded.value) {
    e.preventDefault()
    collapse()
  }
}

function handleGlobalPaste(e: ClipboardEvent): void {
  if (!expanded.value) return
  const items = e.clipboardData?.items
  if (!items) return
  const imageFiles: File[] = []
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file) imageFiles.push(file)
    }
  }
  if (imageFiles.length > 0) {
    e.preventDefault()
    recognizeImages(imageFiles)
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleGlobalKeydown)
  document.addEventListener('paste', handleGlobalPaste)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleGlobalKeydown)
  document.removeEventListener('paste', handleGlobalPaste)
})

function clearAndFocus(): void {
  clearSearch()
  nextTick(() => expandedInputRef.value?.focus())
}

function triggerFileSelect(): void {
  fileInput.value?.click()
}

function handleFileSelect(e: Event): void {
  const target = e.target as HTMLInputElement
  const files = target.files
  if (files && files.length > 0) {
    recognizeImages(Array.from(files))
  }
  target.value = ''
}

async function handleBatchAdd(): Promise<void> {
  const count = await importRecognized()
  if (count > 0) {
    ElMessage.success(`已添加 ${count} 个基金`)
    resetRecognition()
    clearSearch()
  } else {
    ElMessage.warning('没有新的基金可添加')
  }
}

function handleCancelRecognition(): void {
  cancelRecognition()
  resetRecognition()
}

function handleSelect(item: SearchResult): void {
  const success = fundStore.addFund(item.fundCode, item.fundName)
  if (success) {
    ElMessage.success(`已添加 ${item.fundName}`)
    fundStore.fetchValuation(item.fundCode)
  } else {
    ElMessage.warning(`${item.fundCode} 已在关注列表中`)
  }
  collapse()
}
</script>

<style scoped>
/* ===== 顶部炫彩胶囊搜索框 ===== */
.search-bar-wrap {
  position: relative;
  width: 120px;
  flex-shrink: 0;
}

.search-glow {
  position: absolute;
  inset: -2px;
  border-radius: 9999px;
  background: linear-gradient(135deg, #6366f1, #8b5cf6, #a78bfa, #ec4899, #6366f1);
  background-size: 300% 300%;
  animation: glow-shift 4s ease infinite;
  opacity: 0.6;
  filter: blur(3px);
  z-index: 0;
}

@keyframes glow-shift {
  0%, 100% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
}

.search-bar-wrap:hover .search-glow {
  opacity: 1;
  filter: blur(4px);
}

.search-bar-wrap .search-input-wrap {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px 0 14px;
  height: 36px;
  background: var(--bg-card);
  border: 1px solid var(--color-primary-glow);
  border-radius: 9999px;
  cursor: pointer;
  transition: all var(--transition-fast);
  white-space: nowrap;
}

.search-bar-wrap:hover .search-input-wrap {
  border-color: var(--color-primary);
  box-shadow: 0 0 12px var(--color-primary-glow);
}

.search-icon {
  color: var(--color-primary);
  flex-shrink: 0;
}

.search-placeholder {
  flex: 1;
  font-size: var(--font-sm);
  color: var(--text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.divider {
  width: 1px;
  height: 16px;
  background: var(--border-default);
  flex-shrink: 0;
}

.camera-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  cursor: pointer;
  padding: 2px;
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
  background: none;
  border: none;
  flex-shrink: 0;
}

.camera-btn:hover {
  color: var(--color-primary);
  background: var(--color-primary-glow);
}

.search-kbd {
  padding: 1px 6px;
  font-size: 10px;
  font-family: var(--font-mono);
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: 4px;
  color: var(--text-muted);
  flex-shrink: 0;
}

.hidden-file-input {
  display: none;
}

/* ===== 展开遮罩 ===== */
.search-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: var(--el-mask-color);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  justify-content: center;
  padding-top: 15vh;
}

/* ===== 展开弹窗外层 - 包含发光边框 ===== */
.search-expanded-wrap {
  position: relative;
  width: 520px;
  max-width: 90vw;
  animation: morph-expand 0.45s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.search-expanded-glow {
  position: absolute;
  inset: -3px;
  border-radius: 32px;
  background: linear-gradient(135deg, #6366f1, #8b5cf6, #a78bfa, #ec4899, #6366f1);
  background-size: 300% 300%;
  animation: glow-shift 3s ease infinite;
  opacity: 0.8;
  filter: blur(6px);
  z-index: 0;
}

/* ===== 展开弹窗内容 ===== */
.search-expanded {
  position: relative;
  z-index: 1;
  width: 100%;
  max-height: 60vh;
  display: flex;
  flex-direction: column;
  background: var(--glass-bg);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid var(--glass-border);
  border-radius: 28px;
  overflow: hidden;
}

@keyframes morph-expand {
  0% {
    position: fixed;
    left: var(--origin-left, 50%);
    top: var(--origin-top, 50%);
    width: var(--origin-width, 280px);
    height: var(--origin-height, 36px);
    border-radius: 9999px;
    opacity: 0.9;
  }
  40% {
    opacity: 1;
  }
  100% {
    position: fixed;
    left: 50%;
    top: 15vh;
    width: min(520px, 90vw);
    height: auto;
    transform: translateX(-50%);
  }
}

/* 收缩动画 */
.overlay-leave-active .search-expanded-wrap {
  animation: morph-collapse 0.25s cubic-bezier(0.4, 0, 1, 1) forwards;
}

@keyframes morph-collapse {
  0% {
    position: fixed;
    left: 50%;
    top: 15vh;
    width: min(520px, 90vw);
    transform: translateX(-50%);
    opacity: 1;
  }
  100% {
    position: fixed;
    left: var(--origin-left, 50%);
    top: var(--origin-top, 50%);
    width: var(--origin-width, 280px);
    height: var(--origin-height, 36px);
    border-radius: 9999px;
    transform: scale(0.9);
    opacity: 0;
  }
}

/* ===== 展开输入框 ===== */
.expanded-input {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 48px;
  padding: 0 16px;
  border-bottom: 1px solid var(--border-default);
  flex-shrink: 0;
}

.expanded-search-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: var(--font-md);
  color: var(--text-primary);
  min-width: 0;
}

.expanded-search-input::placeholder {
  color: var(--text-tertiary);
}

.expanded-input .search-icon {
  color: var(--color-primary);
  flex-shrink: 0;
}

.expanded-input .divider {
  flex-shrink: 0;
}

.expanded-input .camera-btn {
  flex-shrink: 0;
}

.expanded-input .camera-btn:hover {
  background: rgba(99, 102, 241, 0.1);
}

.clear-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  cursor: pointer;
  padding: 2px;
  border-radius: 50%;
  transition: color var(--transition-fast);
  background: none;
  border: none;
  flex-shrink: 0;
}

.clear-btn:hover {
  color: var(--text-primary);
}

/* ===== 识图识别中 ===== */
.recognition-loading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-md);
  border-bottom: 1px solid var(--border-default);
  font-size: var(--font-sm);
  color: var(--color-primary-light);
  flex-shrink: 0;
}

/* ===== 识图结果 ===== */
.image-section {
  padding: var(--spacing-sm) var(--spacing-md);
  border-bottom: 1px solid var(--border-default);
  flex-shrink: 0;
}

.image-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-xs);
}

.image-label {
  font-size: var(--font-sm);
  color: var(--color-primary-light);
  font-weight: 500;
}

.btn-text {
  font-size: var(--font-xs);
  color: var(--text-muted);
  cursor: pointer;
  background: none;
  border: none;
}

.btn-text:hover {
  color: var(--color-primary);
}

.code-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-xs);
  margin-bottom: var(--spacing-sm);
}

.code-tag {
  padding: 2px 10px;
  background: var(--color-primary-glow);
  color: var(--color-primary-light);
  border-radius: var(--radius-sm);
  font-size: var(--font-xs);
}

.recognized-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 200px;
  overflow-y: auto;
  margin-bottom: var(--spacing-sm);
}
.recognized-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: 4px 6px;
  font-size: var(--font-sm);
  border-radius: var(--radius-sm);
}
.recognized-item.is-existing {
  opacity: 0.5;
}
.recognized-code {
  color: var(--text-muted);
  min-width: 60px;
}
.recognized-name {
  flex: 1;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.recognized-amount {
  color: var(--text-primary);
  min-width: 60px;
  text-align: right;
}
.recognized-profit {
  min-width: 60px;
  text-align: right;
}
.recognized-tag {
  font-size: var(--font-xs);
  color: var(--text-muted);
  background: var(--bg-elevated);
  padding: 1px 6px;
  border-radius: var(--radius-sm);
}

.progress-bar {
  position: relative;
  height: 20px;
  background: var(--color-primary-glow);
  border-radius: var(--radius-sm);
  overflow: hidden;
  margin-bottom: var(--spacing-sm);
}
.progress-fill {
  height: 100%;
  background: var(--color-primary);
  opacity: 0.4;
  transition: width 0.3s ease;
}
.progress-text {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--font-xs);
  color: var(--color-primary-light);
}

.recognition-error {
  font-size: var(--font-xs);
  color: var(--color-rise);
  margin-bottom: var(--spacing-sm);
}

.text-profit { color: var(--color-rise); }
.text-loss { color: var(--color-fall); }

.btn-add-batch {
  width: 100%;
  padding: var(--spacing-xs);
  background: var(--color-primary);
  color: white;
  border: none;
  border-radius: var(--radius-md);
  font-size: var(--font-sm);
  cursor: pointer;
  transition: opacity var(--transition-fast);
}

.btn-add-batch:hover {
  opacity: 0.9;
}

/* ===== 搜索结果 ===== */
.result-list {
  overflow-y: auto;
  padding: var(--spacing-xs) 0;
  flex: 1;
  min-height: 0;
}

.result-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  cursor: pointer;
  transition: background var(--transition-fast);
}

.result-item:hover {
  background: var(--bg-card-hover);
}

.result-code {
  color: var(--text-muted);
  font-size: var(--font-sm);
  min-width: 60px;
}

.result-name {
  flex: 1;
  color: var(--text-primary);
  font-size: var(--font-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-type {
  color: var(--text-tertiary);
  font-size: var(--font-xs);
  flex-shrink: 0;
}

.dropdown-empty {
  padding: var(--spacing-lg);
  text-align: center;
  color: var(--text-muted);
  font-size: var(--font-sm);
  flex-shrink: 0;
}

/* ===== 遮罩动画 ===== */
.overlay-enter-active {
  transition: opacity 0.3s ease;
}
.overlay-leave-active {
  transition: opacity 0.2s ease;
}
.overlay-enter-from,
.overlay-leave-to {
  opacity: 0;
}

/* ===== 响应式 - 所有设备保持一致交互 ===== */
@media (max-width: 767px) {
  .search-bar-wrap {
    max-width: 200px;
  }

  .search-bar-wrap .search-input-wrap {
    height: 34px;
  }

  .search-expanded-wrap {
    max-width: 92vw;
  }
}
</style>
