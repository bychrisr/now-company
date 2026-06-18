import { memo, useMemo, Suspense, lazy } from "react";
import type { TranscriptEntry } from "../adapters";
import type { LiveRunForIssue } from "../api/heartbeats";
import { PageSkeleton } from "./PageSkeleton";
import type { IssueChatLinkedRun } from "../lib/issue-chat-messages";

// Lazy loading de IssueChatThread (~158 kB). Carregar dinamicamente aqui — junto
// com os demais pontos de consumo — é o que efetivamente extrai o componente do
// chunk principal. Enquanto qualquer import estático existir, o Rollup mantém o
// módulo no bundle de entrada (AC #6).
const IssueChatThread = lazy(() =>
  import("./IssueChatThread").then((m) => ({ default: m.IssueChatThread })),
);

const EMPTY_COMMENTS: [] = [];
const EMPTY_TIMELINE_EVENTS: [] = [];
const EMPTY_LIVE_RUNS: [] = [];
const EMPTY_LINKED_RUNS: [] = [];
const handleEmbeddedAdd = async () => {};

function isRunActive(run: LiveRunForIssue) {
  return run.status === "queued" || run.status === "running";
}

interface RunChatSurfaceProps {
  run: LiveRunForIssue;
  transcript: TranscriptEntry[];
  hasOutput: boolean;
  companyId?: string | null;
}

export const RunChatSurface = memo(function RunChatSurface({
  run,
  transcript,
  hasOutput,
  companyId,
}: RunChatSurfaceProps) {
  const active = isRunActive(run);
  const liveRuns = useMemo(() => (active ? [run] : EMPTY_LIVE_RUNS), [active, run]);
  const linkedRuns = useMemo<IssueChatLinkedRun[]>(
    () =>
      active
        ? EMPTY_LINKED_RUNS
        : [{
            runId: run.id,
            status: run.status,
            agentId: run.agentId,
            agentName: run.agentName,
            createdAt: run.createdAt,
            startedAt: run.startedAt,
            finishedAt: run.finishedAt,
          }],
    [active, run],
  );
  const transcriptsByRunId = useMemo(
    () => new Map([[run.id, transcript as readonly TranscriptEntry[]]]),
    [run.id, transcript],
  );

  return (
    <Suspense fallback={<PageSkeleton variant="issue-chat" />}>
      <IssueChatThread
        comments={EMPTY_COMMENTS}
        linkedRuns={linkedRuns}
        timelineEvents={EMPTY_TIMELINE_EVENTS}
        liveRuns={liveRuns}
        companyId={companyId}
        onAdd={handleEmbeddedAdd}
        showComposer={false}
        showJumpToLatest={false}
        variant="embedded"
        emptyMessage={active ? "Waiting for run output..." : "No run output captured."}
        enableLiveTranscriptPolling={false}
        transcriptsByRunId={transcriptsByRunId}
        hasOutputForRun={(runId) => runId === run.id && hasOutput}
        includeSucceededRunsWithoutOutput
      />
    </Suspense>
  );
});
