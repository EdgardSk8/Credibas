import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  eyebrow?: ReactNode;
  icon?: ReactNode;
}

export function PageHeader({ title, description, actions, eyebrow, icon }: PageHeaderProps) {
  return (
    <div className="page-header">
      <div style={{ minWidth: 0 }}>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <div className="page-heading">
          {icon && <span className="page-icon">{icon}</span>}
          <div style={{ minWidth: 0 }}>
            <h1>{title}</h1>
            {description && <p>{description}</p>}
          </div>
        </div>
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}
