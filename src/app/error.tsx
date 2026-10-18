"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="flex min-h-[70vh] items-center justify-center px-6 grain">
      <div className="max-w-[560px] text-center">
        <span className="eyebrow">Error</span>
        <h1 className="h2 mt-6">Something went wrong.</h1>
        <p className="lead mt-4">{error.message || "An unexpected error occurred."}</p>
        {error.digest ? <p className="mt-2 font-mono text-[11px] text-meta">Reference {error.digest}</p> : null}
        <div className="mt-8 flex justify-center gap-2">
          <button type="button" className="btn btn-primary btn-md" onClick={reset}>
            Try again
          </button>
          <Link href="/" className="btn btn-secondary btn-md">
            Go home
          </Link>
        </div>
      </div>
    </main>
  );
}
