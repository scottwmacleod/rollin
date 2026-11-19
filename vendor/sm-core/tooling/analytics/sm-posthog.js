// PostHog for the sm_ suite, without putting PostHog in the bundle.
//
//   import { startPostHog, flag, onFlags, capture } from "./vendor/sm-core/tooling/analytics/sm-posthog.js";
//   startPostHog({ token: "phc_…", product: "rollin" });
//
// The page carries only this file. PostHog's own script (about 120 kB gzipped)
// loads from `${host}/static/array.js` once the page is idle, or on the first
// tap or key press, through the product's Vercel rewrites. Calls made before
// then are queued, as PostHog's HTML snippet does.
//
// A page running an experiment passes `flags: true`: the visitor's variants are
// fetched from `/flags` straight away, cached, and handed to PostHog as
// bootstrap values, so the page never flickers between variants.
//
// PostHog also records errors and Core Web Vitals. Errors thrown before it
// loads are queued, and `captureException` reports caught ones (an error
// boundary's, say). Its error and web vitals code (about 6 kB and 4 kB
// gzipped) loads from the same host, never from the bundle.
//
// Nothing loads, and every export is a safe no-op, outside a browser or when
// the visitor sends Global Privacy Control or Do Not Track.

// Calls the queue accepts before PostHog loads. After that, use window.posthog.
const METHODS =
  "capture captureException register identify reset opt_in_capturing opt_out_capturing onFeatureFlags".split(
    " ",
  );
const CACHE = "sm_ph_flags";

let started = false;
// The queue until PostHog loads, then PostHog itself, which replaces it.
const ph = () => (started ? window.posthog : undefined);
let values = {}; // flag key -> variant string or boolean
let listeners = [];
const seen = new Set();

const store = (fn) => {
  try {
    return fn(window.localStorage);
  } catch {
    return undefined; // private mode or blocked storage
  }
};

/** True when the visitor asked not to be tracked. */
export function optedOut(nav = globalThis.navigator, win = globalThis.window) {
  return nav?.globalPrivacyControl === true || nav?.doNotTrack === "1" || win?.doNotTrack === "1";
}

function setValues(next) {
  values = next;
  store((s) => s.setItem(CACHE, JSON.stringify(next)));
  for (const cb of listeners) cb(values);
}

// PostHog's id if it already has one for this visitor, else a new one.
function distinctId(token) {
  const saved = store((s) => JSON.parse(s.getItem(`ph_${token}_posthog`) || "{}").distinct_id);
  // randomUUID needs a secure context; plain-http previews fall back.
  return (
    saved ||
    crypto.randomUUID?.() ||
    [...crypto.getRandomValues(new Uint8Array(16))]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

// The /flags v2 answer: { flags: { key: { enabled, variant } } }.
export function readFlags(json) {
  const out = {};
  for (const [key, f] of Object.entries(json?.flags ?? {}))
    out[key] = f.enabled ? (f.variant ?? true) : false;
  return out;
}

/**
 * Starts PostHog on this page. Call once, as early as you like: it costs one
 * small request at most until the page is idle.
 */
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
  for (const m of METHODS) q[m] = (...args) => q.push([m, ...args]);

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
      .catch(() => {}); // keep the cached values
  }

  q._i = [];
  q.__SV = 1;
  q.register({ product });
  q.onFeatureFlags((_keys, all) => all && setValues(all));

  // PostHog catches errors once it has loaded; until then, queue them.
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

/**
 * The visitor's variant for a flag: a variant name, true or false, or
 * undefined before PostHog has answered (treat that as control). Records the
 * exposure once per flag per page, so experiment results count it.
 */
export function flag(key) {
  const value = values[key];
  if (started && value !== undefined && !seen.has(key)) {
    seen.add(key);
    ph().capture("$feature_flag_called", { $feature_flag: key, $feature_flag_response: value });
  }
  return value;
}

/** Calls back whenever fresh flag values arrive. Returns an unsubscribe. */
export function onFlags(cb) {
  listeners.push(cb);
  return () => {
    listeners = listeners.filter((l) => l !== cb);
  };
}

/** Reports a caught error, for example from a React error boundary. */
export function captureException(error, properties) {
  ph()?.captureException(error, properties);
}

/** Sends a custom event. Queued until PostHog loads. */
export function capture(event, properties) {
  ph()?.capture(event, properties);
}
