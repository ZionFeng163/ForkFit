"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Writes happen on user actions, never before hydration can restore a saved value.
export function useStoredState<T>(key: string | null, initial: T, decode: (value: unknown) => T) {
  const [value, setValue] = useState(initial);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const current = useRef(initial);
  const defaults = useRef(initial);
  const decoder = useRef(decode);
  useEffect(() => {
    if (!key) return;
    let restored = defaults.current;
    try {
      const raw = localStorage.getItem(key);
      if (raw) restored = decoder.current(JSON.parse(raw));
    } catch { /* Unavailable storage must not prevent editing. */ }
    current.current = restored;
    setValue(restored);
    setLoadedKey(key);
  }, [key]);
  const update = useCallback((next: T | ((previous: T) => T)) => {
    const result = typeof next === "function" ? (next as (previous: T) => T)(current.current) : next;
    current.current = result;
    setValue(result);
    if (key) {
      try { localStorage.setItem(key, JSON.stringify(result)); } catch { /* Keep the in-memory draft. */ }
    }
  }, [key]);
  return [value, update, Boolean(key && loadedKey === key)] as const;
}
