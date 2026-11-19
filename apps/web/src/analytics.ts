import { useSyncExternalStore } from "react";
import { flag, onFlags } from "../../../vendor/sm-core/tooling/analytics/sm-posthog.js";

/**
 * The visitor's variant for an experiment flag: a variant name, true or false,
 * or undefined until PostHog has answered (render the control until then).
 * Reading it records the exposure once per page, which experiment results need.
 */
export function useFlag(key: string): string | boolean | undefined {
  return useSyncExternalStore(onFlags, () => flag(key));
}
