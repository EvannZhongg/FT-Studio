import type { FtEngineApi, FtOverlayApi } from '../../shared/ipc-contract'

declare global {
  interface Window {
    ftEngine?: FtEngineApi
    ftOverlay?: FtOverlayApi
  }
}

export {}
