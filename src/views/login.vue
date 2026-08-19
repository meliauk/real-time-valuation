<template>
  <!-- 登录页 - 仅用户名（校验 user_configs.user_name） -->
  <div class="settings-sub-page">
    <!-- 固定头部：返回按钮 + 标题 -->
    <header class="settings-header glass-card">
      <button class="back-btn" @click="router.back()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        <span>返回</span>
      </button>
      <h2 class="page-title">登录</h2>
      <div class="header-placeholder"></div>
    </header>

    <!-- 可滚动主体 -->
    <div class="settings-body">
      <div class="auth-card glass-card animate-slide-up">
        <!-- 品牌区 -->
        <div class="auth-brand">
          <div class="auth-logo">
            <svg width="40" height="40" viewBox="0 0 100 100" fill="none">
              <ellipse cx="50" cy="60" rx="35" ry="30" fill="#ef4444" />
              <ellipse cx="50" cy="65" rx="22" ry="20" fill="#fca5a5" />
              <circle cx="50" cy="32" r="18" fill="#ef4444" />
              <circle cx="44" cy="29" r="5" fill="white" />
              <circle cx="44" cy="29" r="2.5" fill="#1e293b" />
              <circle cx="56" cy="29" r="5" fill="white" />
              <circle cx="56" cy="29" r="2.5" fill="#1e293b" />
              <polygon points="50,36 46,40 54,40" fill="#f97316" />
            </svg>
          </div>
          <h3 class="auth-title">欢迎回来</h3>
          <p class="auth-subtitle">输入用户名登录，云端身份标识</p>
        </div>

        <!-- 表单 -->
        <form class="auth-form" @submit.prevent="handleLogin">
          <div class="form-field">
            <label class="field-label">用户名</label>
            <div class="input-wrap">
              <svg class="input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <input
                v-model="username"
                type="text"
                class="input-base auth-input"
                placeholder="请输入用户名"
                autocomplete="username"
                :disabled="loading"
                @keyup.enter="handleLogin"
              />
            </div>
          </div>

          <button type="submit" class="btn-base btn-primary auth-submit" :disabled="loading">
            {{ loading ? '登录中...' : '登录' }}
          </button>
        </form>

        <!-- 去注册 -->
        <div class="auth-switch">
          <span>还没有账号？</span>
          <router-link to="/register" class="auth-link">立即注册</router-link>
        </div>

        <p class="auth-note text-muted">
          用户名需已在云端 user_configs 中添加，否则无法登录
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 登录页 - 仅用户名登录
 * 流程：输入用户名 → 查 Supabase user_configs 是否存在该 user_name，存在即登录。
 * 复用 settings-sub-page 骨架与 input-base/btn-primary/glass-card 控件，三主题自动跟随。
 */
defineOptions({ name: 'Login' })

import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/modules/auth/auth-store'
import { useBreakpoint } from '@/composables/use-breakpoint'

const router = useRouter()
const authStore = useAuthStore()
const { isDesktop } = useBreakpoint()

const username = ref('')
const loading = ref(false)

/** 登录：校验用户名是否存在于云端 user_configs */
async function handleLogin(): Promise<void> {
  if (loading.value) return
  if (!username.value.trim()) { ElMessage.warning('请输入用户名'); return }
  loading.value = true
  try {
    const res = await authStore.loginByUserName(username.value)
    if (res.ok) {
      ElMessage.success('登录成功')
      // 按浏览器视口判断目标页：桌面端跳 PC 首页 /pc，移动端跳默认首页 /
      router.replace(isDesktop.value ? '/pc' : '/')
    } else {
      ElMessage.warning(res.error || '登录失败')
    }
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
/* 登录页表单样式（独立 auth- 前缀，避免与 setting- 冲突） */
.auth-card {
  padding: var(--spacing-xl);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
  max-width: 420px;
  margin: var(--spacing-lg) auto;
}

/* 品牌区 */
.auth-brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-sm);
  padding-bottom: var(--spacing-md);
  border-bottom: 1px solid var(--border-subtle);
}
.auth-logo {
  display: flex;
  align-items: center;
  justify-content: center;
}
.auth-title {
  font-size: var(--font-xl);
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}
.auth-subtitle {
  font-size: var(--font-xs);
  color: var(--text-muted);
  margin: 0;
}

/* 表单 */
.auth-form {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}
.form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.field-label {
  font-size: var(--font-xs);
  font-weight: 500;
  color: var(--text-secondary);
}
.input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}
.input-icon {
  position: absolute;
  left: 12px;
  color: var(--text-muted);
  pointer-events: none;
  flex-shrink: 0;
}
.auth-input {
  width: 100%;
  padding-left: 38px;
  padding-right: 38px;
  height: 44px;
  font-size: var(--font-sm);
}

.auth-submit {
  width: 100%;
  height: 44px;
  margin-top: var(--spacing-xs);
  font-size: var(--font-md);
  border-radius: var(--radius-md);
}
.auth-submit:disabled { opacity: 0.6; cursor: not-allowed; }

/* 切换注册 */
.auth-switch {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: var(--font-xs);
  color: var(--text-muted);
}
.auth-link {
  color: var(--color-primary-light);
  text-decoration: none;
  font-weight: 500;
  transition: color var(--transition-fast);
}
.auth-link:hover { color: var(--color-primary); }

.auth-note {
  font-size: 11px;
  text-align: center;
  line-height: 1.5;
  margin: 0;
}

@media (max-width: 767px) {
  .auth-card {
    padding: var(--spacing-lg);
    margin: var(--spacing-sm) 0;
  }
  .auth-title { font-size: var(--font-lg); }
}
</style>
