/**
 * AGRI-SWAP Centralized API Configuration
 * 
 * Production:
 *   - Configure VITE_API_BASE_URL in your hosting provider (e.g. "https://api.agriswap.com")
 *   - Trailing slashes are automatically sanitized.
 * 
 * Local Development:
 *   - If VITE_API_BASE_URL is omitted or empty, defaults to "" (relative path)
 *   - In development (Vite dev server), relative requests (/api/...) are proxied to http://127.0.0.1:5000
 */

const rawBaseUrl = import.meta.env.VITE_API_BASE_URL;

export const API_BASE_URL = (typeof rawBaseUrl === "string" && rawBaseUrl.trim() !== "")
  ? rawBaseUrl.trim().replace(/\/+$/, "")
  : "";

/**
 * Builds a full API endpoint URL for single-target fetches (e.g. App.jsx).
 *
 * @param {string} pathWithQuery - Relative API path, e.g. "/api/images"
 * @returns {string} Fully resolved API URL
 */
export function buildApiUrl(pathWithQuery) {
  const cleanPath = pathWithQuery.startsWith("/") ? pathWithQuery : `/${pathWithQuery}`;
  if (API_BASE_URL) {
    return `${API_BASE_URL}${cleanPath}`;
  }
  return cleanPath;
}

/**
 * Returns ordered candidate endpoints for resilient multi-target fetching:
 * 1. If VITE_API_BASE_URL is set, returns solely the configured public endpoint.
 * 2. In local development with no base URL, prioritizes relative path (Vite proxy)
 *    with local loopback fallbacks for standalone node testing.
 * 3. In production with no base URL, uses relative path only (e.g. reverse-proxied /api).
 *    Never attempts localhost or 127.0.0.1 on client devices.
 *
 * @param {string} pathWithQuery - Relative API path, e.g. "/api/prices"
 * @returns {Array<string>} Ordered list of candidate URLs
 */
export function getApiEndpoints(pathWithQuery) {
  const cleanPath = pathWithQuery.startsWith("/") ? pathWithQuery : `/${pathWithQuery}`;

  if (API_BASE_URL) {
    return [`${API_BASE_URL}${cleanPath}`];
  }

  // Development with Vite proxy
  if (import.meta.env.DEV) {
    return [
      cleanPath,
      `http://127.0.0.1:5000${cleanPath}`,
      `http://localhost:5000${cleanPath}`
    ];
  }

  // Production without explicit base URL: relative path for reverse proxy
  return [cleanPath];
}
