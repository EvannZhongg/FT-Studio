const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['https:'])
const MAX_OVERLAY_DIMENSION = 32768
const MAX_INITIAL_STATE_BYTES = 2 * 1024 * 1024

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

export function normalizeExternalUrl(value) {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    return ALLOWED_EXTERNAL_PROTOCOLS.has(url.protocol) ? url.toString() : null
  } catch {
    return null
  }
}

export function normalizeOverlayOptions(value) {
  const options = isRecord(value) ? value : {}
  let bounds = null
  if (isRecord(options.bounds)) {
    bounds = ['x', 'y', 'width', 'height'].reduce((result, key) => {
      const number = Number(options.bounds[key])
      if (!Number.isFinite(number)) throw new Error('IPC_INVALID_OVERLAY_BOUNDS')
      result[key] = number
      return result
    }, {})
    if (
      bounds.width <= 0 ||
      bounds.height <= 0 ||
      bounds.width > MAX_OVERLAY_DIMENSION ||
      bounds.height > MAX_OVERLAY_DIMENSION
    ) {
      throw new Error('IPC_INVALID_OVERLAY_BOUNDS')
    }
  }

  const initialState = isRecord(options.initialState) ? options.initialState : null
  if (initialState) {
    const serialized = JSON.stringify(initialState)
    if (Buffer.byteLength(serialized, 'utf8') > MAX_INITIAL_STATE_BYTES) {
      throw new Error('IPC_OVERLAY_STATE_TOO_LARGE')
    }
  }

  return { bounds, initialState }
}
