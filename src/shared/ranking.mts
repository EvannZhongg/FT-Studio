export interface RankingContext {
  sourceKey: string
  stageId: string
  groupName: string
  contestantName: string
  attemptNumber: number
}

export interface RankingReferee {
  index: number
  mode: 'SINGLE' | 'DUAL'
}

export interface RankingScore {
  total: number
  plus: number
  minus: number
  penalty: number
}

export interface RankingContestant {
  id: string
  name: string
  position: number
  status: 'pending' | 'active' | 'completed' | 'invalidated'
  scores: Record<number, RankingScore>
}

export interface RankingSnapshot {
  context: RankingContext
  stageName: string
  referees: RankingReferee[]
  contestants: RankingContestant[]
}

export interface RankedContestant extends RankingContestant {
  rank: number
  finalScore: number
  scaledScores: Record<number, number>
  penaltyVal: number
}

export function standardPenalty(penalties: number[]): number {
  const counts = new Map<number, number>()
  for (const value of penalties) counts.set(value, (counts.get(value) || 0) + 1)
  let frequency = 0
  let penalty = 0
  for (const [value, count] of counts) {
    if (count > frequency || (count === frequency && value > penalty)) {
      frequency = count
      penalty = value
    }
  }
  return penalty
}

// Every configured referee participates in the average, including zero scores.
// Rank at displayed precision so identical displayed scores always share a rank.
export function rankContestants(
  contestants: RankingContestant[],
  referees: RankingReferee[],
  scaleRatio = 60,
  includePenalty = true
): RankedContestant[] {
  const maxima = new Map(
    referees.map(({ index }) => [
      index,
      Math.max(0, ...contestants.map((value) => value.scores[index]?.total ?? 0))
    ])
  )
  const rows = contestants
    .map((contestant) => {
      const scaledScores = Object.fromEntries(
        referees.map(({ index }) => {
          const maximum = maxima.get(index) || 0
          return [
            index,
            maximum > 0 ? ((contestant.scores[index]?.total ?? 0) / maximum) * scaleRatio : 0
          ]
        })
      )
      const penaltyVal = includePenalty
        ? standardPenalty(
            referees
              .filter(({ mode }) => mode === 'DUAL')
              .map(({ index }) => contestant.scores[index]?.penalty ?? 0)
          )
        : 0
      const average = referees.length
        ? Object.values(scaledScores).reduce((sum, score) => sum + score, 0) / referees.length
        : 0
      return {
        ...contestant,
        scaledScores,
        penaltyVal,
        finalScore: Math.round((average - penaltyVal) * 100) / 100,
        rank: 0
      }
    })
    .sort((left, right) => right.finalScore - left.finalScore || left.position - right.position)
  rows.forEach((row, index) => {
    row.rank =
      index > 0 && row.finalScore === rows[index - 1].finalScore ? rows[index - 1].rank : index + 1
  })
  return rows
}

export function liveRanking(
  snapshot: RankingSnapshot,
  scaleRatio = 60,
  includePenalty = true
): RankedContestant[] {
  return rankContestants(
    snapshot.contestants.filter(
      (value) =>
        value.status === 'completed' ||
        (value.status === 'active' && Object.keys(value.scores).length > 0)
    ),
    snapshot.referees,
    scaleRatio,
    includePenalty
  )
}

// K is a row budget: ties retain their true rank without expanding the overlay.
export function visibleRanking(
  rows: RankedContestant[],
  currentName: string,
  topK: number,
  showCurrent = true
) {
  const count = Number.isInteger(topK) ? Math.min(20, Math.max(1, topK)) : 3
  const leaders = rows.slice(0, count)
  const currentIndex = rows.findIndex((row) => row.name === currentName)
  const current = showCurrent && currentIndex >= count ? rows[currentIndex] : null
  return { leaders, current, hiddenCount: current ? currentIndex - leaders.length : 0 }
}
