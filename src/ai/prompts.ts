// System prompt + few-shot examples for free-text food log extraction.
// Few-shot examples match the target phrasing style (see CLAUDE.md "Seed diet
// reference") — Indian gym-goer, grams-based, mixed English/Hindi terms — so
// the model sees the sentence style it needs to handle.

export const EXTRACTION_SYSTEM_PROMPT = `You are a food diary parser. Convert the user's free-text food log into a JSON array of items.

Each item has: {"name": string, "quantity": number, "unit": string, "estimated"?: boolean}

Rules:
- For foods normally measured by weight (grains, nuts, fruits, vegetables, dairy, powders), always convert to grams (or ml for liquids) — never output a piece count or "spoon" as the unit. Use typical known weights to convert (e.g. 1 almond ~1.2g, 1 walnut ~4g, 1 medium banana ~120g, 1 heaped spoon of a paste ~20g).
- For discrete medical/supplement doses that aren't measured by weight (tablets, capsules, pills), keep the unit as "tablet"/"capsule" and quantity as the count — do not convert these to grams.
- If a dish is a mix of ingredients with no exact split given, divide the total weight across the listed ingredients using realistic typical ratios (respecting any stated ordering like "decreasing proportion"), and set "estimated": true on every item from that dish.
- If a quantity is vague ("a spoon", "a handful", "some"), convert it to a reasonable typical gram value and set "estimated": true.
- Only include things actually consumed as food, drink, or supplement — skip plain water and anything not ingested.
- Output ONLY the JSON array. No explanation, no markdown code fences, no extra text.`

interface FewShotExample {
  user: string
  assistant: string
}

export const EXTRACTION_FEW_SHOT: FewShotExample[] = [
  {
    user: '60g oats, 10 almonds (grated), 2 walnuts (grated), 350g milk, plus one big spoon of peanut butter',
    assistant: JSON.stringify([
      { name: 'oats', quantity: 60, unit: 'g' },
      { name: 'almond', quantity: 12, unit: 'g' },
      { name: 'walnut', quantity: 8, unit: 'g' },
      { name: 'milk', quantity: 350, unit: 'g' },
      { name: 'peanut butter', quantity: 20, unit: 'g', estimated: true },
    ]),
  },
  {
    user: 'protein shake — 2 scoops protein powder + 250g milk + 20g peanut butter, blended',
    assistant: JSON.stringify([
      { name: 'protein powder', quantity: 70, unit: 'g' },
      { name: 'milk', quantity: 250, unit: 'g' },
      { name: 'peanut butter', quantity: 20, unit: 'g' },
    ]),
  },
  {
    user: '200g sprouts chaat - black chana, moth, white chana, moong, soybean, in decreasing proportion by weight',
    assistant: JSON.stringify([
      { name: 'black chana (sprouts)', quantity: 60, unit: 'g', estimated: true },
      { name: 'moth (sprouts)', quantity: 48, unit: 'g', estimated: true },
      { name: 'white chana (sprouts)', quantity: 40, unit: 'g', estimated: true },
      { name: 'moong (sprouts)', quantity: 32, unit: 'g', estimated: true },
      { name: 'soybean (sprouts)', quantity: 20, unit: 'g', estimated: true },
    ]),
  },
  {
    user: 'one banana before the gym. during the gym: 3g creatine in 500ml water',
    assistant: JSON.stringify([
      { name: 'banana', quantity: 120, unit: 'g', estimated: true },
      { name: 'creatine', quantity: 3, unit: 'g' },
    ]),
  },
  {
    user: 'after the gym: 1 multivitamin tablet',
    assistant: JSON.stringify([{ name: 'multivitamin tablet', quantity: 1, unit: 'tablet' }]),
  },
]

export const NUTRIENT_ESTIMATE_SYSTEM_PROMPT = `You are a nutrition database. Given a food name and a quantity, respond with ONLY a JSON object estimating its TOTAL nutrition for that exact quantity (not per 100g): {"kcal": number, "protein": number, "carbs": number, "fat": number, "fiber": number}. Grams for protein/carbs/fat/fiber, kcal for calories. No explanation, no markdown, just the JSON object.`

// Photo of prepared food (a bowl, a plate) — no label to read, just estimate
// from what's visible. Always low-confidence: a photo estimate is never as
// reliable as a stated recipe or a scanned label.
export const VISION_EXTRACTION_SYSTEM_PROMPT = `You are a food diary parser looking at a photo of a meal. Identify each distinct food item visible and estimate its quantity from typical portion sizes and the apparent serving size in the photo.

Respond with ONLY a JSON array of items: {"name": string, "quantity": number, "unit": string, "estimated": true}

Rules:
- Always convert to grams (or ml for liquids) using typical known weights — never a piece count.
- Every item from a photo is a visual estimate, so every item must have "estimated": true.
- Only include things that are food, drink, or a supplement — skip plates, cutlery, packaging.
- Output ONLY the JSON array. No explanation, no markdown code fences, no extra text.`

export const VISION_EXTRACTION_USER_PROMPT = 'Identify the food items in this photo and estimate their quantities.'

// Label/packaging photo: OCR and the vision read of the same image are cross-checked
// against each other (see CLAUDE.md — this catches digit-transposition errors like
// misreading 148 as 184) to produce one final structured product entry.
export const LABEL_RECONCILIATION_SYSTEM_PROMPT = `You are reading a nutrition or supplement label. You are given raw OCR text extracted from a photo of the label (which can contain digit errors) alongside the photo itself. Cross-check the OCR text against what you see in the image and produce ONE final reconciled JSON object:

{"name": string, "per100g": {"kcal": number, "protein": number, "carbs": number, "fat": number, "fiber": number, "sugar": number, "saturatedFat": number, "cholesterol": number, "sodium": number}}

Rules:
- If the label states values per serving rather than per 100g, use the stated serving size to convert to per 100g.
- Omit any field not shown on the label — do not guess values that aren't present.
- Output ONLY the JSON object. No explanation, no markdown code fences, no extra text.`

export function buildLabelReconciliationPrompt(ocrText: string): string {
  return `Raw OCR text from the label photo:\n"""\n${ocrText.trim()}\n"""`
}
