<template>
  <div class="referee-score-display" :class="modeClass" :style="scaleStyle">
    <template v-if="normalizedMode === 'TOTAL'">
      <span class="score-val total-value">{{ score.total }}</span>
      <template v-if="hasPenalty">
        <span class="score-divider">/</span>
        <span class="score-val penalty-text">-{{ score.penalty }}</span>
      </template>
    </template>

    <template v-else-if="normalizedMode === 'SPLIT'">
      <span class="score-val plus">+{{ score.plus }}</span>
      <span class="score-divider">/</span>
      <span class="score-val minus">-{{ score.minus }}</span>
      <template v-if="hasPenalty">
        <span class="score-divider">/</span>
        <span class="score-val penalty-text">-{{ score.penalty }}</span>
      </template>
    </template>

    <template v-else>
      <span class="combined-total">{{ score.total }}</span>
      <span class="combined-detail">
        <span class="mini-plus">+{{ score.plus }}</span>
        <span class="score-divider-small">/</span>
        <span class="mini-minus">-{{ score.minus }}</span>
        <template v-if="hasPenalty">
          <span class="score-divider-small">/</span>
          <span class="penalty-text">-{{ score.penalty }}</span>
        </template>
      </span>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { createScoreDisplayModel } from '../features/scoring/scoreDisplay.mjs'

const props = defineProps({
  referee: { type: Object, required: true },
  mode: { type: String, default: 'COMBINED' },
  scale: { type: Number, default: 1 }
})

const model = computed(() => createScoreDisplayModel(props.referee, props.mode, props.scale))
const normalizedMode = computed(() => model.value.mode)
const modeClass = computed(() => `mode-${normalizedMode.value.toLowerCase()}`)
const scaleStyle = computed(() => ({
  '--score-font-scale': String(model.value.scale)
}))
const score = computed(() => model.value.score)
const hasPenalty = computed(() => model.value.hasPenalty)
</script>

<style scoped>
.referee-score-display {
  width: 100%;
  min-width: 0;
  min-height: calc(58px * var(--score-font-scale));
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--score-text, #f4f4f5);
  overflow: hidden;
  white-space: nowrap;
}
.mode-total,
.mode-split {
  gap: calc(7px * var(--score-font-scale));
}
.mode-split {
  font-size: calc(1.8rem * var(--score-font-scale));
}
.mode-combined {
  flex-direction: column;
  padding-top: calc(4px * var(--score-font-scale));
}
.score-val {
  font-weight: 750;
  line-height: 1;
}
.total-value {
  color: var(--score-positive, #73c997);
  font-size: calc(2.4rem * var(--score-font-scale));
}
.score-divider {
  color: var(--score-divider, #666b72);
  font-size: calc(1.5rem * var(--score-font-scale));
  font-weight: 400;
}
.plus {
  color: var(--score-text, #f4f4f5);
}
.minus,
.penalty-text {
  color: var(--score-negative, #ff7f7f);
}
.mode-total .penalty-text {
  font-size: calc(1.25rem * var(--score-font-scale));
}
.combined-total {
  color: var(--score-positive, #73c997);
  font-size: calc(2rem * var(--score-font-scale));
  font-weight: 750;
  line-height: 1;
}
.combined-detail {
  display: flex;
  align-items: center;
  gap: calc(5px * var(--score-font-scale));
  margin-top: calc(4px * var(--score-font-scale));
  color: var(--score-text-secondary, #d8dade);
  font-size: calc(0.8rem * var(--score-font-scale));
}
.score-divider-small {
  color: var(--score-divider, #666b72);
  font-weight: 400;
}
.mini-minus {
  color: var(--score-negative, #ff7f7f);
}
</style>
