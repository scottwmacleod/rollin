import { useEffect, useState } from "react";

const CHECK_EVERY_MS = 60 * 60 * 1000;

export function useUpdate(): { available: boolean; reload: () => void } {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    let cancelled = false;

    function watch(registration: ServiceWorkerRegistration) {
      if (registration.waiting && navigator.serviceWorker.controller) {
        setWaiting(registration.waiting);
      }
      registration.addEventListener("updatefound", () => {
        const installing = registration.installing;
        installing?.addEventListener("statechange", () => {
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            setWaiting(installing);
          }
        });
      });
      timer = setInterval(() => void registration.update().catch(() => {}), CHECK_EVERY_MS);
    }

    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        if (!cancelled) watch(registration);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return {
    available: waiting !== null,
    reload() {
      if (!waiting) return;
      navigator.serviceWorker.addEventListener("controllerchange", () => location.reload(), {
        once: true,
      });
      waiting.postMessage({ type: "SKIP_WAITING" });
    },
  };
}
