import { Button } from "./ui";

export function App() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-start justify-center gap-6 px-6">
      <picture>
        <source srcSet="/rollin-wordmark-light.svg" media="(prefers-color-scheme: light)" />
        <img src="/rollin-wordmark-dark.svg" alt="" width={162} height={51} />
      </picture>
      <h1 className="sr-only">rollin</h1>
      <p className="font-mono text-sm text-text-2">The web app is on its way.</p>
      <Button
        render={<a href="https://github.com/scottwmacleod/rollin" />}
        className="inline-flex h-10 items-center rounded-md bg-signal px-4 text-sm font-medium text-on-signal hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text"
      >
        Follow progress on GitHub
      </Button>
    </main>
  );
}
