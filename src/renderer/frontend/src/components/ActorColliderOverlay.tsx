/** Shared collision appearance in the scene and sprite editors. */
export default function ActorColliderOverlay({ left, top, width, height, testId }: { left: number; top: number; width: number; height: number; testId?: string }) {
  return <span data-testid={testId} style={{ position: 'absolute', left, top, width, height, pointerEvents: 'none', zIndex: 6 }}>
    <svg aria-hidden="true" width="100%" height="100%" style={{ display: 'block', overflow: 'visible', imageRendering: 'auto' }}>
      <rect x={0} y={0} width={width} height={height} fill="rgba(255,77,79,.18)" stroke="#ff4d4f" strokeWidth={0.5} strokeDasharray="3 2" vectorEffect="non-scaling-stroke" />
    </svg>
  </span>;
}
