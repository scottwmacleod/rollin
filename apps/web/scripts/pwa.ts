import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { Plugin } from "vite";

export function offlineWorker(): Plugin {
  let outDir = "";
  return {
    name: "rollin-offline-worker",
    apply: "build",
    configResolved(config) {
      outDir = join(config.root, config.build.outDir);
    },
    writeBundle() {
      const files = readdirSync(outDir, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => relative(outDir, join(entry.parentPath, entry.name)).split(sep).join("/"))
        .filter((f) => f !== "sw.js" && !f.endsWith(".map"))
        .sort();
      const precache = files.filter((f) => !f.endsWith(".woff"));
      const hash = createHash("sha256");
      for (const f of files) hash.update(f).update(readFileSync(join(outDir, f)));
      const version = hash.digest("hex").slice(0, 12);
      const template = readFileSync(new URL("./sw.template.js", import.meta.url), "utf8");
      const urls = ["/", ...precache.filter((f) => f !== "index.html").map((f) => `/${f}`)];
      writeFileSync(
        join(outDir, "sw.js"),
        template
          .replace("__VERSION__", version)
          .replace("__PRECACHE__", JSON.stringify(urls, null, 2)),
      );
    },
  };
}
