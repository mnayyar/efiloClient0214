import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface HealthStatus {
  status: string;
  database: string;
  service: string;
  version: string;
}

export function HomePage() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-text-primary">
            efilo.ai
          </CardTitle>
          <p className="text-text-secondary text-sm">
            Your Projects. Finally Connected.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-text-secondary">Frontend:</span>
            <Badge className="bg-status-success text-white">
              React + Vite
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-text-secondary">Backend:</span>
            {error ? (
              <Badge variant="destructive">Disconnected</Badge>
            ) : health ? (
              <Badge className="bg-status-success text-white">
                {health.service} v{health.version}
              </Badge>
            ) : (
              <Badge variant="secondary">Connecting...</Badge>
            )}
          </div>
          {health && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-text-secondary">Database:</span>
              <Badge className="bg-status-info text-white">
                {health.database}
              </Badge>
            </div>
          )}
          <div className="pt-4 border-t border-border-card">
            <Button
              className="w-full bg-brand-orange hover:bg-brand-orange/90 text-white"
              onClick={() => window.location.reload()}
            >
              Refresh Status
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
