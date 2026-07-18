import { createHash } from 'node:crypto'

export function stableDatabaseId(...parts: string[]): string {
  return createHash('sha256').update(parts.join('\0')).digest('hex').slice(0, 32)
}
