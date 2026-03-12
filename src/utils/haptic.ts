export function haptic(type: 'light' | 'medium' | 'heavy' = 'light') {
  if (!navigator.vibrate) return
  const patterns: Record<string, number | number[]> = {
    light: 10,
    medium: 20,
    heavy: [20, 30, 20],
  }
  navigator.vibrate(patterns[type])
}
