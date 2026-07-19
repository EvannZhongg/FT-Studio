<template>
  <div class="score-display-mode-switch" :aria-label="$t('ov_lbl_mode')">
    <button
      v-for="option in modeOptions"
      :key="option.value"
      type="button"
      :class="{ active: modelValue === option.value }"
      @click="$emit('update:modelValue', option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<script setup>
import { computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  modelValue: { type: String, default: 'COMBINED' },
  storageKey: { type: String, default: 'overlay_config_v2' }
})
const emit = defineEmits(['update:modelValue'])
const { t } = useI18n()
const modeOptions = computed(() => [
  { value: 'TOTAL', label: t('ov_opt_total') },
  { value: 'SPLIT', label: t('ov_opt_split') },
  { value: 'COMBINED', label: t('ov_opt_combined') }
])

onMounted(() => {
  try {
    const saved = JSON.parse(localStorage.getItem(props.storageKey) || '{}')
    if (['TOTAL', 'SPLIT', 'COMBINED'].includes(saved.displayMode)) {
      emit('update:modelValue', saved.displayMode)
    }
  } catch {
    // Ignore invalid persisted display settings.
  }
})

watch(
  () => props.modelValue,
  (value) => {
    try {
      const saved = JSON.parse(localStorage.getItem(props.storageKey) || '{}')
      localStorage.setItem(props.storageKey, JSON.stringify({ ...saved, displayMode: value }))
    } catch {
      localStorage.setItem(props.storageKey, JSON.stringify({ displayMode: value }))
    }
  }
)
</script>

<style scoped>
.score-display-mode-switch {
  flex: 0 0 auto;
  display: inline-flex;
  overflow: hidden;
  border: 1px solid transparent;
  border-radius: 5px;
  background: transparent;
}
.score-display-mode-switch button {
  min-height: 30px;
  padding: 0 9px;
  border: 0;
  background: transparent;
  color: rgba(255, 255, 255, 0.56);
  font-size: 0.7rem;
  cursor: pointer;
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.55);
  transition: color 0.16s ease, background-color 0.16s ease, box-shadow 0.16s ease;
}
.score-display-mode-switch button.active { background: rgba(255, 255, 255, 0.06); color: rgba(255, 255, 255, 0.76); box-shadow: inset 0 -2px rgba(255, 255, 255, 0.52); }
.score-display-mode-switch button:hover,
.score-display-mode-switch button:focus-visible { outline: none; background: rgba(255, 255, 255, 0.12); color: #fff; box-shadow: inset 0 -2px #fff; }
</style>
