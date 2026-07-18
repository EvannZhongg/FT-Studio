import type { DeviceRole, RefereeMode } from '../domain/scoring.mts'
import { MatchSessionError } from './match-session-error.mts'

export interface MatchDeviceBinding {
  index: number
  mode: RefereeMode
  primaryDeviceId: string | null
  secondaryDeviceId: string | null
}

export interface MatchDeviceConnection {
  refereeIndex: number
  role: DeviceRole
  deviceId: string
}

export interface MatchDeviceConnectionRequest {
  connectionId: string
  deviceId: string
}

interface MatchDeviceSessionDependencies {
  requestWorker: (
    method: string,
    params?: Record<string, unknown>,
    timeoutMs?: number
  ) => Promise<unknown>
}

export class MatchDeviceSession {
  private readonly dependencies: MatchDeviceSessionDependencies
  private readonly connections = new Map<string, MatchDeviceConnection>()

  constructor(dependencies: MatchDeviceSessionDependencies) {
    this.dependencies = dependencies
  }

  configure(bindings: MatchDeviceBinding[]): MatchDeviceConnectionRequest[] {
    this.connections.clear()
    for (const binding of bindings) {
      this.addConnection(binding.index, 'primary', binding.primaryDeviceId)
      if (binding.mode === 'DUAL') {
        this.addConnection(binding.index, 'secondary', binding.secondaryDeviceId)
      }
    }
    return this.connectionRequests()
  }

  clear(): void {
    this.connections.clear()
  }

  connectionFor(connectionId: string): MatchDeviceConnection | null {
    return this.connections.get(connectionId) ?? null
  }

  connectionRequests(): MatchDeviceConnectionRequest[] {
    return [...this.connections].map(([connectionId, connection]) => ({
      connectionId,
      deviceId: connection.deviceId
    }))
  }

  async disconnectBeforeStart(): Promise<void> {
    await this.dependencies.requestWorker('device.disconnectAll')
  }

  async connectConfigured(
    requests: MatchDeviceConnectionRequest[] = this.connectionRequests()
  ): Promise<{ connections: unknown[] }> {
    const result = await this.dependencies.requestWorker(
      'device.connectMany',
      { connections: requests },
      30000
    )
    if (!isRecord(result) || !Array.isArray(result.connections)) {
      throw new MatchSessionError(
        'MATCH_DEVICE_RESPONSE_INVALID',
        'Device connection response is invalid'
      )
    }
    return { connections: result.connections }
  }

  resetAll(): Promise<unknown> {
    return this.dependencies.requestWorker('device.resetAll', {}, 10000)
  }

  async disconnectAfterCancelledStart(): Promise<void> {
    try {
      await this.dependencies.requestWorker('device.disconnectAll', {}, 5000)
    } catch {
      // The original start error remains authoritative.
    }
  }

  private addConnection(
    refereeIndex: number,
    role: DeviceRole,
    deviceId: string | null
  ): void {
    if (!deviceId) return
    const connectionId = `match-ref-${refereeIndex}-${role}`
    this.connections.set(connectionId, { refereeIndex, role, deviceId })
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
