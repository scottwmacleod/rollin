import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { startPostHog } from "../../../vendor/sm-core/tooling/analytics/sm-posthog.js";
import { App } from "./App";
import { ErrorBoundary, UnexpectedErrors } from "./ErrorBoundary";
import "./index.css";
import { forgetOldTheme } from "./settings";

startPostHog({
  token: "phc_rKDLfEFrPFjYd4botU7tS9oy4MsNPHbjwsGqTSr4GLB5",
  product: "rollin",
  options: { mask_all_text: true },
});

forgetOldTheme();

const root = document.getElementById("root");
if (!root) throw new Error("#root is missing from index.html");

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
      <UnexpectedErrors />
    </ErrorBoundary>
    <Analytics />
    <SpeedInsights />
  </StrictMode>,
);
