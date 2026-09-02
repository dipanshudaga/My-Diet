import { useState } from 'react'
import type { Profile } from '../../ai/schema'
import { calculateTargets } from '../../goals/engine'
import { db } from '../../db/dexie'

export const PROFILE_ID = 'me'

interface Props {
  existing?: Profile
  onSaved: (profile: Profile) => void
  onCancel?: () => void
}

export function ProfileOnboarding({ existing, onSaved, onCancel }: Props) {
  const [age, setAge] = useState(existing?.age ?? 25)
  const [sex, setSex] = useState<Profile['sex']>(existing?.sex ?? 'male')
  const [heightCm, setHeightCm] = useState(existing?.heightCm ?? 170)
  const [weightKg, setWeightKg] = useState(existing?.weightKg ?? 70)
  const [activityDaysPerWeek, setActivityDaysPerWeek] = useState(existing?.activityDaysPerWeek ?? 3)
  const [goal, setGoal] = useState<Profile['goal']>(existing?.goal ?? 'maintain')
  const [saving, setSaving] = useState(false)

  const preview = calculateTargets({ age, sex, heightCm, weightKg, activityDaysPerWeek, goal })

  async function handleSave() {
    setSaving(true)
    const profile: Profile = {
      id: PROFILE_ID,
      age,
      sex,
      heightCm,
      weightKg,
      activityDaysPerWeek,
      goal,
      targets: calculateTargets({ age, sex, heightCm, weightKg, activityDaysPerWeek, goal }),
      updatedAt: new Date().toISOString(),
    }
    await db.profile.put(profile)
    setSaving(false)
    onSaved(profile)
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <h2 className="mb-1 text-sm font-semibold text-neutral-700">{existing ? 'Edit profile' : 'Set up your profile'}</h2>
      <p className="mb-3 text-xs text-neutral-400">Used to calculate your calorie, protein, and micronutrient targets.</p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className="text-xs text-neutral-500">
          Age
          <input
            type="number"
            value={age}
            onChange={(e) => setAge(Number(e.target.value))}
            className="mt-0.5 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs text-neutral-500">
          Sex
          <select
            value={sex}
            onChange={(e) => setSex(e.target.value as Profile['sex'])}
            className="mt-0.5 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          >
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </label>
        <label className="text-xs text-neutral-500">
          Height (cm)
          <input
            type="number"
            value={heightCm}
            onChange={(e) => setHeightCm(Number(e.target.value))}
            className="mt-0.5 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs text-neutral-500">
          Weight (kg)
          <input
            type="number"
            value={weightKg}
            onChange={(e) => setWeightKg(Number(e.target.value))}
            className="mt-0.5 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs text-neutral-500">
          Gym days/week
          <input
            type="number"
            min={0}
            max={7}
            value={activityDaysPerWeek}
            onChange={(e) => setActivityDaysPerWeek(Number(e.target.value))}
            className="mt-0.5 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs text-neutral-500">
          Goal
          <select
            value={goal}
            onChange={(e) => setGoal(e.target.value as Profile['goal'])}
            className="mt-0.5 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          >
            <option value="lose">Lose fat</option>
            <option value="maintain">Maintain</option>
            <option value="gain">Gain (lean)</option>
          </select>
        </label>
      </div>

      <div className="mt-3 rounded-md bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
        Target: <strong>{preview.kcal} kcal</strong>, <strong>{preview.protein}g protein</strong>, {preview.carbs}g carbs, {preview.fat}g fat
      </div>

      <div className="mt-3 flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save profile'}
        </button>
        {onCancel && (
          <button onClick={onCancel} className="rounded-md px-4 py-2 text-sm font-medium text-neutral-500">
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}
