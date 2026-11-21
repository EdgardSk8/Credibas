import type { CSSProperties, ReactNode } from 'react';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  dot?: boolean;
  className?: string;
  style?: CSSProperties;
}

const toneClass: Record<BadgeTone, string> = {
  neutral: 'badge-neutral',
  accent: 'badge-accent',
  success: 'badge-success',
  warning: 'badge-warning',
  danger: 'badge-danger',
};

export function Badge({ children, tone = 'neutral', dot = false, className = '', style }: BadgeProps) {
  return (
    <span className={`badge ${toneClass[tone]} ${className}`.trim()} style={style}>
      {dot && <span className="dot" />}
      {children}
    </span>
  );
}

interface StatusBadgeProps {
  map: Record<string, { label: string; tone: BadgeTone }>;
  value: string;
}

export function StatusBadge({ map, value }: StatusBadgeProps) {
  const entry = map[value] ?? { label: value, tone: 'neutral' as BadgeTone };
  return (
    <Badge tone={entry.tone} dot>
      {entry.label}
    </Badge>
  );
}
