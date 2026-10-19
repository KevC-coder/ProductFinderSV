export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`La búsqueda tardó demasiado (más de ${Math.round(ms / 60_000)} min) y se canceló`);
  }
}

/**
 * Rechaza con TimeoutError si la promesa no termina en `ms` y llama a onTimeout (p. ej. para
 * cerrar el navegador y liberar lo que estuviera esperando).
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout?: () => void): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      onTimeout?.();
      reject(new TimeoutError(ms));
    }, ms);
  });
  // Si vence, la promesa original puede rechazar después: se ignora para no dejar un rechazo sin manejar.
  promise.catch(() => {});
  return Promise.race([promise, expired]).finally(() => clearTimeout(timer));
}
