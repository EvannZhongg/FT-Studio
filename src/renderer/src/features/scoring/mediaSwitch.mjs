export const MEDIA_SWITCH_PHASES = Object.freeze([
  'idle',
  'checking_current_draft',
  'choosing_target_binding',
  'editing_target_binding',
  'choosing_progress',
  'confirming_completion',
  'switching_context',
  'loading_player',
  'ready'
])

export function mediaKey(binding) {
  return binding ? `${binding.provider}:${binding.media_id}:${binding.segment}` : null
}

export function canContinueMediaPosition(activeBinding, targetBinding, mediaStatus) {
  return Boolean(
    activeBinding &&
    targetBinding &&
    activeBinding.provider === 'youtube' &&
    mediaStatus === 'aligned' &&
    mediaKey(activeBinding) === mediaKey(targetBinding)
  )
}

export function resolveTargetMediaInput(
  choice,
  targetBinding,
  parsedDraft,
  enteredUrl,
  activeBinding
) {
  if (choice === 'existing') {
    return {
      binding: targetBinding || null,
      url: targetBinding?.canonical_url || ''
    }
  }
  const url = typeof enteredUrl === 'string' ? enteredUrl.trim() : ''
  if (url) return { binding: parsedDraft || null, url }
  return {
    binding: activeBinding || null,
    url: activeBinding?.canonical_url || ''
  }
}

export function createSwitchOperationGate() {
  let sequence = 0
  let activeToken = null
  return {
    begin() {
      if (activeToken !== null) return null
      activeToken = ++sequence
      return activeToken
    },
    isCurrent(token) {
      return token !== null && token === activeToken
    },
    finish(token) {
      if (token !== activeToken) return false
      activeToken = null
      return true
    },
    cancel() {
      sequence += 1
      activeToken = null
    },
    isActive() {
      return activeToken !== null
    }
  }
}
