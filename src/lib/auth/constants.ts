// Valores compartidos entre el middleware (Edge) y el servidor (Node).
export const SESSION_COOKIE = "tiendix_session";
export const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

// Rutas que se pueden abrir sin iniciar sesión
export const PUBLIC_PATHS = ["/login", "/api/health"];
