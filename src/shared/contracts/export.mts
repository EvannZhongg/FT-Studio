export type ExportSrtMode = 'TOTAL' | 'SPLIT' | 'REALTIME'
export type ReportExportView = 'RAW' | 'SCALED'

export interface ExportScope {
  sourceKey: string
  groupNames?: string[]
  contestantNames?: string[]
  refereeIndexes?: number[]
}

export interface DetailExportRequest {
  scope: ExportScope
  includeCsv: boolean
  includeSrt: boolean
  srtMode: ExportSrtMode
}

export interface ReportExportRequest {
  sourceKey: string
  groupName: string
  view: ReportExportView
  scaleRatio: number
  includePenalty: boolean
}

export type ExportErrorCode =
  | 'EXPORT_REQUEST_INVALID'
  | 'EXPORT_COMPETITION_NOT_FOUND'
  | 'EXPORT_SCOPE_NOT_FOUND'
  | 'EXPORT_NO_DATA'
  | 'EXPORT_DATA_INVALID'
  | 'EXPORT_PERMISSION_DENIED'
  | 'EXPORT_DISK_FULL'
  | 'EXPORT_WRITE_FAILED'

export type ExportSaveResult =
  | { status: 'saved'; fileName: string }
  | { status: 'cancelled' }
  | { status: 'error'; error: ExportErrorCode }
