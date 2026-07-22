import type { WindowCapabilityError } from '../../shared/ipc-contract.ts'

const EXPECTED_WINDOW_CAPABILITY_ERRORS = new Set<WindowCapabilityError>([
  'WINDOW_PERMISSION_DENIED',
  'PLATFORM_UNSUPPORTED'
])

export function expectedWindowCapabilityError(error: unknown): WindowCapabilityError | null {
  if (!error || typeof error !== 'object' || !('code' in error)) return null
  const code = error.code
  return typeof code === 'string' &&
    EXPECTED_WINDOW_CAPABILITY_ERRORS.has(code as WindowCapabilityError)
    ? (code as WindowCapabilityError)
    : null
}
