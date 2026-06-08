import { useEffect, useRef, useState } from "react";
import {
  Image as ImageIcon,
  Film,
  Download,
  RefreshCw,
  ZoomIn,
  Mic,
  Play,
  Pause,
  ChevronDown,
  Check,
} from "lucide-react";
import type { Asset } from "@/lib/sc/types";
import { StatusBadge } from "./StatusBadge";
import { SCButton } from "./Button";
import { cn } from "@/lib/utils";
import { useSC } from "@/lib/sc/store";
import { AssetActions } from "./AssetActions";
import { GradientLoader } from "./GradientLoader";
import { AssetVersionSwitcher } from "./AssetVersionSwitcher";
import { GeneratingPill } from "./GeneratingPill";
import { useCharacterVoices } from "@/lib/sc/character-voices-store";
import { useVoices, type VoiceRow } from "@/lib/sc/voices-store";
import { bindCharacterVoice, unbindCharacterVoice } from "@/lib/characters.functions";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface Props {
  asset: Asset;
  compact?: boolean;
  highlighted?: boolean;
  selectable?: boolean;
  selected?: boolean;
  onToggle?: (id: string) => void;
}

// Stable hash for asset.id → pick stable default among candidates
function hashStr(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const FEMALE_HINTS = ["女", "姐", "妹", "母", "妻", "girl", "female", "woman", "lady", "laura", "anna", "lucy", "mary"];
const MALE_HINTS = ["男", "兄", "弟", "父", "夫", "boy", "male", "man", "guy", "john", "tom", "mike"];

function pickDefaultVoice(characterName: string, assetId: string, voices: VoiceRow[]): VoiceRow | undefined {
  const ready = voices.filter((v) => v.status === "ready");
  if (ready.length === 0) return undefined;
  const presets = ready.filter((v) => v.source === "preset");
  const pool = presets.length > 0 ? presets : ready;

  const name = characterName.toLowerCase();
  const isFemale = FEMALE_HINTS.some((k) => name.includes(k));
  const isMale = !isFemale && MALE_HINTS.some((k) => name.includes(k));

  const matchByGender = (v: VoiceRow) => {
    const n = (v.name + " " + (v.description ?? "")).toLowerCase();
    if (isFemale) return FEMALE_HINTS.some((k) => n.includes(k));
    if (isMale) return MALE_HINTS.some((k) => n.includes(k));
    return false;
  };
  const matched = pool.filter(matchByGender);
  const candidates = matched.length > 0 ? matched : pool;
  return candidates[hashStr(assetId) % candidates.length];
}

export function AssetCard({
  asset,
  compact = false,
  highlighted = false,
  selectable = false,
  selected = false,
}: Props) {
  const Icon = asset.kind === "image" ? ImageIcon : Film;
  const retryAsset = useSC((s) => s.retryAsset);
  const openVersionDrawer = useSC((s) => s.openVersionDrawer);
  const openPreview = useSC((s) => s.openPreview);
  const versionCount = (asset.versions?.length ?? 0) + (asset.url ? 1 : 0);
  const hasVersions = versionCount >= 2;
  const [loaded, setLoaded] = useState(false);

  // —— Character ↔ voice 绑定只作用于「人物 & 场景素材」阶段的人物 C* ——
  // 服化道阶段（W*/P*）属于服装与道具，按需求不再展示音色控件。
  const isCharacter = asset.stageId === "cast" && /^C/i.test(asset.id);
  const characterName = asset.caption ?? asset.id;
  const cvFetch = useCharacterVoices((s) => s.fetch);
  const cvRefresh = useCharacterVoices((s) => s.refresh);
  const cvLoaded = useCharacterVoices((s) => s.loaded);
  const binding = useCharacterVoices((s) =>
    isCharacter ? s.voiceForName(characterName) : undefined,
  );
  const voices = useVoices((s) => s.voices);
  const voicesLoaded = useVoices((s) => s.loaded);
  const fetchVoices = useVoices((s) => s.fetchVoices);
  const previewVoice = useVoices((s) => s.preview);
  const stopPreview = useVoices((s) => s.stopPreview);
  const previewingId = useVoices((s) => s.previewingId);
  useEffect(() => {
    if (isCharacter && !cvLoaded) cvFetch();
    if (isCharacter && !voicesLoaded) fetchVoices();
  }, [isCharacter, cvLoaded, voicesLoaded, cvFetch, fetchVoices]);
  const boundVoice = binding ? voices.find((v) => v.id === binding.voice_id) : undefined;

  // —— Auto-bind a default voice once everything is loaded ——
  const autoBindAttempted = useRef(false);
  useEffect(() => {
    if (!isCharacter) return;
    if (!voicesLoaded || !cvLoaded) return;
    if (binding) return;
    if (autoBindAttempted.current) return;
    if (voices.length === 0) return;
    const pick = pickDefaultVoice(characterName, asset.id, voices);
    if (!pick) return;
    autoBindAttempted.current = true;
    (async () => {
      try {
        await bindCharacterVoice({
          data: { character_name: characterName, voice_id: pick.id },
        });
        await cvRefresh();
      } catch (e) {
        console.warn("[asset-card] auto-bind voice failed", e);
      }
    })();
  }, [isCharacter, voicesLoaded, cvLoaded, binding, voices, characterName, asset.id, cvRefresh]);

  const handleChangeVoice = async (voiceId: string) => {
    if (!voiceId || voiceId === binding?.voice_id) return;
    try {
      if (binding) await unbindCharacterVoice({ data: { id: binding.id } });
      await bindCharacterVoice({
        data: { character_name: characterName, voice_id: voiceId },
      });
      await cvRefresh();
    } catch (e) {
      console.warn("[asset-card] change voice failed", e);
    }
  };

  // Derive display aspect ratio: explicit asset.aspectRatio wins, else infer
  // from width/height, else fall back per kind/stage.
  const inferAspect = (): string => {
    if (asset.aspectRatio) return asset.aspectRatio.replace(":", " / ");
    if (asset.width && asset.height) {
      const r = asset.width / asset.height;
      const candidates: Array<[string, number]> = [
        ["16 / 9", 16 / 9],
        ["9 / 16", 9 / 16],
        ["1 / 1", 1],
        ["3 / 4", 3 / 4],
        ["4 / 3", 4 / 3],
      ];
      let best = candidates[0];
      let bestDiff = Infinity;
      for (const c of candidates) {
        const d = Math.abs(Math.log(r) - Math.log(c[1]));
        if (d < bestDiff) { bestDiff = d; best = c; }
      }
      return best[0];
    }
    if (asset.stageId === "wardrobe") return "1 / 1";
    return asset.kind === "image" ? "9 / 16" : "16 / 9";
  };
  const aspectCss = inferAspect();
  const isTall = ["9 / 16", "3 / 4"].includes(aspectCss);
  const maxH = isTall ? (compact ? 240 : 420) : (compact ? 200 : 360);

  const dim =
    asset.width && asset.height
      ? `${asset.width}×${asset.height}`
      : asset.kind === "video"
        ? "1080×1920"
        : "—";

  const onOpen = () => openPreview(asset.id);

  const paused = useSC((s) => s.paused);
  const isGenerating =
    !paused && (
      asset.status === "Queued" ||
      asset.status === "Generating" ||
      asset.status === "Processing" ||
      asset.status === "Recovering" ||
      asset.status === "Status checked"
    );
  const showFullLoader = isGenerating && !asset.url;
  const showOverlayLoader = isGenerating && !!asset.url;

  const loadingLabel =
    asset.kind === "video"
      ? asset.status === "Queued"
        ? "Queued · video"
        : asset.status === "Recovering"
          ? "Recovering video"
          : "Generating video"
      : asset.status === "Queued"
        ? "Queued · image"
        : asset.status === "Recovering"
          ? "Recovering image"
          : "Generating image";

  const readyVoices = voices.filter((v) => v.status === "ready");
  const presetVoices = readyVoices.filter((v) => v.source === "preset");
  const myVoices = readyVoices.filter((v) => v.source !== "preset");

  const renderVoiceItem = (v: VoiceRow) => {
    const isBound = v.id === binding?.voice_id;
    const playing = previewingId === v.id;
    return (
      <DropdownMenuItem
        key={v.id}
        onSelect={(e) => {
          e.preventDefault();
          handleChangeVoice(v.id);
        }}
        className="flex items-center gap-2 pr-1 text-[11.5px]"
      >
        <Check className={cn("h-3 w-3 shrink-0", isBound ? "text-accent" : "opacity-0")} />
        <span className="flex-1 truncate">{v.name}</span>
        <button
          type="button"
          aria-label={playing ? "停止试听" : "试听音色"}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            playing ? stopPreview() : previewVoice(v.id);
          }}
          className={cn(
            "inline-flex h-5 w-5 items-center justify-center rounded-md transition-colors",
            playing
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
          )}
        >
          {playing ? <Pause className="h-2.5 w-2.5" /> : <Play className="h-2.5 w-2.5" />}
        </button>
      </DropdownMenuItem>
    );
  };

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border bg-surface-2 transition-shadow [animation:asset-pop_280ms_cubic-bezier(0.22,1,0.36,1)]",
        highlighted && "[animation:rail-flash_1.5s_ease-out_1]",
        selected && "ring-2 ring-accent",
      )}
    >
      <div className="relative w-full">
        {asset.kind === "image" && asset.url ? (
          <>
            <img
              src={asset.url}
              alt={asset.label}
              loading="lazy"
              onLoad={() => setLoaded(true)}
              onDoubleClick={() => openPreview(asset.id)}
              className={cn(
                "block w-full cursor-zoom-in object-cover transition-[filter,opacity] duration-500",
                (!loaded || showOverlayLoader) && "scale-[1.02] opacity-80 blur-lg",
                loaded && !showOverlayLoader && "blur-0 opacity-100",
              )}
              style={{ aspectRatio: aspectCss, maxHeight: maxH }}
            />
            {showOverlayLoader && <GeneratingPill label={loadingLabel} />}
          </>
        ) : asset.kind === "video" && asset.url ? (
          <div className="relative">
            <video
              src={asset.url}
              poster={asset.poster}
              controls
              playsInline
              preload="metadata"
              crossOrigin="anonymous"
              className="block w-full bg-black"
              style={{ aspectRatio: aspectCss, maxHeight: maxH }}
            />
            {asset.duration && (
              <span className="pointer-events-none absolute bottom-1.5 right-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                {asset.duration}
              </span>
            )}
            {showOverlayLoader && <GeneratingPill label={loadingLabel} />}
          </div>
        ) : showFullLoader ? (
          <GradientLoader
            label={loadingLabel}
            aspect={aspectCss}
            maxHeight={maxH}
          />
        ) : (
          <div
            className="relative flex w-full flex-col items-center justify-center gap-2 overflow-hidden border border-status-failed/40 bg-[radial-gradient(ellipse_at_top,_color-mix(in_oklab,var(--status-failed)_10%,transparent)_0%,_transparent_60%)] p-4 text-center"
            style={{ aspectRatio: aspectCss, maxHeight: maxH }}
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-status-failed/15 text-status-failed">
              <RefreshCw className="h-4 w-4" />
            </div>
            <div className="text-[12.5px] font-semibold text-foreground/90">
              生成失败
            </div>
            {asset.errorMessage && (
              <div
                className="line-clamp-3 max-w-[85%] text-[10.5px] leading-snug text-muted-foreground"
                title={asset.errorMessage}
              >
                {asset.errorMessage}
              </div>
            )}
            <div className="rounded-full bg-emerald-500/12 px-2 py-0.5 text-[10px] font-medium text-emerald-400 ring-1 ring-emerald-500/20">
              本次未扣除积分
            </div>
            <SCButton
              variant="chip"
              size="sm"
              className="mt-1 h-7 gap-1 px-3 text-[11px]"
              onClick={() => retryAsset(asset.id)}
            >
              <RefreshCw className="h-3 w-3" />
              重试
            </SCButton>
          </div>
        )}

        <AssetActions
          asset={asset}
          selectable={selectable}
          selected={selected}
          variant="card"
        />
        <AssetVersionSwitcher asset={asset} variant="card" />
      </div>

      <div className="space-y-1.5 px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="rounded-md bg-background/60 px-1.5 py-0.5 text-[10.5px] font-mono font-semibold tracking-wider text-accent">
              {asset.label}
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Icon className="h-3 w-3" />
              {asset.kind === "image" ? "Keyframe" : "Video"}
            </span>
          </div>
          <StatusBadge status={asset.status} />
        </div>

        {asset.caption && (
          <div className="text-[11.5px] text-foreground/80">{asset.caption}</div>
        )}

        <div className="flex items-center gap-2 text-[10.5px] text-muted-foreground">
          <span>{dim}</span>
          {asset.duration && <span>· {asset.duration}</span>}
        </div>

        <div className="flex items-center gap-1 pt-1">
          <SCButton
            variant="chip"
            size="sm"
            className="h-6 gap-1 px-2 text-[11px]"
            onClick={onOpen}
          >
            <ZoomIn className="h-3 w-3" />
            预览
          </SCButton>
          {hasVersions && (
            <SCButton
              variant="chip"
              size="sm"
              className="h-6 gap-1 px-2 text-[11px]"
              onClick={() => openVersionDrawer(asset.id)}
              title="查看版本历史"
            >
              <RefreshCw className="h-3 w-3" />
              v{versionCount}
            </SCButton>
          )}
          {asset.url && (
            <a
              href={asset.url}
              download={`${asset.label}.${asset.kind === "video" ? "mp4" : "png"}`}
              target="_blank"
              rel="noopener"
              aria-label="download"
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              <Download className="h-3 w-3" />
            </a>
          )}

          {isCharacter && (
            <div className="ml-auto inline-flex h-7 items-center gap-0.5 rounded-full border border-border/60 bg-surface-2/70 pl-2 pr-0.5 text-[11px] text-foreground/90 transition-colors hover:bg-surface-2">
              <Mic className="h-3 w-3 shrink-0 text-accent" />
              <span className="min-w-0 max-w-[88px] truncate">
                {boundVoice
                  ? `${boundVoice.source === "preset" ? "预设·" : "我的·"}${boundVoice.name}`
                  : voicesLoaded
                    ? "选择音色"
                    : "加载中…"}
              </span>
              {boundVoice && (
                <button
                  type="button"
                  aria-label={previewingId === boundVoice.id ? "停止试听" : "试听音色"}
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    previewingId === boundVoice.id ? stopPreview() : previewVoice(boundVoice.id);
                  }}
                  className={cn(
                    "inline-flex h-5 w-5 items-center justify-center rounded-full transition-colors",
                    previewingId === boundVoice.id
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-background/80 hover:text-foreground",
                  )}
                >
                  {previewingId === boundVoice.id ? (
                    <Pause className="h-2.5 w-2.5" />
                  ) : (
                    <Play className="h-2.5 w-2.5" />
                  )}
                </button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="切换音色"
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-background/80 hover:text-foreground"
                  >
                    <ChevronDown className="h-3 w-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  {presetVoices.length > 0 && (
                    <>
                      <DropdownMenuLabel className="text-[10px] text-muted-foreground">
                        预设音色
                      </DropdownMenuLabel>
                      {presetVoices.map(renderVoiceItem)}
                    </>
                  )}
                  {myVoices.length > 0 && (
                    <>
                      {presetVoices.length > 0 && <DropdownMenuSeparator />}
                      <DropdownMenuLabel className="text-[10px] text-muted-foreground">
                        我的音色
                      </DropdownMenuLabel>
                      {myVoices.map(renderVoiceItem)}
                    </>
                  )}
                  {readyVoices.length === 0 && (
                    <div className="px-2 py-3 text-center text-[11px] text-muted-foreground">
                      暂无可用音色
                    </div>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
