// Client-side downscale before any parsing — keeps vision-encoding fast and
// means we never hold a multi-MB phone photo in memory longer than needed.
// The raw file itself is never persisted (see CLAUDE.md: no long-term photo storage).
export async function downscaleImage(file: File, maxDim = 1600): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get 2D canvas context')
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  return canvas
}
