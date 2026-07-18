export function createGroupDraft(index = 0, mode = 'TOURNAMENT') {
  return {
    name: mode === 'FREE' && index === 0 ? 'Free Mode' : `Group ${index + 1}`,
    refCount: mode === 'FREE' ? 1 : 3,
    rawPlayers: 'Player 1',
    players: ['Player 1'],
    referees: []
  }
}

export function toStageDraft(stage, mode = 'TOURNAMENT') {
  const groups = (stage.groups || []).map((group) => ({
    ...group,
    referees: (group.referees || []).map((referee) => ({ ...referee })),
    players: [...(group.players || [])],
    rawPlayers: (group.players || []).join('\n')
  }))
  return {
    ...stage,
    attempts: Number(stage.attempts) || 1,
    groups: groups.length > 0 ? groups : [createGroupDraft(0, mode)]
  }
}

export function toStageInput(stage) {
  return {
    name: String(stage.name || '').trim(),
    attempts: Number(stage.attempts),
    groups: stage.groups.map((group) => ({
      name: String(group.name || '').trim(),
      refCount: Number(group.refCount),
      players: String(group.rawPlayers || '')
        .split('\n')
        .map((player) => player.trim())
        .filter(Boolean),
      referees: (group.referees || []).map((referee) => ({ ...referee }))
    }))
  }
}

export function clampAttempt(attemptNumber, attempts) {
  const maximum = Math.max(1, Number(attempts) || 1)
  return Math.min(maximum, Math.max(1, Number(attemptNumber) || 1))
}
