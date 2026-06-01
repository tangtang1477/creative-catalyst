import { Component, type ReactNode } from "react";
import type { StageId } from "@/lib/sc/types";
import { useSC } from "@/lib/sc/store";
import { STAGE_LABEL } from "@/lib/sc/types";
import { RotateCw } from "lucide-react";

interface State {
  error?: Error;
}

interface Props {
  children: ReactNode;
  stageId?: StageId;
  fallback?: ReactNode;
}

/**
 * Lightweight boundary for stage-level rendering. When a child crashes
 * (e.g. a restored task is missing runtime data), we degrade gracefully
 * instead of bubbling up to the route's full-page ErrorComponent.
 */
export class StageBoundary extends Component<Props, State> {
  state: State = {};

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    // eslint-disable-next-line no-console
    console.warn("[StageBoundary] swallowed render error:", error);
  }

  render() {
    if (this.state.error) {
      return (
        this.props.fallback ?? (
          <StageBoundaryFallback stageId={this.props.stageId} onReset={() => this.setState({ error: undefined })} />
        )
      );
    }
    return this.props.children;
  }
}

function StageBoundaryFallback({ stageId, onReset }: { stageId?: StageId; onReset: () => void }) {
  const retryStage = useSC((s) => s.retryStage);
  const label = stageId ? STAGE_LABEL[stageId] : "本步骤";
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-status-failed/30 bg-status-failed/5 px-3.5 py-3 text-[12px] text-muted-foreground">
      <span>⚠️ 「{label}」回放数据不完整</span>
      {stageId && (
        <button
          type="button"
          onClick={() => {
            onReset();
            retryStage(stageId);
          }}
          className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:border-accent hover:text-accent"
        >
          <RotateCw className="h-3 w-3" /> 重做此步
        </button>
      )}
    </div>
  );
}
