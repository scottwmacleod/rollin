export type E2eSelection =
  | { readonly mode: "none" }
  | { readonly mode: "specs"; readonly specs: readonly string[] }
  | { readonly mode: "all"; readonly because: string };

const cannotReachTheApp: readonly RegExp[] = [
  /^docs\//u,
  /\.md$/u,
  /^\.github\//u,
  /^\.claude\//u,
  /^\.out-of-scope\//u,
  /^LICENSE$/u,
  /^skills-lock\.json$/u,
  /^hk\.pkl$/u,
  /^oxlint-suppressions\.json$/u,
  /^\.oxlintrc\.json$/u,
  /^\.oxfmtrc\.json$/u,
  /^biome\.jsonc$/u,
  /^\.prettierignore$/u,
  /^\.gitignore$/u,
  /^test\//u,
  /^packages\/engine\/fixtures\//u,
  /^(?!apps\/web\/e2e\/).*\.test\.tsx?$/u,
];

const spec = /^apps\/web\/(?<path>e2e\/[^/]+\.spec\.ts)$/u;

export function selectE2e(changed: readonly string[]): E2eSelection {
  const specs: string[] = [];
  for (const file of changed) {
    const path = spec.exec(file)?.groups?.path;
    if (path !== undefined) {
      specs.push(path);
    } else if (!cannotReachTheApp.some((pattern) => pattern.test(file))) {
      return { mode: "all", because: file };
    }
  }
  return specs.length > 0 ? { mode: "specs", specs: [...new Set(specs)] } : { mode: "none" };
}
