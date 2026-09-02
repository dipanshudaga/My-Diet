import { useCallback, useEffect, useState } from 'react'
import type { LogEntry } from './ai/schema'
import { LogInput } from './components/LogInput/LogInput'
import { TodayView } from './components/TodayView/TodayView'
import { db } from './db/dexie'
import { listIfctFoods } from './nutrition/ifct/ifct'

function isToday(isoTimestamp: string): boolean {
  return new Date(isoTimestamp).toDateString() === new Date().toDateString()
}

export default function App() {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [knownFoodNames, setKnownFoodNames] = useState<string[]>([])

  const refresh = useCallback(async () => {
    const all = await db.logEntries.toArray()
    setEntries(all.filter((e) => isToday(e.timestamp)).sort((a, b) => b.timestamp.localeCompare(a.timestamp)))
  }, [])

  useEffect(() => {
    refresh()
    db.knownProducts.toArray().then((products) => {
      setKnownFoodNames([...products.map((p) => p.name), ...listIfctFoods().map((f) => f.name)])
    })
  }, [refresh])

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <h1 className="text-xl font-bold text-neutral-900">My Diet</h1>
      <LogInput knownFoodNames={knownFoodNames} onSaved={refresh} />
      <TodayView entries={entries} onChanged={refresh} />
    </div>
  )
}
