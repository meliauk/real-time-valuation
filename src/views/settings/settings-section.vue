<template>
  <!-- 设置分区卡片：复用 settings.vue 的 .settings-section 样式，避免每个二级页重复 -->
  <section :class="['settings-section', 'glass-card', { 'danger-section': danger }]">
    <h2 :class="['section-title', { 'danger-title': danger }]">{{ title }}</h2>
    <slot />
  </section>
</template>

<script setup lang="ts">
/**
 * 共享设置分区卡片
 * 复用 settings.vue 的分区样式（.settings-section/.section-title/danger 变体），
 * 供 settings/data-management/about 三个页面统一外观，避免重复 CSS。
 */
defineProps<{
  title: string
  danger?: boolean
}>()
</script>

<style scoped>
.settings-section {
  padding: var(--spacing-lg);
}

.section-title {
  font-size: var(--font-sm);
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: var(--spacing-md);
}

.danger-section {
  border-color: var(--color-rise-glow);
}

.danger-title {
  color: var(--color-rise) !important;
}
</style>
