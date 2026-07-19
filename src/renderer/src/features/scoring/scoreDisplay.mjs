const DISPLAY_MODES = new Set(['TOTAL', 'SPLIT', 'COMBINED'])

export function createScoreDisplayModel(referee, mode = 'COMBINED', scale = 1) {
  const source = referee && typeof referee === 'object' ? referee : {}
  const normalizedMode = DISPLAY_MODES.has(mode) ? mode : 'COMBINED'
  const numericScale = Number(scale)
  return {
    mode: normalizedMode,
    scale: Math.min(2.4, Math.max(0.6, Number.isFinite(numericScale) ? numericScale : 1)),
    score: {
      total: source.total ?? 0,
      plus: source.plus ?? 0,
      minus: source.minus ?? 0,
      penalty: source.penalty ?? 0
    },
    hasPenalty: source.mode === 'DUAL' && Number(source.penalty ?? 0) > 0
  }
}
