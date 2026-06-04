import { Component, type ReactNode } from "react";

interface State {
  error?: Error;
}

interface Props {
  children: ReactNode;
  /** Optional fallback text shown when a single chat item fails to render. */
  fallbackText?: string;
}

/**
 * Per-chat-item error boundary. Used to keep a malformed archived chat entry
 * (option card / tool call / skill chip with stale shape) from crashing the
 * entire workspace when restoring historical tasks.
 */
export class ChatItemBoundary extends Component<Props, State> {
  state: State = {};

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    // eslint-disable-next-line no-console
    console.warn("[ChatItemBoundary] swallowed render error:", error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-2xl border border-border bg-surface-2/40 px-3.5 py-2 text-[12px] text-muted-foreground">
          ⚠️ {this.props.fallbackText ?? "该消息无法回放（数据结构已过期）。"}
        </div>
      );
    }
    return this.props.children;
  }
}
