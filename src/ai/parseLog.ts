import type { ExtractedItem, ParsedItem } from './schema'
import { parseExtractedItems, parseLabelResult, parseNutrientEstimate } from './schema'
import { chatComplete, visionComplete, type ChatMessage } from './model'
import {
  buildLabelReconciliationPrompt,
  EXTRACTION_FEW_SHOT,
  EXTRACTION_SYSTEM_PROMPT,
  LABEL_RECONCILIATION_SYSTEM_PROMPT,
  NUTRIENT_ESTIMATE_SYSTEM_PROMPT,
  VISION_EXTRACTION_SYSTEM_PROMPT,
  VISION_EXTRACTION_USER_PROMPT,
} from './prompts'
import { recognizeLabelText } from '../ocr/tesseract'
import { resolveFood, scaleNutrients } from '../nutrition/resolve'

async function estimateNutrients(name: string, quantity: number, unit: string) {
  const raw = await chatComplete([
    { role: 'system', text: NUTRIENT_ESTIMATE_SYSTEM_PROMPT },
    { role: 'user', text: `${quantity}${unit} of ${name}` },
  ])
  return parseNutrientEstimate(raw)
}

// Nutrient resolution (KnownProduct/IFCT, falling back to the model's own estimate
// for anything not in either) — shared by the text and photo extraction paths.
async function resolveExtractedItems(extracted: ExtractedItem[]): Promise<ParsedItem[]> {
  // Resolution against KnownProduct/IFCT is cheap (IndexedDB + array scan) and safe
  // to run concurrently. The nutrient-estimate fallback calls the same loaded model
  // again, though, and a single WebGPU inference session can't safely run multiple
  // overlapping generate() calls — those are run one at a time below instead.
  const resolutions = await Promise.all(extracted.map((item) => resolveFood(item.name)))

  const results: ParsedItem[] = []
  for (let i = 0; i < extracted.length; i++) {
    const item = extracted[i]
    const resolved = resolutions[i]
    if (resolved) {
      results.push({
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        source: resolved.source,
        confidence: item.estimated ? 'low' : 'high',
        nutrients: scaleNutrients(resolved.per100g, item.quantity, item.unit),
      })
      continue
    }

    const nutrients = await estimateNutrients(item.name, item.quantity, item.unit)
    results.push({
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      source: 'estimated',
      confidence: 'low',
      nutrients,
    })
  }
  return results
}

// Free text -> model extraction -> nutrient resolution -> ParsedItem[].
export async function parseFoodLog(text: string): Promise<ParsedItem[]> {
  const messages: ChatMessage[] = [{ role: 'system', text: EXTRACTION_SYSTEM_PROMPT }]
  for (const example of EXTRACTION_FEW_SHOT) {
    messages.push({ role: 'user', text: example.user })
    messages.push({ role: 'assistant', text: example.assistant })
  }
  messages.push({ role: 'user', text })

  const raw = await chatComplete(messages)
  return resolveExtractedItems(parseExtractedItems(raw))
}

// Photo of prepared food -> vision extraction -> nutrient resolution -> ParsedItem[].
// Every item comes back low-confidence: a photo estimate of portion size is never
// as reliable as a stated recipe or a scanned label.
export async function parseFoodPhoto(canvas: HTMLCanvasElement): Promise<ParsedItem[]> {
  const raw = await visionComplete(VISION_EXTRACTION_SYSTEM_PROMPT, VISION_EXTRACTION_USER_PROMPT, canvas)
  return resolveExtractedItems(parseExtractedItems(raw))
}

// Label/packaging photo -> OCR + vision read, cross-checked in one reconciliation
// call -> a KnownProduct-shaped {name, per100g} the caller can save and/or log.
export async function parseLabelPhoto(canvas: HTMLCanvasElement) {
  const ocrText = await recognizeLabelText(canvas)
  const raw = await visionComplete(LABEL_RECONCILIATION_SYSTEM_PROMPT, buildLabelReconciliationPrompt(ocrText), canvas)
  return parseLabelResult(raw)
}
