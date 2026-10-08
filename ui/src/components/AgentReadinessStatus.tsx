import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { agentsApi } from "../api/agents";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

/** Live execution setup is separate from the agent's employment status. */
export function AgentReadinessStatus({ agentId, companyId, agentStatus }: {
  agentId: string; companyId: string; agentStatus: string;
}) {
  const query = useQuery({
    queryKey: ["agents", agentId, "readiness", companyId, agentStatus],
    queryFn: () => agentsApi.getReadiness(agentId, companyId),
    enabled: agentStatus !== "pending_approval" && agentStatus !== "terminated",
    refetchInterval: q => q.state.status === "error" || q.state.data?.some(state => state.state !== "ready") ? 2_000 : 30_000,
  });
  if (agentStatus === "pending_approval" || agentStatus === "terminated") return null;
  if (query.isError) return <div role="status" className="flex items-center gap-2 text-sm text-destructive">
    <span>Could not fetch readiness status.</span>
    <Button variant="ghost" size="sm" onClick={() => void query.refetch()}>Check again</Button>
  </div>;
  if (!query.data?.length) return null;
  return <div role="status" aria-live="polite" className="space-y-2">
    {query.data.map((state, index) => <div key={index} className="flex flex-wrap items-center gap-2">
      <Badge variant={state.state === "blocked" || state.state === "unavailable" ? "destructive" : "secondary"}>
        {state.state === "pending" && <Loader2 aria-hidden="true" className="mr-1 size-3 animate-spin motion-reduce:animate-none" />}
        {state.label}
      </Badge>
      {state.message && <span className="text-sm text-muted-foreground">{state.message}</span>}
      {(state.state === "blocked" || state.state === "unavailable") && <Button variant="ghost" size="sm" onClick={() => void query.refetch()}>Check again</Button>}
    </div>)}
  </div>;
}
