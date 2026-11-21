interface LogoProps {
  size?: number;
  showWordmark?: boolean;
  wordmarkSize?: number;
  className?: string;
}

/**
 * Monograma oficial de Credibas, derivado de LOGO.png.
 * Se usa la versión con fondo transparente para que funcione sobre
 * superficies oscuras y sobre el fondo claro del modo oro.
 */
export function LogoMark({ size = 28, title = 'Credibas' }: { size?: number; title?: string }) {
  return (
    <img
      src="/brand/logo-mark.png"
      alt={title}
      width={Math.round(size * 1.62)}
      height={size}
      style={{ height: size, width: 'auto', display: 'block' }}
      decoding="async"
    />
  );
}

export function Logo({ size = 26, showWordmark = true, wordmarkSize = 20, className = '' }: LogoProps) {
  return (
    <span className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
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
          credibas<span style={{ color: 'var(--accent-ink)' }}>.</span>
        </span>
      )}
    </span>
  );
}
