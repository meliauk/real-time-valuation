/**
 * 响应式断点检测 Composable
 * 基于 window.matchMedia 实现真正的响应式，而非依赖非响应式的 window.innerWidth
 */

import { ref, onMounted, onUnmounted } from 'vue'

const MOBILE_QUERY = '(max-width: 767px)'
const TABLET_QUERY = '(min-width: 768px) and (max-width: 1023px)'
const DESKTOP_QUERY = '(min-width: 1024px)'

export function useBreakpoint() {
  const isMobile = ref(false)
  const isTablet = ref(false)
  const isDesktop = ref(true)

  let mobileMql: MediaQueryList | null = null
  let tabletMql: MediaQueryList | null = null
  let desktopMql: MediaQueryList | null = null

  function onMobileChange(e: MediaQueryListEvent | MediaQueryList) {
    isMobile.value = e.matches
  }
  function onTabletChange(e: MediaQueryListEvent | MediaQueryList) {
    isTablet.value = e.matches
  }
  function onDesktopChange(e: MediaQueryListEvent | MediaQueryList) {
    isDesktop.value = e.matches
  }

  onMounted(() => {
    mobileMql = window.matchMedia(MOBILE_QUERY)
    tabletMql = window.matchMedia(TABLET_QUERY)
    desktopMql = window.matchMedia(DESKTOP_QUERY)

    onMobileChange(mobileMql)
    onTabletChange(tabletMql)
    onDesktopChange(desktopMql)

    mobileMql.addEventListener('change', onMobileChange)
    tabletMql.addEventListener('change', onTabletChange)
    desktopMql.addEventListener('change', onDesktopChange)
  })

  onUnmounted(() => {
    mobileMql?.removeEventListener('change', onMobileChange)
    tabletMql?.removeEventListener('change', onTabletChange)
    desktopMql?.removeEventListener('change', onDesktopChange)
  })

  return { isMobile, isTablet, isDesktop }
}
