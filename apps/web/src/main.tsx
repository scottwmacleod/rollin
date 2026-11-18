import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary, UnexpectedErrors } from "./ErrorBoundary";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root is missing from index.html");

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
      <UnexpectedErrors />
    </ErrorBoundary>
    {/* Cookieless page counts only (#216): no cookies, no formulas, no names. */}
    <Analytics />
    {/* Cookieless web vitals from real visits (#304); its script loads after the app renders. */}
    <SpeedInsights />
  </StrictMode>,
);
