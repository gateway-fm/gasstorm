import { Badge } from "@/components/ui/badge";

interface Param {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

export function McpToolCard({
  name,
  description,
  mutating,
  params,
}: {
  name: string;
  description: string;
  mutating?: boolean;
  params?: Param[];
}) {
  return (
    <div className="my-4 rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <code className="text-sm font-mono font-semibold text-primary">
          {name}
        </code>
        {mutating && (
          <Badge variant="warning" className="text-[10px]">
            Mutating
          </Badge>
        )}
      </div>
      <p className="text-sm text-muted-foreground mb-3">{description}</p>
      {params && params.length > 0 && (
        <div className="rounded border overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="px-3 py-1.5 text-left font-semibold">
                  Parameter
                </th>
                <th className="px-3 py-1.5 text-left font-semibold">Type</th>
                <th className="px-3 py-1.5 text-left font-semibold">
                  Required
                </th>
                <th className="px-3 py-1.5 text-left font-semibold">
                  Description
                </th>
              </tr>
            </thead>
            <tbody>
              {params.map((p) => (
                <tr key={p.name} className="border-b last:border-b-0">
                  <td className="px-3 py-1.5 font-mono">{p.name}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">
                    {p.type}
                  </td>
                  <td className="px-3 py-1.5">
                    {p.required ? (
                      <Badge variant="default" className="text-[10px]">
                        Required
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">Optional</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-muted-foreground">
                    {p.description}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(!params || params.length === 0) && (
        <p className="text-xs text-muted-foreground italic">No parameters</p>
      )}
    </div>
  );
}
