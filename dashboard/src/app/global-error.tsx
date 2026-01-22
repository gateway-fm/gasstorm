"use client"

import { useEffect } from "react"

interface GlobalErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

/**
 * Global error boundary that catches errors in the root layout.
 * This must render its own <html> and <body> tags because it completely
 * replaces the root layout when there's an error.
 */
export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error("Global error:", error)
  }, [error])

  return (
    <html lang="en" className="dark">
      <body className="antialiased min-h-screen bg-background text-foreground">
        <div className="flex items-center justify-center min-h-screen p-8">
          <div className="max-w-md w-full p-6 rounded-lg border border-red-500/50 bg-red-500/5">
            <div className="text-center">
              <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-red-500/10 flex items-center justify-center">
                <svg
                  className="h-6 w-6 text-red-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-red-500 mb-2">
                Critical Error
              </h2>
              <p className="text-sm text-gray-400 mb-4">
                A critical error occurred. The application could not load properly.
              </p>
            </div>
            <pre className="text-xs text-gray-400 bg-gray-800 p-3 rounded-md overflow-auto max-h-24 mb-4">
              {error.message || "Unknown error"}
            </pre>
            <div className="flex justify-center gap-2">
              <button
                onClick={reset}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors"
              >
                Try Again
              </button>
              <button
                onClick={() => window.location.href = "/"}
                className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 rounded-md hover:bg-gray-600 transition-colors"
              >
                Go Home
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  )
}
