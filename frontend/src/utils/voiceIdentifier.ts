// 音量检测工具
// 用 RMS（均方根）代替 max，避免瞬时噪音（键盘/风扇）误判为活跃
export function isAudioActive(frameBuffer: ArrayBuffer, threshold = 0.01): boolean {
  const arr = new Int16Array(frameBuffer)
  let sum = 0
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i] / 32768
    sum += v * v
  }
  const rms = Math.sqrt(sum / arr.length)
  return rms > threshold
}