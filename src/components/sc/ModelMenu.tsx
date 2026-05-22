import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ClaudeIcon, GoogleIcon, OpenAIIcon } from "./BrandIcons";
import { cn } from "@/lib/utils";

interface ModelOpt {
  id: string;
  brand: string;
  name: string;
  version: string;
  badge?: string;
}

const MODELS: { group: string; icon: "claude" | "google" | "openai"; items: ModelOpt[] }[] = [
  {
    group: "Claude",
    icon: "claude",
    items: [
      { id: "claude-sonnet-46", brand: "Claude", name: "Sonnet", version: "4.6" },
      { id: "claude-opus-46", brand: "Claude", name: "Opus", version: "4.6" },
      { id: "claude-opus-47", brand: "Claude", name: "Opus", version: "4.7", badge: "Upgrade" },
    ],
  },
  {
    group: "Google",
    icon: "google",
    items: [
      { id: "gemini-31-pro", brand: "Google", name: "Gemini 3.1 Pro", version: "" },
    ],
  },
  {
    group: "OpenAI",
    icon: "openai",
    items: [
      { id: "gpt-55", brand: "OpenAI", name: "GPT-5.5", version: "" },
      { id: "gpt-5-mini", brand: "OpenAI", name: "GPT-5 mini", version: "" },
    ],
  },
];

function GroupIcon({ kind }: { kind: "claude" | "google" | "openai" }) {
  if (kind === "claude") return <ClaudeIcon size={13} />;
  if (kind === "google") return <GoogleIcon size={13} />;
  return <OpenAIIcon size={13} className="text-foreground" />;
}

function BrandIconFor({ brand }: { brand: string }) {
  if (brand === "Claude") return <ClaudeIcon size={13} />;
  if (brand === "Google") return <GoogleIcon size={13} />;
  return <OpenAIIcon size={13} className="text-foreground" />;
}

interface Props {
  disabled?: boolean;
}

export function ModelMenu({ disabled }: Props) {
  const [selected, setSelected] = useState<string>("claude-sonnet-46");
  const current = MODELS.flatMap((g) => g.items).find((m) => m.id === selected)!;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "inline-flex h-7 select-none items-center gap-1.5 rounded-full bg-transparent px-2.5 text-[12px] font-medium leading-none text-foreground/85 outline-none transition-colors",
            "hover:bg-surface-2 active:scale-[0.98]",
            "focus-visible:ring-2 focus-visible:ring-accent",
            "disabled:pointer-events-none disabled:opacity-50",
          )}
        >
          <BrandIconFor brand={current.brand} />
          <span className="text-foreground">{current.brand}</span>
          <span className="text-muted-foreground">
            {current.name}
            {current.version ? ` ${current.version}` : ""}
          </span>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={8}
        className="w-[260px] rounded-2xl border-border bg-surface p-1.5 shadow-2xl"
      >
        {MODELS.map((group, gi) => (
          <div key={group.group}>
            {gi > 0 && <DropdownMenuSeparator className="my-1.5 bg-border" />}
            <DropdownMenuLabel className="flex items-center gap-1.5 px-2 py-1 text-[11.5px] font-normal text-muted-foreground">
              <GroupIcon kind={group.icon} />
              {group.group}
            </DropdownMenuLabel>
            {group.items.map((m) => {
              const isSel = m.id === selected;
              return (
                <DropdownMenuItem
                  key={m.id}
                  onSelect={() => setSelected(m.id)}
                  className={cn(
                    "group flex cursor-pointer items-center gap-2 rounded-xl px-2 py-2 text-[13px] focus:bg-surface-2 data-[highlighted]:bg-surface-2",
                    isSel ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  <span className="flex-1 truncate">
                    {m.name}
                    {m.version ? ` ${m.version}` : ""}
                  </span>
                  {m.badge && (
                    <span className="rounded-full bg-accent/20 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                      {m.badge}
                    </span>
                  )}
                  {isSel && <Check className="h-3.5 w-3.5 text-foreground" />}
                </DropdownMenuItem>
              );
            })}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
