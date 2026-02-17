"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SystemDiagram } from "./SystemDiagram";

export function ArchitectureFlow() {
  return (
    <Card className="border-0 bg-transparent shadow-none">
      <CardHeader className="px-0 pt-0 pb-4">
        <CardTitle className="text-xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
          System Architecture
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <SystemDiagram />
      </CardContent>
    </Card>
  );
}

export default ArchitectureFlow;
