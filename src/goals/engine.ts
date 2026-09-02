import type { NutrientTotals, Profile } from '../ai/schema'

type ProfileInput = Pick<Profile, 'sex' | 'weightKg' | 'heightCm' | 'age' | 'activityDaysPerWeek' | 'goal'>

// Mifflin-St Jeor.
export function calculateBMR({ sex, weightKg, heightCm, age }: ProfileInput): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age
  return sex === 'male' ? base + 5 : base - 161
}

function activityMultiplier(daysPerWeek: number): number {
  if (daysPerWeek <= 0) return 1.2 // sedentary
  if (daysPerWeek <= 2) return 1.375 // lightly active
  if (daysPerWeek <= 4) return 1.55 // moderately active
  if (daysPerWeek <= 6) return 1.725 // very active
  return 1.9 // extra active
}

export function calculateTDEE(profile: ProfileInput): number {
  return calculateBMR(profile) * activityMultiplier(profile.activityDaysPerWeek)
}

// +10%/-20% are conservative, evidence-backed rates for someone actively training —
// a lean surplus and a deficit moderate enough to preserve training performance,
// per CLAUDE.md's goal-engine spec, rather than an aggressive bulk/cut.
const CALORIE_ADJUSTMENT: Record<Profile['goal'], number> = { gain: 1.1, lose: 0.8, maintain: 1 }

// g/kg bodyweight, at the higher end of ranges supported for resistance-trained
// individuals (typical range ~1.6-2.2 g/kg); bumped further on a cut to preserve
// lean mass, which is standard practice under a deficit.
const PROTEIN_G_PER_KG: Record<Profile['goal'], number> = { gain: 2.0, lose: 2.2, maintain: 1.8 }

// ICMR-NIN 2020 RDA, reference Indian adult (20-39y). Source: the official NIN brief
// note (nin.res.in/rdabook/brief_note.pdf) plus the fuller nutrient table it summarizes
// (cross-checked between both — every value present in both sources matched exactly).
// Ceiling: this is the flat adult reference regardless of exact age; the full ICMR-NIN
// report has age-banded values for some nutrients (e.g. calcium needs shift after 50)
// that this app doesn't distinguish yet — revisit if that starts to matter.
const RDA_MALE: NutrientTotals = {
  calcium: 1000, phosphorus: 1000, magnesium: 440, sodium: 2000, potassium: 3510,
  iron: 19, zinc: 17, copper: 2, selenium: 40, iodine: 150,
  vitaminA: 1000, vitaminC: 80, vitaminD: 15, vitaminE: 10, vitaminK: 55,
  b1: 1.8, b2: 2.5, b3: 18, b6: 2.4, folate: 300, b12: 2.2,
}
const RDA_FEMALE: NutrientTotals = {
  calcium: 1000, phosphorus: 1000, magnesium: 370, sodium: 2000, potassium: 3510,
  iron: 29, zinc: 13, copper: 2, selenium: 40, iodine: 150,
  vitaminA: 840, vitaminC: 65, vitaminD: 15, vitaminE: 10, vitaminK: 55,
  b1: 1.7, b2: 2.4, b3: 14, b6: 1.9, folate: 220, b12: 2.2,
}

// Fat set to a moderate 25% of calories (common default for someone prioritizing
// training fuel); carbs take whatever's left after protein and fat.
const FAT_PERCENT_OF_CALORIES = 0.25

export function calculateTargets(profile: ProfileInput): NutrientTotals {
  const tdee = calculateTDEE(profile)
  const kcal = Math.round((tdee * CALORIE_ADJUSTMENT[profile.goal]) / 10) * 10
  const protein = Math.round(profile.weightKg * PROTEIN_G_PER_KG[profile.goal])
  const fat = Math.round((kcal * FAT_PERCENT_OF_CALORIES) / 9)
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4))

  return {
    ...(profile.sex === 'male' ? RDA_MALE : RDA_FEMALE),
    kcal,
    protein,
    fat,
    carbs,
    fiber: Math.round((30 * kcal) / 2000), // ICMR-NIN 2020: 30g fibre per 2000 kcal
    omega3: 2.2, // ICMR-NIN 2020: 2.2g ALA/day
    saturatedFat: Math.round((0.1 * kcal) / 9), // WHO/ICMR dietary guideline: <10% of energy
    transFat: Math.round((0.01 * kcal) / 9), // <1% of energy
    sugar: Math.round((0.1 * kcal) / 4), // free sugars <10% of energy
    cholesterol: 300, // standard general limit
  }
}
