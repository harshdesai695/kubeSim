/**
 * KubeLogo — a stylized helm-wheel mark (Kubernetes-inspired, original art).
 * Renders in `currentColor` so it inherits the surrounding text color.
 */
export function KubeLogo({ className }: { className?: string }) {
  const spokes = [0, 45, 90, 135, 180, 225, 270, 315];
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Outer ring */}
      <circle
        cx="16"
        cy="16"
        r="12"
        stroke="currentColor"
        strokeWidth="1.7"
        opacity="0.9"
      />
      {/* Spokes + handle knobs */}
      {spokes.map((a) => (
        <g key={a} transform={`rotate(${a} 16 16)`}>
          <line
            x1="16"
            y1="12.4"
            x2="16"
            y2="5.6"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
          <circle cx="16" cy="3.6" r="1.8" fill="currentColor" />
        </g>
      ))}
      {/* Center hub */}
      <circle cx="16" cy="16" r="3.4" fill="currentColor" />
    </svg>
  );
}
