<template>
  <section
    ref="panelRef"
    class="score-overlay-panel"
    :class="{ draggable, dragging: isDragging }"
    :style="panelStyle"
  >
    <header
      v-if="showHeader || draggable"
      class="panel-header"
      :class="{ 'drag-handle': draggable }"
      :title="draggable ? $t('media_score_overlay') : undefined"
      @pointerdown="startDrag"
      @pointermove="moveDrag"
      @pointerup="stopDrag"
      @pointercancel="stopDrag"
    >
      <div class="panel-identity">
        <span v-if="showHeader" class="panel-label">{{ $t('media_score_overlay') }}</span>
        <strong>{{ contestant || $t('ov_contestant_waiting') }}</strong>
      </div>
      <ScoreDisplayModeSwitch v-if="showHeader" v-model="displayMode" />
      <GripVertical v-if="draggable" class="drag-icon" :size="16" aria-hidden="true" />
    </header>

    <div v-if="refereeEntries.length" class="overlay-score-grid">
      <article v-for="[key, referee] in refereeEntries" :key="key" class="overlay-score-card">
        <div class="referee-header">
          <span>{{ referee.name || `${$t('lbl_referee')} ${key}` }}</span>
          <div v-if="referee.status" class="connection-status">
            <span :class="referee.status.pri || 'disconnected'"></span>
            <span
              v-if="referee.status.sec && referee.status.sec !== 'n/a'"
              :class="referee.status.sec"
            ></span>
          </div>
        </div>

        <RefereeScoreDisplay :referee="referee" :mode="displayMode" />
      </article>
    </div>
    <div v-else class="score-empty">{{ $t('media_score_empty') }}</div>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { GripVertical } from 'lucide-vue-next'
import RefereeScoreDisplay from './RefereeScoreDisplay.vue'
import ScoreDisplayModeSwitch from './ScoreDisplayModeSwitch.vue'

const props = defineProps({
  referees: { type: Object, default: () => ({}) },
  contestant: { type: String, default: '' },
  showHeader: { type: Boolean, default: true },
  displayMode: { type: String, default: null },
  draggable: { type: Boolean, default: false },
  positionKey: { type: String, default: '' },
  initialX: { type: Number, default: 18 },
  initialY: { type: Number, default: 70 }
})
const emit = defineEmits(['update:displayMode'])
const internalDisplayMode = ref('COMBINED')
const panelRef = ref(null)
const isDragging = ref(false)
const position = ref({ x: props.initialX, y: props.initialY })
let dragState = null
let resizeObserver = null

const displayMode = computed({
  get: () => props.displayMode || internalDisplayMode.value,
  set: (value) => {
    if (props.displayMode) emit('update:displayMode', value)
    else internalDisplayMode.value = value
  }
})
const refereeEntries = computed(() => Object.entries(props.referees || {}))
const scoreColumnCount = computed(() => Math.min(Math.max(refereeEntries.value.length, 1), 3))
const panelStyle = computed(() => {
  if (!props.draggable) return undefined
  return {
    left: `${position.value.x}px`,
    top: `${position.value.y}px`,
    '--score-panel-columns': String(scoreColumnCount.value)
  }
})

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

const clampPosition = (candidate = position.value) => {
  const panel = panelRef.value
  const parent = panel?.offsetParent
  if (!props.draggable || !(parent instanceof HTMLElement)) return candidate

  const inset = 12
  const maxX = Math.max(inset, parent.clientWidth - panel.offsetWidth - inset)
  const maxY = Math.max(inset, parent.clientHeight - panel.offsetHeight - inset)
  const next = {
    x: clamp(Math.round(candidate.x), inset, maxX),
    y: clamp(Math.round(candidate.y), inset, maxY)
  }
  position.value = next
  return next
}

const loadPosition = () => {
  if (!props.draggable || !props.positionKey) return
  try {
    const saved = JSON.parse(localStorage.getItem(props.positionKey) || '{}')
    if (Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
      position.value = { x: saved.x, y: saved.y }
    }
  } catch {
    // Ignore invalid persisted panel positions.
  }
}

