import { Component, type ReactNode } from "react";

interface State {
  error?: Error;
}

interface Props {
  children: ReactNode;
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
          <div className="rounded-2xl border border-border bg-surface px-3.5 py-3 text-[12px] text-muted-foreground">
            · 本步骤的回放数据不完整，已折叠显示
          </div>
        )
      );
    }
    return this.props.children;
  }
}
