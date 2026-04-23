"use client";

/**
 * Root error boundary. Catches render-time and data-fetch errors in any route.
 *
 * The expected failure mode in Phase 0 is losing the PocketBase connection
 * (Tailscale dropped, PB container down). Rather than a blank screen, we show
 * the error text + a Reload button so the user knows what broke.
 *
 * Intentionally does NOT render <AppShell> — if the shell itself failed to
 * render, wrapping the error in the same component would loop.
 */

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Something went wrong</CardTitle>
          <CardDescription>
            The page failed to render. Most likely causes: PocketBase
            unreachable (check Tailscale), or a bug.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <pre className="bg-muted max-h-48 overflow-auto rounded-md p-3 text-xs whitespace-pre-wrap">
            {error.message}
            {error.digest ? `\n\ndigest: ${error.digest}` : ""}
          </pre>
          <Button onClick={reset}>Reload</Button>
        </CardContent>
      </Card>
    </div>
  );
}
