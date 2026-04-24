/**
 * Fetch wrapper with timeout (Playbook Section 4 — Circuit Breakers)
 *
 * Every external API call must use this instead of bare fetch().
 * If the remote service hangs, this cuts it off after timeoutMs
 * so one slow API can't freeze the entire server.
 */

const DEFAULT_TIMEOUT_MS = 30000; // 30 seconds

export async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`Request to ${new URL(url).hostname} timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
