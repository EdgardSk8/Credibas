import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  itemLabel?: string;
}

export function Pagination({ page, totalPages, total, pageSize, onPageChange, itemLabel = 'registros' }: PaginationProps) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <div className="pagination">
      <span>
        Mostrando {from}–{to} de {total} {itemLabel}
      </span>
      <div className="pagination-controls">
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Página anterior"
        >
          <ChevronLeft size={14} />
          Anterior
        </button>
        <span className="numeric">
          {page} / {Math.max(1, totalPages)}
        </span>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="Página siguiente"
        >
          Siguiente
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
