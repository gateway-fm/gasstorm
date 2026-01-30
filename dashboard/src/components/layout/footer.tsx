export function Footer() {
  return (
    <footer className="border-t bg-card/50 mt-auto">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground font-mono">
          <div className="flex items-center gap-2">
            <span className="text-primary">&gt;</span>
            <span className="tracking-tight">GasStorm</span>
          </div>
          <span className="text-muted-foreground/60">v0.1.0-dev</span>
        </div>
      </div>
    </footer>
  );
}
