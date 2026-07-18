export interface DisplayWorkArea {
  x: number
  y: number
  width: number
  height: number
}

export interface MainWindowLayout extends DisplayWorkArea {
  minWidth: number
  minHeight: number
}

const WINDOW_MARGIN = 24
const TARGET_WIDTH_RATIO = 0.725
const TARGET_HEIGHT_RATIO = 0.775
const MIN_ASPECT_RATIO = 1.55
const MAX_ASPECT_RATIO = 1.68

export function calculateMainWindowLayout(workArea: DisplayWorkArea): MainWindowLayout {
  for (const value of [workArea.x, workArea.y, workArea.width, workArea.height]) {
    if (!Number.isFinite(value)) throw new Error('WINDOW_WORK_AREA_INVALID')
  }
  if (workArea.width <= 0 || workArea.height <= 0) {
    throw new Error('WINDOW_WORK_AREA_INVALID')
  }

  const availableWidth = Math.floor(workArea.width)
  const availableHeight = Math.floor(workArea.height)
  const maxWidth = Math.max(1, availableWidth - Math.min(WINDOW_MARGIN * 2, availableWidth - 1))
  const maxHeight = Math.max(1, availableHeight - Math.min(WINDOW_MARGIN * 2, availableHeight - 1))
  const minWidth = Math.min(960, maxWidth)
  const minHeight = Math.min(600, maxHeight)
  let width = clamp(Math.round(availableWidth * TARGET_WIDTH_RATIO), minWidth, maxWidth)
  let height = clamp(Math.round(availableHeight * TARGET_HEIGHT_RATIO), minHeight, maxHeight)

  if (width / height > MAX_ASPECT_RATIO) {
    const requiredHeight = Math.ceil(width / MAX_ASPECT_RATIO)
    const preferredMaxHeight = Math.min(maxHeight, Math.floor(availableHeight * 0.8))
    if (requiredHeight <= preferredMaxHeight) {
      height = Math.max(height, requiredHeight)
    } else {
      width = Math.max(minWidth, Math.min(width, Math.floor(height * MAX_ASPECT_RATIO)))
    }
  } else if (width / height < MIN_ASPECT_RATIO) {
    const requiredWidth = Math.ceil(height * MIN_ASPECT_RATIO)
    const preferredMaxWidth = Math.min(maxWidth, Math.floor(availableWidth * 0.75))
    if (requiredWidth <= preferredMaxWidth) {
      width = Math.max(width, requiredWidth)
    } else {
      height = Math.max(minHeight, Math.min(height, Math.floor(width / MIN_ASPECT_RATIO)))
    }
  }

  return {
    x: Math.round(workArea.x + (availableWidth - width) / 2),
    y: Math.round(workArea.y + (availableHeight - height) / 2),
    width,
    height,
    minWidth,
    minHeight
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}
