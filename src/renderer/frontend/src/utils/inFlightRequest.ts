const inFlightRequests = new Map<string, Promise<unknown>>();

/** Share concurrent initialization reads (for example React StrictMode replays). */
export function shareInFlightRequest<T>(key: string, request: () => Promise<T>): Promise<T> {
  const current = inFlightRequests.get(key);
  if (current) return current as Promise<T>;

  const pending = Promise.resolve().then(request);
  inFlightRequests.set(key, pending);
  void pending.finally(() => {
    if (inFlightRequests.get(key) === pending) inFlightRequests.delete(key);
  }).catch(() => undefined);
  return pending;
}
