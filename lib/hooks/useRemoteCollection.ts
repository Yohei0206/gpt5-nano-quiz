import { DependencyList, useEffect, useState } from "react";

export interface RemoteCollectionOptions<T> {
  url: string;
  mapItem: (raw: unknown) => T | null;
  dependencies?: DependencyList;
  extractItems?: (payload: unknown) => unknown[];
}

export interface RemoteCollectionState<T> {
  items: T[];
  loading: boolean;
  error: string | null;
}

function defaultExtractItems(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (payload && typeof payload === "object" && Array.isArray((payload as any).items)) {
    return (payload as any).items;
  }
  return [];
}

export function useRemoteCollection<T>({
  url,
  mapItem,
  dependencies = [],
  extractItems = defaultExtractItems,
}: RemoteCollectionOptions<T>): RemoteCollectionState<T> {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(url, { cache: "no-store" });
        const payload = (await response.json()) as unknown;
        if (!response.ok) {
          const message = (payload as any)?.error || `HTTP ${response.status}`;
          throw new Error(message);
        }
        const mapped = extractItems(payload)
          .map((raw) => mapItem(raw))
          .filter((value): value is T => value !== null);
        if (active) {
          setItems(mapped);
        }
      } catch (err) {
        if (active) {
          setError((err as Error).message);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [url, mapItem, extractItems, ...dependencies]);

  return { items, loading, error };
}
