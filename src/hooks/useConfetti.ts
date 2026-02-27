import { useCallback } from 'react'

export function useConfetti() {
  const fire = useCallback(() => {
    // Lightweight confetti effect using CSS animations
    const container = document.createElement('div')
    container.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999;overflow:hidden'
    document.body.appendChild(container)

    const colors = ['#2EFFB4', '#3B82F6', '#F59E0B', '#EC4899', '#8B5CF6', '#10B981']
    const particles: HTMLDivElement[] = []

    for (let i = 0; i < 40; i++) {
      const particle = document.createElement('div')
      const color = colors[Math.floor(Math.random() * colors.length)]
      const x = Math.random() * 100
      const delay = Math.random() * 0.5
      const size = Math.random() * 6 + 4

      particle.style.cssText = `
        position:absolute;
        left:${x}%;
        top:-10px;
        width:${size}px;
        height:${size}px;
        background:${color};
        border-radius:${Math.random() > 0.5 ? '50%' : '2px'};
        animation:confetti-fall 1.5s ease-in ${delay}s forwards;
      `
      container.appendChild(particle)
      particles.push(particle)
    }

    // Add keyframe animation if not already present
    if (!document.getElementById('confetti-style')) {
      const style = document.createElement('style')
      style.id = 'confetti-style'
      style.textContent = `
        @keyframes confetti-fall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
      `
      document.head.appendChild(style)
    }

    setTimeout(() => {
      container.remove()
    }, 2500)
  }, [])

  return { fire }
}
