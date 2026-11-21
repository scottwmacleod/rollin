const QUEUED_METHODS =
  "capture captureException register identify reset opt_in_capturing opt_out_capturing onFeatureFlags".split(
    " ",
  );
const CACHE = "sm_ph_flags";

let started = false;
const ph = () => (started ? window.posthog : undefined);
let values = {};
let listeners = [];
const seen = new Set();

const store = (fn) => {
  try {
    return fn(window.localStorage);
  } catch {
    return undefined;
  }
};

export function optedOut(nav = globalThis.navigator, win = globalThis.window) {
  return nav?.globalPrivacyControl === true || nav?.doNotTrack === "1" || win?.doNotTrack === "1";
}

function setValues(next) {
  values = next;
  store((s) => s.setItem(CACHE, JSON.stringify(next)));
  for (const cb of listeners) cb(values);
}

function distinctId(token) {
  const saved = store((s) => JSON.parse(s.getItem(`ph_${token}_posthog`) || "{}").distinct_id);
  return (
    saved ||
    crypto.randomUUID?.() ||
    [...crypto.getRandomValues(new Uint8Array(16))]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

export function readFlags(json) {
  const out = {};
  for (const [key, f] of Object.entries(json?.flags ?? {}))
    out[key] = f.enabled ? (f.variant ?? true) : false;
  return out;
}

export function startPostHog({
  token,
  product,
  host = "/_sm",
  flags = false,
  options = {},
  idleMs = 3000,
}) {
  if (started || typeof window === "undefined" || optedOut()) return;
  started = true;

  const q = (window.posthog = []);
  for (const m of QUEUED_METHODS) q[m] = (...args) => q.push([m, ...args]);

  const id = distinctId(token);
  values = store((s) => JSON.parse(s.getItem(CACHE) || "{}")) ?? {};

  let early = Promise.resolve();
  if (flags) {
    early = fetch(`${host}/flags/?v=2`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, distinct_id: id }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((json) => setValues(readFlags(json)))
      .catch(() => {});
  }

  q._i = [];
  q.__SV = 1;
  q.register({ product });
  q.onFeatureFlags((_keys, all) => all && setValues(all));

  const queueError = (error) => window.posthog === q && q.captureException(error);
  addEventListener("error", (e) => queueError(e.error));
  addEventListener("unhandledrejection", (e) => queueError(e.reason));

  let loaded = false;
  const load = () => {
    if (loaded) return;
    loaded = true;
    for (const e of ["pointerdown", "keydown"]) removeEventListener(e, load, true);
    early.then(() => {
      q._i.push([
        token,
        {
          api_host: host,
          ui_host: "https://us.posthog.com",
          persistence: "localStorage",
          person_profiles: "identified_only",
          capture_pageview: "history_change",
          session_recording: { maskAllInputs: true },
          capture_exceptions: true,
          capture_performance: { web_vitals: true },
          bootstrap: { distinctID: id, featureFlags: values },
          ...options,
        },
        "posthog",
      ]);
      const s = document.createElement("script");
      s.async = true;
      s.crossOrigin = "anonymous";
      s.src = `${host}/static/array.js`;
      document.head.append(s);
    });
  };

  for (const e of ["pointerdown", "keydown"])
    addEventListener(e, load, { capture: true, once: true, passive: true });
  const idle = () =>
    window.requestIdleCallback
      ? requestIdleCallback(load, { timeout: idleMs })
      : setTimeout(load, 1);
  if (document.readyState === "complete") idle();
  else addEventListener("load", idle, { once: true });
}

export function flag(key) {
  const value = values[key];
  if (started && value !== undefined && !seen.has(key)) {
    seen.add(key);
    ph().capture("$feature_flag_called", { $feature_flag: key, $feature_flag_response: value });
  }
  return value;
}

export function onFlags(cb) {
  listeners.push(cb);
  return () => {
    listeners = listeners.filter((l) => l !== cb);
  };
}

export function captureException(error, properties) {
  ph()?.captureException(error, properties);
}

export function capture(event, properties) {
  ph()?.capture(event, properties);
}
