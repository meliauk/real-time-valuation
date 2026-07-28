<template>
  <!-- 金融科技感搜索触发器 - 只负责触发，弹窗在 home.vue 中 -->
  <div class="search-trigger" @click="$emit('open')">
    <div class="search-trigger-inner">
      <el-icon :size="18"><Search /></el-icon>
      <span class="search-trigger-text"></span>
      <kbd class="search-trigger-key">Ctrl+K</kbd>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { Search } from '@element-plus/icons-vue'

defineEmits<{ open: [] }>()

function handleKeydown(e: KeyboardEvent): void {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault()
    // Keyboard shortcut handled by parent
  }
}

onMounted(() => document.addEventListener('keydown', handleKeydown))
onUnmounted(() => document.removeEventListener('keydown', handleKeydown))
</script>

<style scoped>
.search-trigger {
  cursor: pointer;
  border-radius: var(--radius-full);
  background: var(--glass-bg);
  border: 2px solid transparent;
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
  position: relative;
  overflow: hidden;
  transition: all var(--transition-fast);
}

/* 炫彩边框 - 渐变旋转动画 */
.search-trigger::before {
  content: '';
  position: absolute;
  inset: -2px;
  border-radius: var(--radius-full);
  background: conic-gradient(from 0deg, #6366f1, #06b6d4, #8b5cf6, #ec4899, #6366f1);
  opacity: 0.4;
  z-index: -1;
  animation: borderSpin 4s linear infinite;
}

.search-trigger:hover::before {
  opacity: 0.8;
}

.search-trigger:hover {
  box-shadow: var(--shadow-glow);
}

.search-trigger:active {
  transform: scale(0.97);
}

.search-trigger-inner {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-xs) var(--spacing-md);
  color: var(--text-muted);
  white-space: nowrap;
  background: var(--glass-bg);
  border-radius: var(--radius-full);
  position: relative;
  z-index: 1;
}

.search-trigger-text {
  font-size: var(--font-sm);
  flex: 1;
}

.search-trigger-key {
  padding: 1px 6px;
  font-size: 10px;
  font-family: var(--font-mono);
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: 4px;
  color: var(--text-muted);
}

@keyframes borderSpin {
  to { transform: rotate(360deg); }
}

@media (max-width: 767px) {
  .search-trigger-text,
  .search-trigger-key {
    display: none;
  }
  .search-trigger-inner {
    padding: var(--spacing-sm);
    color: var(--color-primary-light);
  }
  .search-trigger::before {
    opacity: 0.6;
  }
}
</style>
