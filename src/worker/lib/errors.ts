export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: string, status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown): AppError {
    return new AppError('bad_request', 400, message, details);
  }

  static unauthorized(message = 'Debes iniciar sesión'): AppError {
    return new AppError('unauthorized', 401, message);
  }

  static forbidden(message = 'No tienes permisos para esta acción'): AppError {
    return new AppError('forbidden', 403, message);
  }

  static notFound(message = 'No encontramos lo que buscabas'): AppError {
    return new AppError('not_found', 404, message);
  }

  static conflict(message: string, details?: unknown): AppError {
    return new AppError('conflict', 409, message, details);
  }

  static tooMany(message = 'Demasiados intentos. Espera un momento.'): AppError {
    return new AppError('rate_limited', 429, message);
  }

  static limitExceeded(message: string, details?: unknown): AppError {
    return new AppError('plan_limit_reached', 402, message, details);
  }

  static internal(message = 'Ocurrió un error inesperado'): AppError {
    return new AppError('internal_error', 500, message);
  }
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof Error) {
    return new AppError('internal_error', 500, 'Ocurrió un error inesperado. Intenta de nuevo.');
  }
  return AppError.internal();
}
