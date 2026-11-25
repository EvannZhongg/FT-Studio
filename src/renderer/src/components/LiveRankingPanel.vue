<template>
  <section class="live-ranking" :aria-label="$t('ov_rank_title')">
    <header class="ranking-header">
      <strong>{{ $t('ov_rank_title') }}</strong>
      <span class="ranking-live">{{ $t('ov_rank_provisional') }}</span>
    </header>
    <template v-if="snapshot">
      <p class="ranking-scope" :title="scopeLabel">{{ scopeLabel }}</p>
      <div class="ranking-columns" aria-hidden="true">
        <span>{{ $t('rpt_col_rank') }}</span
        ><span>{{ $t('ov_rank_contestant') }}</span
        ><span>{{ $t('ov_rank_score') }}</span>
      </div>
      <ol class="ranking-list">
        <li v-for="row in display.leaders" :key="row.id" :class="{ current: isCurrent(row) }">
          <span class="ranking-place">{{ row.rank }}</span>
          <span class="ranking-name" :title="row.name">{{ row.name }}</span>
          <span v-if="isCurrent(row)" class="current-tag">{{ $t('ov_rank_current') }}</span>
          <strong class="ranking-score">{{ row.finalScore.toFixed(2) }}</strong>
        </li>
        <li v-if="display.hiddenCount" class="ranking-gap">
          <span>···</span><span>{{ $t('ov_rank_hidden', { count: display.hiddenCount }) }}</span>
        </li>
        <li v-if="display.current" class="current">
          <span class="ranking-place">{{ display.current.rank }}</span>
          <span class="ranking-name" :title="display.current.name">{{ display.current.name }}</span>
          <span class="current-tag">{{ $t('ov_rank_current') }}</span>
          <strong class="ranking-score">{{ display.current.finalScore.toFixed(2) }}</strong>
        </li>
        <li v-if="showCurrent && waitingCurrent" class="current waiting">
          <span class="ranking-place">—</span>
          <span class="ranking-name" :title="snapshot.context.contestantName">{{
            snapshot.context.contestantName
          }}</span>
          <span class="current-tag">{{ $t('ov_rank_current') }}</span>
          <span class="ranking-score">{{ $t('ov_rank_waiting') }}</span>
        </li>
      </ol>
      <p v-if="!rows.length" class="ranking-empty">{{ $t('ov_rank_empty') }}</p>
      <footer>
        {{ $t('ov_rank_rule', { scale: scaleRatio })
        }}{{ includePenalty ? $t('ov_rank_with_penalty') : '' }}
      </footer>
    </template>
    <p v-else class="ranking-empty">{{ $t('ov_rank_unavailable') }}</p>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { liveRanking, visibleRanking } from '../../../shared/ranking.mts'

const props = defineProps({
  snapshot: { type: Object, default: null },
  topK: { type: Number, default: 3 },
  showCurrent: { type: Boolean, default: true },
  scaleRatio: { type: Number, default: 60 },
  includePenalty: { type: Boolean, default: true }
})
const { t } = useI18n()
const rows = computed(() =>
  props.snapshot ? liveRanking(props.snapshot, props.scaleRatio, props.includePenalty) : []
)
const display = computed(() =>
  visibleRanking(rows.value, props.snapshot?.context.contestantName, props.topK, props.showCurrent)
)
const currentContestant = computed(() =>
  props.snapshot?.contestants.find((row) => row.name === props.snapshot.context.contestantName)
)
const waitingCurrent = computed(
  () =>
    currentContestant.value &&
    currentContestant.value.status !== 'invalidated' &&
    !rows.value.some((row) => isCurrent(row))
)
const isCurrent = (row) => row.name === props.snapshot?.context.contestantName
const scopeLabel = computed(() =>
  props.snapshot
    ? `${props.snapshot.stageName} / ${props.snapshot.context.groupName} / ${t('ov_rank_attempt', { number: props.snapshot.context.attemptNumber })}`
    : ''
)
</script>

<style scoped>
.live-ranking {
  width: 100%;
  color: #f4f4f5;
  font-size: 13px;
}
.ranking-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  padding-bottom: 7px;
}
.ranking-header strong {
  font-size: 15px;
  font-weight: 650;
}
.ranking-live {
  color: #87c5ef;
  font-size: 11px;
}
.ranking-live::before {
  content: '';
  display: inline-block;
  width: 5px;
  height: 5px;
  margin-right: 5px;
  border-radius: 50%;
  background: currentColor;
  vertical-align: middle;
}
.ranking-scope {
  margin: 0 0 10px;
  color: #aaa;
  font-size: 11px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.ranking-columns {
  display: grid;
  grid-template-columns: 32px 1fr 64px;
  gap: 8px;
  color: #aaa;
  padding: 0 8px 5px;
  font-size: 10px;
  border-bottom: 1px solid #ffffff24;
}
.ranking-columns span:last-child {
  text-align: right;
}
.ranking-list {
  list-style: none;
  margin: 4px 0;
  padding: 0;
}
.ranking-list li {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 0 8px;
  border-bottom: 1px solid #ffffff0d;
}
.ranking-place {
  flex: 0 0 32px;
  color: #bbb;
  font-variant-numeric: tabular-nums;
}
.ranking-name {
  flex: 1 1 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ranking-score {
  flex: 0 0 64px;
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-size: 16px;
}
.ranking-list li.current {
  background: #3498db26;
  box-shadow: inset 2px 0 #63b8ef;
}
.current .ranking-place,
.current .ranking-score {
  color: #8ed0ff;
}
.current-tag {
  flex: 0 0 auto;
  font-size: 10px;
  color: #8ed0ff;
}
.ranking-list li.ranking-gap {
  min-height: 24px;
  justify-content: center;
  color: #999;
  font-size: 10px;
  border: none;
}
.waiting .ranking-score {
  font-size: 11px;
  color: #bbb;
}
.ranking-empty {
  margin: 12px 8px;
  color: #bbb;
  font-size: 12px;
  line-height: 1.5;
}
footer {
  margin-top: 9px;
  color: #aaa;
  font-size: 10px;
  line-height: 1.5;
}
</style>
