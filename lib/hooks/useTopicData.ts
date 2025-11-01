import { useCallback, useEffect, useMemo, useState } from "react";

export type TopicItem = { slug: string; label: string; category?: string | null };

export interface UseTopicDataOptions {
  fetchOptions?: RequestInit;
}

export interface UseTopicDataResult {
  data: TopicItem[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useTopicData(
  options?: UseTopicDataOptions
): UseTopicDataResult {
  const [data, setData] = useState<TopicItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshIndex, setRefreshIndex] = useState(0);

  const fetchOptions = useMemo(
    () => ({ cache: "no-store", ...(options?.fetchOptions ?? {}) }),
    [options?.fetchOptions]
  );

  const refetch = useCallback(() => {
    setRefreshIndex((index) => index + 1);
  }, []);

  useEffect(() => {
    let alive = true;

    setLoading(true);
    setError(null);

    (async () => {
      try {
        const response = await fetch("/api/topics", fetchOptions);
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.error || `HTTP ${response.status}`);
        }
        const items = Array.isArray(payload?.items) ? payload.items : [];
        if (alive) {
          setData(
            items.map((item: any) => ({
              slug: String(item?.slug ?? ""),
              label: String(item?.label ?? ""),
              category: item?.category ?? null,
            }))
          );
        }
      } catch (e) {
        if (alive) {
          setError((e as Error).message);
          setData([]);
        }
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, [fetchOptions, refreshIndex]);

  return { data, loading, error, refetch };
}
