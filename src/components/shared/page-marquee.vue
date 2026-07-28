<template>
  <Teleport to="body">
    <div v-if="visible" class="page-marquee" aria-hidden="true">
      <div class="marquee-edge marquee-top"></div>
      <div class="marquee-edge marquee-right"></div>
      <div class="marquee-edge marquee-bottom"></div>
      <div class="marquee-edge marquee-left"></div>
      <div class="marquee-corner corner-tl"></div>
      <div class="marquee-corner corner-tr"></div>
      <div class="marquee-corner corner-br"></div>
      <div class="marquee-corner corner-bl"></div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSettingsStore } from '@/modules/settings/settings-store'

const settingsStore = useSettingsStore()

const visible = computed(() => settingsStore.showPageMarquee)
</script>

<style scoped>
.page-marquee {
  position: fixed;
  inset: 0;
  z-index: 9998;
  pointer-events: none;
}

/* ===== 四边流光 ===== */
.marquee-edge {
  position: absolute;
}

.marquee-top,
.marquee-bottom {
  left: 0;
  right: 0;
  height: 2px;
}

.marquee-top {
  top: 0;
  background: linear-gradient(
    90deg,
    transparent 0%,
    #ff6b6b 10%,
    #ffa500 25%,
    #f7e74a 40%,
    #4af78a 50%,
    #4acff7 60%,
    #a44af7 75%,
    #f74acf 90%,
    transparent 100%
  );
  background-size: 200% 100%;
  animation: marqueeH 3s linear infinite;
}

.marquee-bottom {
  bottom: 0;
  background: linear-gradient(
    90deg,
    transparent 0%,
    #f74acf 10%,
    #a44af7 25%,
    #4acff7 40%,
    #4af78a 50%,
    #f7e74a 60%,
    #ffa500 75%,
    #ff6b6b 90%,
    transparent 100%
  );
  background-size: 200% 100%;
  animation: marqueeH 3s linear infinite reverse;
}

.marquee-left,
.marquee-right {
  top: 0;
  bottom: 0;
  width: 2px;
}

.marquee-left {
  left: 0;
  background: linear-gradient(
    180deg,
    transparent 0%,
    #a44af7 10%,
    #4acff7 25%,
    #4af78a 40%,
    #f7e74a 50%,
    #ffa500 60%,
    #ff6b6b 75%,
    #f74acf 90%,
    transparent 100%
  );
  background-size: 100% 200%;
  animation: marqueeV 3s linear infinite;
}

.marquee-right {
  right: 0;
  background: linear-gradient(
    180deg,
    transparent 0%,
    #f74acf 10%,
    #ff6b6b 25%,
    #ffa500 40%,
    #f7e74a 50%,
    #4af78a 60%,
    #4acff7 75%,
    #a44af7 90%,
    transparent 100%
  );
  background-size: 100% 200%;
  animation: marqueeV 3s linear infinite reverse;
}

@keyframes marqueeH {
  from { background-position: 200% 0; }
  to { background-position: 0 0; }
}

@keyframes marqueeV {
  from { background-position: 0 200%; }
  to { background-position: 0 0; }
}

/* ===== 四角光点 ===== */
.marquee-corner {
  position: absolute;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  filter: blur(4px);
}

.corner-tl {
  top: 0;
  left: 0;
  background: #a44af7;
  box-shadow: 0 0 16px 4px #a44af7, 0 0 32px 8px #4acff7;
  animation: cornerGlow 2s ease-in-out infinite;
}

.corner-tr {
  top: 0;
  right: 0;
  background: #f74acf;
  box-shadow: 0 0 16px 4px #f74acf, 0 0 32px 8px #ff6b6b;
  animation: cornerGlow 2s ease-in-out 0.5s infinite;
}

.corner-br {
  bottom: 0;
  right: 0;
  background: #ff6b6b;
  box-shadow: 0 0 16px 4px #ff6b6b, 0 0 32px 8px #ffa500;
  animation: cornerGlow 2s ease-in-out 1s infinite;
}

.corner-bl {
  bottom: 0;
  left: 0;
  background: #4acff7;
  box-shadow: 0 0 16px 4px #4acff7, 0 0 32px 8px #4af78a;
  animation: cornerGlow 2s ease-in-out 1.5s infinite;
}

@keyframes cornerGlow {
  0%, 100% { opacity: 0.3; transform: scale(0.7); }
  50% { opacity: 1; transform: scale(1.4); }
}
</style>
