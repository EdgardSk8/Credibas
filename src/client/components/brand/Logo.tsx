interface LogoProps {
  size?: number;
  showWordmark?: boolean;
  wordmarkSize?: number;
  className?: string;
}

export function LogoMark({ size = 28, title = 'Credibas' }: { size?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label={title} focusable="false">
      <path
        d="M31.04 12.85A15 15 0 1 0 31.04 35.15"
        fill="none"
        stroke="currentColor"
        strokeWidth="6.5"
        strokeLinecap="butt"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M29 12.85H33.2C36.4 12.85 38.6 15.05 38.6 18.25C38.6 20.35 37.4 21.95 35.6 22.85C38.2 23.65 39.8 25.65 39.8 28.15C39.8 31.35 37.4 33.85 33.8 33.85H29V12.85ZM32.4 16.45V19.85H33.2C34.6 19.85 35.4 19.05 35.4 17.85C35.4 16.65 34.6 16.45 33.2 16.45H32.4ZM32.4 24.85V29.9H33.8C35.4 29.9 36.4 28.9 36.4 27.3C36.4 25.7 35.4 24.85 33.8 24.85H32.4Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function Logo({ size = 28, showWordmark = true, wordmarkSize = 20, className = '' }: LogoProps) {
  return (
    <span
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: 'var(--accent)' }}
    >
      <LogoMark size={size} />
      {showWordmark && (
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: wordmarkSize,
            fontWeight: 650,
            letterSpacing: '-0.03em',
            color: 'var(--text)',
            lineHeight: 1,
          }}
        >
          credibas<span style={{ color: 'var(--accent)' }}>.</span>
        </span>
      )}
    </span>
  );
}
