const MODEL_ID = 'onnx-community/gemma-4-E2B-it-ONNX'

export function isGpuAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator
}

export interface LoadProgress {
  loadedBytes: number
  totalBytes: number
}

type Role = 'system' | 'user' | 'assistant'
export interface ChatMessage {
  role: Role
  text: string
}

let processor: any
let model: any
let loadingPromise: Promise<void> | undefined

// Loads once, lazily, and caches in the browser's Cache Storage (handled
// internally by transformers.js) so every subsequent call is instant/offline.
export async function loadModel(onProgress?: (p: LoadProgress) => void): Promise<void> {
  if (model && processor) return
  if (loadingPromise) return loadingPromise

  const fileBytes = new Map<string, { loaded: number; total: number }>()
  const reportProgress = (data: { file?: string; loaded?: number; total?: number }) => {
    if (!onProgress || !data.file || data.total == null) return
    fileBytes.set(data.file, { loaded: data.loaded ?? 0, total: data.total })
    let loadedBytes = 0
    let totalBytes = 0
    for (const entry of fileBytes.values()) {
      loadedBytes += entry.loaded
      totalBytes += entry.total
    }
    onProgress({ loadedBytes, totalBytes })
  }

  loadingPromise = (async () => {
    // Dynamic import: keeps @huggingface/transformers (and its multi-MB WASM
    // runtime) out of the initial page bundle — fetched only on first use.
    const { AutoProcessor, Gemma4ForConditionalGeneration } = await import('@huggingface/transformers')
    processor = await AutoProcessor.from_pretrained(MODEL_ID)
    model = await Gemma4ForConditionalGeneration.from_pretrained(MODEL_ID, {
      dtype: 'q4f16',
      device: 'webgpu',
      progress_callback: (info: { status: string; file?: string; loaded?: number; total?: number }) => {
        if (info.status === 'progress') reportProgress(info)
      },
    })
  })()

  try {
    await loadingPromise
  } catch (err) {
    loadingPromise = undefined
    throw err
  }
}

export function isModelLoaded(): boolean {
  return !!(model && processor)
}

async function generate(prompt: string, image: unknown): Promise<string> {
  const inputs = await processor(prompt, image ?? null, null, { add_special_tokens: false })

  const promptLength = inputs.input_ids.dims.at(-1)
  const outputs = await model.generate({
    ...inputs,
    max_new_tokens: 1024,
    do_sample: false,
  })

  const decoded = processor.batch_decode(outputs.slice(null, [promptLength, null]), {
    skip_special_tokens: true,
  })
  return decoded[0] as string
}

// Runs one chat turn against the loaded model and returns the raw generated text.
export async function chatComplete(messages: ChatMessage[]): Promise<string> {
  if (!isModelLoaded()) throw new Error('Model not loaded — call loadModel() first')

  const chatMessages = messages.map((m) => ({ role: m.role, content: [{ type: 'text', text: m.text }] }))
  const prompt = processor.apply_chat_template(chatMessages, {
    enable_thinking: false,
    add_generation_prompt: true,
  })
  return generate(prompt, null)
}

// Single-turn image+text prompt (food photos, label reads) — no few-shot history,
// since we don't have real example photos to prime it with.
export async function visionComplete(systemPrompt: string, userText: string, canvas: HTMLCanvasElement): Promise<string> {
  if (!isModelLoaded()) throw new Error('Model not loaded — call loadModel() first')

  // Dynamic import mirrors loadModel() — keeps the library out of the initial bundle.
  const { RawImage } = await import('@huggingface/transformers')
  const image = RawImage.fromCanvas(canvas)

  const chatMessages = [
    { role: 'system', content: [{ type: 'text', text: systemPrompt }] },
    // Modality order: image before text, per Gemma 4's documented best practice.
    { role: 'user', content: [{ type: 'image' }, { type: 'text', text: userText }] },
  ]
  const prompt = processor.apply_chat_template(chatMessages, {
    enable_thinking: false,
    add_generation_prompt: true,
  })
  return generate(prompt, image)
}
