"use client"

import { useEffect } from "react"
import { AlertTriangle, RefreshCw, Home } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"

interface ErrorPageProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function BridgeError({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error("Bridge page error:", error)
  }, [error])

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-8">
      <Card className="max-w-md w-full border-destructive/50 bg-destructive/5">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <CardTitle>Bridge Error</CardTitle>
          <CardDescription>
            The bridge page encountered an error.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="text-xs text-muted-foreground bg-muted p-3 rounded-md overflow-auto max-h-24">
            {error.message || "Unknown error"}
          </pre>
        </CardContent>
        <CardFooter className="flex justify-center gap-2">
          <Button variant="outline" size="sm" onClick={reset}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.location.href = "/"}
          >
            <Home className="h-4 w-4 mr-2" />
            Go Home
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
