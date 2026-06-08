import { createFileRoute } from "@tanstack/react-router";
import { handleChatStream } from "@/lib/sc/chat-stream-handler";

export const Route = createFileRoute("/api/chat-stream")({
  server: {
    handlers: {
      POST: ({ request }) => handleChatStream(request),
    },
  },
});