const savePosition = () => {
  if (!props.draggable || !props.positionKey) return
  localStorage.setItem(props.positionKey, JSON.stringify(position.value))
}

const startDrag = (event) => {
  if (!props.draggable || event.button !== 0 || event.target.closest('button')) return
  const handle = event.currentTarget
  handle.setPointerCapture?.(event.pointerId)
  dragState = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    panelX: position.value.x,
    panelY: position.value.y
  }
  isDragging.value = true
  event.preventDefault()
}

const moveDrag = (event) => {
  if (!dragState || event.pointerId !== dragState.pointerId) return
  clampPosition({
    x: dragState.panelX + event.clientX - dragState.startX,
    y: dragState.panelY + event.clientY - dragState.startY
  })
}

const stopDrag = (event) => {
  if (!dragState || event.pointerId !== dragState.pointerId) return
  event.currentTarget.releasePointerCapture?.(event.pointerId)
  dragState = null
  isDragging.value = false
  savePosition()
}

onMounted(async () => {
  if (!props.draggable) return
  loadPosition()
  await nextTick()
  clampPosition()
  resizeObserver = new ResizeObserver(() => clampPosition())
  if (panelRef.value) {
    resizeObserver.observe(panelRef.value)
    if (panelRef.value.offsetParent instanceof HTMLElement) {
      resizeObserver.observe(panelRef.value.offsetParent)
    }
  }
})

watch(
  () => refereeEntries.value.length,
  () => nextTick(() => clampPosition())
)

onBeforeUnmount(() => resizeObserver?.disconnect())
</script>

<style scoped>
.score-overlay-panel { min-width: 0; color: var(--workbench-text); }
.score-overlay-panel.draggable { position: absolute; width: max-content; max-width: calc(100% - 24px); box-sizing: border-box; pointer-events: auto; user-select: none; }
.panel-header { min-height: 42px; display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
.panel-header.drag-handle { min-height: 28px; width: fit-content; max-width: 100%; margin: 0 0 6px; padding: 0 7px 0 10px; border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 4px; box-sizing: border-box; background: rgba(18, 20, 22, 0.68); color: rgba(255, 255, 255, 0.72); box-shadow: 0 3px 12px rgba(0, 0, 0, 0.24); cursor: grab; touch-action: none; }
.score-overlay-panel.dragging .panel-header.drag-handle { color: #fff; cursor: grabbing; }
.drag-icon { flex: 0 0 auto; margin-left: 3px; }
.panel-identity { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.panel-label { color: var(--workbench-muted); font-size: 0.72rem; }
.panel-identity strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.9rem; }
.overlay-score-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
.draggable .overlay-score-grid { grid-template-columns: repeat(var(--score-panel-columns), minmax(156px, 168px)); gap: 8px; }
.overlay-score-card { min-width: 0; min-height: 94px; box-sizing: border-box; display: flex; flex-direction: column; padding: 10px 12px; border-left: 4px solid var(--workbench-accent); border-radius: 4px; background: color-mix(in srgb, var(--workbench-surface) 92%, transparent); box-shadow: 2px 2px 10px rgba(0, 0, 0, 0.35); }
.draggable .overlay-score-card { min-height: 88px; padding: 8px 10px; }
.referee-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-bottom: 5px; border-bottom: 1px solid var(--workbench-border); color: var(--workbench-text-secondary); font-size: 0.76rem; }
.connection-status { display: inline-flex; gap: 4px; }
.connection-status span { width: 6px; height: 6px; border-radius: 50%; background: #666; }
.connection-status span.connected { background: #2ecc71; }
.connection-status span.connecting { background: #e0ad42; }
.score-empty { min-height: 110px; display: flex; align-items: center; justify-content: center; border: 1px dashed var(--workbench-border); border-radius: 5px; color: var(--workbench-muted); font-size: 0.8rem; }
@media (max-width: 560px) {
  .panel-header { align-items: flex-start; flex-direction: column; }
  .panel-header.drag-handle { align-items: center; flex-direction: row; }
  .overlay-score-grid { grid-template-columns: 1fr; }
  .draggable .overlay-score-grid { grid-template-columns: minmax(156px, 168px); }
}
</style>
