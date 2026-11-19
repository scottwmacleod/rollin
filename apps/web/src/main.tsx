import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { startPostHog } from "../../../vendor/sm-core/tooling/analytics/sm-posthog.js";
import { App } from "./App";
import { ErrorBoundary, UnexpectedErrors } from "./ErrorBoundary";
import "./index.css";

// PostHog for experiments (sm-core#21). Its script loads from /_sm once the page is idle;
// nothing loads under Global Privacy Control or Do Not Track. Masked text keeps formulas out.
startPostHog({
  token: "phc_rKDLfEFrPFjYd4botU7tS9oy4MsNPHbjwsGqTSr4GLB5",
  product: "rollin",
  options: { mask_all_text: true },
});

const root = document.getElementById("root");
if (!root) throw new Error("#root is missing from index.html");

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
      <UnexpectedErrors />
    </ErrorBoundary>
    {/* Cookieless page counts (#216). PostHog (above) adds masked autocapture and flags: no cookies, no formulas, no names. */}
    <Analytics />
    {/* Cookieless web vitals from real visits (#304); its script loads after the app renders. */}
    <SpeedInsights />
  </StrictMode>,
);
