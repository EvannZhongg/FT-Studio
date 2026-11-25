import assert from 'node:assert/strict'
import test from 'node:test'
import {
  liveRanking,
  rankContestants,
  standardPenalty,
  visibleRanking
} from '../src/shared/ranking.mts'

const referees = [
  { index: 1, mode: 'SINGLE' },
  { index: 2, mode: 'DUAL' },
  { index: 3, mode: 'DUAL' }
]
const score = (total, penalty = 0) => ({
  total,
  plus: Math.max(0, total),
  minus: Math.max(0, -total),
  penalty
})
const player = (name, position, scores, status = 'completed') => ({
  id: name,
  name,
  position,
  scores,
  status
})

test('shares normalization, full-panel averaging and dual-referee penalty rules', () => {
  const rows = rankContestants(
    [
      player('Alice', 0, { 1: score(10, 99), 2: score(20, 2), 3: score(30, 1) }),
      player('Bob', 1, { 1: score(5), 2: score(10, 1), 3: score(15, 1) })
    ],
    referees
  )
  assert.deepEqual(
    rows.map((row) => [row.name, row.finalScore, row.penaltyVal]),
    [
      ['Alice', 58, 2],
      ['Bob', 29, 1]
    ]
  )
  assert.equal(rankContestants([player('Alice', 0, { 1: score(10) })], referees)[0].finalScore, 20)
  assert.equal(standardPenalty([1, 2, 1, 2]), 2)
  assert.equal(standardPenalty([3, 1, 1]), 1)
  assert.equal(
    rankContestants([player('A', 0, { 2: score(1, 5) })], referees, 100, false)[0].finalScore,
    33.33
  )
})

test('recalculates every contestant when one judge maximum changes', () => {
  const judges = referees.slice(0, 2)
  const contestants = [
    player('A', 0, { 1: score(10), 2: score(1) }),
    player('B', 1, { 1: score(5), 2: score(10) })
  ]
  const before = rankContestants(contestants, judges)
  assert.equal(before[0].name, 'B')
  contestants.push(player('C', 2, { 2: score(100) }))
  assert.equal(rankContestants(contestants, judges).find((row) => row.name === 'B').finalScore, 18)
})

test('keeps zero and negative scores finite and ties at displayed precision', () => {
  assert.equal(rankContestants([player('A', 0, { 1: score(-1) })], referees)[0].finalScore, 0)
  const rows = rankContestants(
    [
      player('B', 1, { 1: score(10000) }),
      player('A', 0, { 1: score(10000) }),
      player('C', 2, { 1: score(9999) }),
      player('D', 3, { 1: score(1) })
    ],
    [referees[0]]
  )
  assert.deepEqual(
    rows.map((row) => [row.name, row.rank]),
    [
      ['A', 1],
      ['B', 1],
      ['C', 3],
      ['D', 4]
    ]
  )
  const rounded = rankContestants(
    [player('A', 0, { 1: score(20000) }), player('B', 1, { 1: score(19999) })],
    [referees[0]]
  )
  assert.deepEqual(
    rounded.map((row) => [row.finalScore, row.rank]),
    [
      [60, 1],
      [60, 1]
    ]
  )
})

test('excludes pending, unscored active and invalidated attempts from ranks and maxima', () => {
  const snapshot = {
    referees: [referees[0]],
    contestants: [
      player('A', 0, { 1: score(5) }),
      player('B', 1, { 1: score(10) }, 'active'),
      player('Invalid', 2, { 1: score(100) }, 'invalidated'),
      player('Waiting', 3, {}, 'active'),
      player('Pending', 4, {}, 'pending'),
      player('Zero', 5, {})
    ]
  }
  assert.deepEqual(
    liveRanking(snapshot).map((row) => [row.name, row.finalScore]),
    [
      ['B', 60],
      ['A', 30],
      ['Zero', 0]
    ]
  )
})

test('shows exactly K leader rows, omits the middle and never duplicates current', () => {
  const rows = rankContestants(
    Array.from({ length: 8 }, (_, index) => player(`P${index}`, index, { 1: score(8 - index) })),
    [referees[0]]
  )
  const view = visibleRanking(rows, 'P7', 3)
  assert.equal(view.leaders.length, 3)
  assert.equal(view.current.rank, 8)
  assert.equal(view.hiddenCount, 4)
  assert.equal(visibleRanking(rows, 'P2', 3).current, null)
  assert.equal(visibleRanking(rows, 'P3', 3).hiddenCount, 0)
  assert.equal(visibleRanking(rows, 'P7', 3, false).current, null)
  assert.equal(visibleRanking(rows, 'Unknown', 3).current, null)
  assert.equal(visibleRanking(rows, 'P7', Number.NaN).leaders.length, 3)
})
