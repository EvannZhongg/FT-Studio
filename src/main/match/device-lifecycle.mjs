function errorCode(error) {
  return typeof error?.code === 'string' && error.code
    ? error.code
    : 'DEVICE_SHUTDOWN_FAILED'
}

async function runShutdownStep(action) {
  if (!action) return { status: 'skipped' }
  try {
    const result = await action()
    return result?.skipped === true ? { status: 'skipped' } : { status: 'ok' }
  } catch (error) {
    return { status: 'error', error: errorCode(error) }
  }
}

export class DeviceLifecycle {
  constructor({ disconnectWorker, disconnectLegacy, onStopped = () => {} }) {
    this.disconnectWorker = disconnectWorker
    this.disconnectLegacy = disconnectLegacy
    this.onStopped = onStopped
    this.pendingStop = null
  }

  stop(reason = 'unknown') {
    if (this.pendingStop) return this.pendingStop
    const pending = this._stop(reason).finally(() => {
      if (this.pendingStop === pending) this.pendingStop = null
    })
    this.pendingStop = pending
    return pending
  }

  async _stop(reason) {
    const [worker, legacy] = await Promise.all([
      runShutdownStep(this.disconnectWorker),
      runShutdownStep(this.disconnectLegacy)
    ])
    const result = {
      ok: worker.status !== 'error' && legacy.status !== 'error',
      worker,
      legacy
    }
    this.onStopped(reason, result)
    return result
  }
}
