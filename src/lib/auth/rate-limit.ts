// Límite simple de intentos de login fallidos, en memoria del servidor.
// Suficiente para una sola instancia; si algún día se corre en varios
// servidores habría que moverlo a la base de datos o a Redis.
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutos

const attempts = new Map<string, { count: number; firstAt: number }>();

export function isBlocked(key: string): boolean {
  const entry = attempts.get(key);
  if (!entry) return false;
  if (Date.now() - entry.firstAt > WINDOW_MS) {
    attempts.delete(key);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

export function registerFailure(key: string) {
  const entry = attempts.get(key);
  if (!entry || Date.now() - entry.firstAt > WINDOW_MS) {
    attempts.set(key, { count: 1, firstAt: Date.now() });
  } else {
    entry.count++;
  }
}

export function clearFailures(key: string) {
  attempts.delete(key);
}
