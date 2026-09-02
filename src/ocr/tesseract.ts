let worker: any

// Tesseract.js runs its recognition in a Web Worker internally — createWorker()
// spins that up. Only for label/packaging photos (see CLAUDE.md); a photo of
// prepared food has no text worth extracting.
export async function recognizeLabelText(canvas: HTMLCanvasElement): Promise<string> {
  if (!worker) {
    const { createWorker } = await import('tesseract.js')
    worker = await createWorker('eng')
  }
  const {
    data: { text },
  } = await worker.recognize(canvas)
  return text
}
