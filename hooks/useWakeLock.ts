"use client";

import { useCallback, useEffect, useRef } from "react";

/** Keeps the display awake while the caller reports active microphone capture. */
export function useWakeLock(active: boolean): void {
  const activeRef = useRef(active);
  const sentinelRef = useRef<WakeLockSentinel | null>(null);
  const requestPendingRef = useRef(false);
  const requestGenerationRef = useRef(0);
  const requestWakeLockRef = useRef<(() => void) | null>(null);

  const releaseWakeLock = useCallback(() => {
    const sentinel = sentinelRef.current;
    sentinelRef.current = null;
    if (sentinel !== null && !sentinel.released) {
      void sentinel.release().catch(() => {});
    }
  }, []);

  const requestWakeLock = useCallback(() => {
    if (
      !activeRef.current ||
      typeof navigator === "undefined" ||
      typeof document === "undefined" ||
      document.visibilityState !== "visible" ||
      sentinelRef.current !== null ||
      requestPendingRef.current ||
      navigator.wakeLock === undefined
    ) {
      return;
    }

    const generation = requestGenerationRef.current;
    requestPendingRef.current = true;
    const pendingRequest = navigator.wakeLock
      .request("screen")
      .then((sentinel) => {
        if (
          generation !== requestGenerationRef.current ||
          !activeRef.current ||
          document.visibilityState !== "visible"
        ) {
          void sentinel.release().catch(() => {});
          return;
        }

        sentinelRef.current = sentinel;
        sentinel.addEventListener(
          "release",
          () => {
            if (sentinelRef.current === sentinel) {
              sentinelRef.current = null;
            }
          },
          { once: true },
        );
      })
      .catch(() => {})
      .finally(() => {
        requestPendingRef.current = false;
        if (
          generation !== requestGenerationRef.current &&
          activeRef.current &&
          typeof document !== "undefined" &&
          document.visibilityState === "visible"
        ) {
          queueMicrotask(() => requestWakeLockRef.current?.());
        }
      });

    void pendingRequest;
  }, []);

  useEffect(() => {
    requestWakeLockRef.current = requestWakeLock;
  }, [requestWakeLock]);

  useEffect(() => {
    activeRef.current = active;
    if (active) {
      requestWakeLock();
      return;
    }

    requestGenerationRef.current += 1;
    releaseWakeLock();
  }, [active, releaseWakeLock, requestWakeLock]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        requestGenerationRef.current += 1;
        releaseWakeLock();
      } else if (activeRef.current) {
        requestWakeLock();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      activeRef.current = false;
      requestGenerationRef.current += 1;
      releaseWakeLock();
    };
  }, [releaseWakeLock, requestWakeLock]);
}
