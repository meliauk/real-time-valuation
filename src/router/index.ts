/**
 * 路由配置 - 单页应用路由定义
 */

import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'Home',
      component: () => import('@/views/home.vue'),
    },
    {
      path: '/pc',
      name: 'PC',
      component: () => import('@/views/pcHome.vue'),
    },
    {
      path: '/charity',
      name: 'Charity',
      component: () => import('@/views/charity.vue'),
    },
    {
      path: '/market',
      name: 'Market',
      component: () => import('@/views/stock-news-hub.vue'),
    },
    {
      path: '/news/detail',
      name: 'NewsDetail',
      component: () => import('@/views/market-news.vue'),
    },
    {
      path: '/mine',
      name: 'Mine',
      component: () => import('@/views/mine.vue'),
    },
    {
      path: '/login',
      name: 'Login',
      component: () => import('@/views/login.vue'),
    },
    {
      path: '/register',
      name: 'Register',
      component: () => import('@/views/register.vue'),
    },
    {
      path: '/settings',
      name: 'Settings',
      component: () => import('@/views/settings.vue'),
    },
    {
      path: '/settings/appearance',
      name: 'SettingsAppearance',
      component: () => import('@/views/settings/appearance.vue'),
    },
    {
      path: '/settings/fund',
      name: 'SettingsFund',
      component: () => import('@/views/settings/fund-settings.vue'),
    },
    {
      path: '/settings/stock',
      name: 'SettingsStock',
      component: () => import('@/views/settings/stock-settings.vue'),
    },
    {
      path: '/settings/news',
      name: 'SettingsNews',
      component: () => import('@/views/settings/news-settings.vue'),
    },
    {
      path: '/settings/sector',
      name: 'SettingsSector',
      component: () => import('@/views/settings/sector-settings.vue'),
    },
    {
      path: '/settings/data',
      name: 'DataManagement',
      component: () => import('@/views/settings/data-management.vue'),
    },
    {
      path: '/settings/about',
      name: 'About',
      component: () => import('@/views/settings/about.vue'),
    },
    {
      path: '/settings/indices',
      name: 'IndicesSettings',
      component: () => import('@/views/settings/indices-settings.vue'),
    },
    {
      path: '/manage',
      name: 'Manage',
      component: () => import('@/views/manage.vue'),
    },
    {
      path: '/fund/:code',
      name: 'FundDetail',
      component: () => import('@/views/fund-detail.vue'),
    },
  ],
})

export default router
