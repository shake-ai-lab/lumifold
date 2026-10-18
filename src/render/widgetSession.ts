// Opt-in widget state, kept only for this app session. Never written to the deck.
const states = new Map<string, unknown>();
export function widgetSessionKey(deckPath: string | null, id: string, src: string): string {
  return JSON.stringify([deckPath, id, src]);
}
export function readWidgetSession(key: string): unknown { return states.get(key); }
export function saveWidgetSession(key: string, value: unknown): void {
  try {
    const json = JSON.stringify(value);
    if (!json || json.length > 131072) return;
    const safe: unknown = JSON.parse(json);
    states.delete(key);
    states.set(key, safe);
    if (states.size > 100) states.delete(states.keys().next().value!);
  } catch { /* malformed or oversized messages do not replace existing state */ }
}
