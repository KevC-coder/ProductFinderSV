/**
 * Cola serial: el perfil del navegador solo admite un proceso a la vez, y además ejecutar
 * búsquedas en paralelo se vería como un bot. Todo lo que use el navegador pasa por aquí.
 */
export class BrowserQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private readonly pending: string[] = [];
  private active: string | null = null;

  run<T>(label: string, job: () => Promise<T>): Promise<T> {
    this.pending.push(label);
    const result = this.tail.then(async () => {
      this.pending.shift();
      this.active = label;
      try {
        return await job();
      } finally {
        this.active = null;
      }
    });
    this.tail = result.catch(() => {});
    return result;
  }

  /** true si ese trabajo ya está corriendo o en espera (evita encolar dos veces la misma búsqueda). */
  has(label: string): boolean {
    return this.active === label || this.pending.includes(label);
  }

  status(): { active: string | null; pending: string[] } {
    return { active: this.active, pending: [...this.pending] };
  }
}
