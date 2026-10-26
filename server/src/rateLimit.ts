// Limite di tentativi per IP (in memoria): basta per un singolo server. Con più istanze dietro un bilanciatore
// conviene un limite anche sul proxy (es. nginx limit_req).
export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(private readonly max: number, private readonly windowMs: number) {}

  /** Registra un tentativo; false se il limite è superato. */
  hit(key: string, now = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 10_000) for (const [k, v] of this.hits) if (now - v[v.length - 1] >= this.windowMs) this.hits.delete(k);
    return recent.length <= this.max;
  }
}
