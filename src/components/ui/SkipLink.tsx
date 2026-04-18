/**
 * Skip to main content link — first focusable element.
 * Visually hidden until focused (Tab from address bar).
 */
export function SkipLink({ targetId = 'main-content' }: { targetId?: string }) {
  return (
    <a
      href={`#${targetId}`}
      className="skip-link focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring-focus)]"
    >
      본문으로 건너뛰기
    </a>
  )
}
