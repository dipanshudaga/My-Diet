import type { ParsedItemSource } from '../ai/schema'

export function SourceBadge({ source, confidence }: { source: ParsedItemSource; confidence: string }) {
  const label = source === 'known' ? 'your library' : source === 'ifct' ? 'IFCT' : source
  const isLow = confidence === 'low'
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs ${isLow ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
      {label}
    </span>
  )
}
