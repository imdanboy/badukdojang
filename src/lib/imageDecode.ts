/*
 * 이미지 파일 → 인식 파이프라인용 RawImage 디코딩 (브라우저).
 */
import type { RawImage } from '@kaya/board-recognition'

/** 파일/블롭을 canvas 로 디코딩해 RGBA ImageData 를 RawImage 로 감싼다. */
export async function decodeToRawImage(file: Blob): Promise<RawImage> {
  const bitmap = await createImageBitmap(file)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')
    if (ctx == null) throw new Error('canvas 2d context unavailable')
    ctx.drawImage(bitmap, 0, 0)
    const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
    return { data: imageData.data, width: bitmap.width, height: bitmap.height }
  } finally {
    bitmap.close()
  }
}
