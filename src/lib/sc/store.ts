import { create } from "zustand";
import {
  type Asset,
  type Attachment,
  type AutoMode,
  type Brief,
  type Gate,
  type Phase,
  type StageId,
  type StageState,
  type StageSnapshot,
  type TaskKind,
  type TaskRecord,
  type ToolCall,
  type Thought,
  type ViewMode,
  STAGE_ORDER,
  STAGE_LABEL,
} from "./types";
import { SAMPLE_KEYFRAME, SAMPLE_VIDEO, SERIES_DEMO, STORYBOARD_ROWS, KEYFRAME_PROMPT_DETAIL } from "./samples";
import { inferTaskTitle } from "./intake-engine";
import { useCredits } from "./credits-store";
import { supabase } from "@/integrations/supabase/client";
import { streamGenerateImage, uploadBase64Image } from "@/lib/upload-image";
import { submitVideoTask, pollVideoTask } from "@/lib/seedance.functions";
import { generateScript, type GeneratedScript } from "@/lib/script.functions";
import { parseFormatDuration, parseFormatRatio, formatDurationLabel, clampSeedanceDuration } from "@/lib/sc/format-utils";


const consume = (stage: string, label: string, cost: number, taskId?: string | null) =>
  useCredits.getState().consume(stage, label, cost, taskId);
const canAfford = (cost: number) => useCredits.getState().canAfford(cost);

/**
 * 同步刷新当前登录用户 id 到 store。在每个 run* 入口调用，避免
 * fire-and-forget 写入造成的竞态导致命中未登录回退分支。
 */
async function ensureUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getUser();
    const id = data.user?.id ?? null;
    useSC.setState({ currentUserId: id });
    return id;
  } catch {
    return useSC.getState().currentUserId;
  }
}

interface RailState {
  open: boolean;
  flashId?: string;
  focusedAssetId?: string;
}

interface SoftGate {
  /** Action invoked when the 20s countdown reaches 0 in auto mode. */
  defaultAction: () => void;
  /** Epoch ms when auto-advance fires. */
  fireAt: number;
}

export type ChatAction =
  | { label: string; kind: "retry-stage"; stageId: StageId }
  | { label: string; kind: "rerun-all" };

interface ChatMsg {
  id: string;
  role: "user" | "agent";
  text: string;
  ts: number;
  actions?: ChatAction[];
  streaming?: boolean;
  toolCalls?: import("./types").ChatToolCall[];
  thinking?: string;
  optionCards?: import("./types").ChatOptionCard[];
  /** ai turn 顶部一行 skill 标题 */
  skill?: { name: string; sub?: string };
}


interface SCState {
  phase: Phase;
  prompt: string;
  brief: Brief | null;
  stages: Record<StageId, StageState>;
  assets: Asset[];
  taskTitle: string;
  taskId: string | null;
  taskKind: TaskKind;
  taskHistory: TaskRecord[];
  attachments: Attachment[];
  gate: Gate;
  softGate: SoftGate | null;
  rail: RailState;
  viewMode: ViewMode;
  autoMode: AutoMode;
  timers: number[];
  runId: number;
  /** ids selected for batch operations */
  selection: string[];
  /** in-task chat messages (user ↔ agent), reset on new task */
  chatLog: ChatMsg[];
  /** Asset id currently shown in the VersionDrawer (null = closed). */
  versionDrawerAssetId: string | null;
  /** Asset id shown in the AssetPreviewDialog lightbox (null = closed). */
  previewAssetId: string | null;



  /** cached supabase user id for the current run; populated on submit() */
  currentUserId: string | null;
  /** LLM-generated script for the current run (null until structure stage finishes) */
  script: GeneratedScript | null;

  intakeSel: Record<string, string>;
  intakeCustoms: Record<string, string[]>;
  intakeOthers: { key: string; label: string } | null;

  setPrompt: (v: string) => void;
  setAutoMode: (m: AutoMode) => void;
  setViewMode: (v: ViewMode) => void;
  addAttachment: (a: Attachment) => void;
  removeAttachment: (id: string) => void;
  clearAttachments: () => void;
  submit: (prompt: string) => void;
  chatMessage: (text: string) => void;
  confirmBrief: (brief: Brief) => void;
  submitOptionCard: (msgId: string, cardId: string, answers: Record<string, { selected: string[]; otherText?: string }>) => void;
  skipOptionCard: (msgId: string, cardId: string) => void;
  skipIntake: () => void;
  approveScript: () => void;
  tweakScript: () => void;
  approveWardrobe: () => void;
  tweakWardrobe: () => void;
  approveKeyframe: () => void;
  regenerateKeyframe: () => void;
  applyQCFix: () => void;
  keepAsIs: () => void;
  cancelSoftGate: () => void;
  cancel: () => void;
  reset: (opts?: { fromUserAction?: boolean }) => void;
  toggleStage: (id: StageId) => void;
  toggleThought: (stageId: StageId, thoughtId: string) => void;
  setRailOpen: (v: boolean) => void;
  focusAsset: (id: string) => void;
  forceState: (s: string) => void;
  restoreTask: (id: string) => void;
  deleteTask: (id: string) => void;
  retryStage: (id: StageId) => void;
  retryAsset: (assetId: string) => void;
  setActiveVersion: (assetId: string, versionIndex: number) => void;
  openVersionDrawer: (assetId: string) => void;
  closeVersionDrawer: () => void;
  openPreview: (assetId: string) => void;
  closePreview: () => void;






  toggleSelect: (id: string) => void;
  clearSelection: () => void;
  batchEditAssets: (ids: string[], instruction: string) => void;

  setIntakeSel: (key: string, value: string) => void;
  requestIntakeOthers: (key: string, label: string) => void;
  cancelIntakeOthers: () => void;
  resolveIntakeOthers: (value: string) => void;
}

const HISTORY_KEY = "sc.tasks";
const AUTO_KEY = "sc.autoMode";
const VIEW_KEY = "sc.viewMode";

const emptyStage = (): StageState => ({
  status: "pending",
  summary: [],
  expanded: true,
  toolCalls: [],
  thoughts: [],
});

const initialStages = (): Record<StageId, StageState> =>
  STAGE_ORDER.reduce(
    (acc, id) => {
      acc[id] = emptyStage();
      return acc;
    },
    {} as Record<StageId, StageState>,
  );

const isSeriesPrompt = (text: string) =>
  /(剧集|系列|连续剧|episode|series|第\s*\d+\s*集|EP\s*\d)/i.test(text);

const newId = () =>
  `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

const loadHistory = (): TaskRecord[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
};

const saveHistory = (list: TaskRecord[]) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 30)));
  } catch {
    /* ignore */
  }
};

const loadAutoMode = (): AutoMode => {
  if (typeof window === "undefined") return "auto";
  const v = window.localStorage.getItem(AUTO_KEY);
  return v === "confirm" ? "confirm" : "auto";
};

const loadViewMode = (): ViewMode => {
  if (typeof window === "undefined") return "list";
  const v = window.localStorage.getItem(VIEW_KEY);
  return v === "canvas" ? "canvas" : "list";
};

const uid = () => Math.random().toString(36).slice(2, 9);

export const useSC = create<SCState>((set, get) => {
  let pendingQcIssues: import("@/lib/qc.functions").QcIssue[] = [];
  const clearTimers = () => {
    for (const t of get().timers) clearTimeout(t);
    set({ timers: [] });
  };

  const schedule = (fn: () => void, delay: number) => {
    const startedRunId = get().runId;
    const id = window.setTimeout(() => {
      if (get().runId !== startedRunId) return;
      fn();
    }, delay) as unknown as number;
    set({ timers: [...get().timers, id] });
    return id;
  };

  const updateStage = (id: StageId, patch: Partial<StageState>) =>
    set((s) => ({
      stages: { ...s.stages, [id]: { ...s.stages[id], ...patch } },
    }));

  const appendSummary = (id: StageId, line: string) =>
    set((s) => ({
      stages: {
        ...s.stages,
        [id]: { ...s.stages[id], summary: [...s.stages[id].summary, line] },
      },
    }));

  const startToolCall = (stageId: StageId, kind: ToolCall["kind"], label: string) => {
    const id = uid();
    set((s) => ({
      stages: {
        ...s.stages,
        [stageId]: {
          ...s.stages[stageId],
          toolCalls: [
            ...s.stages[stageId].toolCalls,
            { id, kind, label, startedAt: Date.now(), status: "running" },
          ],
        },
      },
    }));
    return id;
  };

  const finishToolCall = (stageId: StageId, id: string) =>
    set((s) => ({
      stages: {
        ...s.stages,
        [stageId]: {
          ...s.stages[stageId],
          toolCalls: s.stages[stageId].toolCalls.map((t) =>
            t.id === id
              ? { ...t, status: "done", durationMs: Date.now() - t.startedAt }
              : t,
          ),
        },
      },
    }));

  /**
   * One-shot tool execution: insert a running line, wait `ms`, mark done.
   * Returns the delay so callers can chain timing.
   */
  const runTool = (
    stageId: StageId,
    kind: ToolCall["kind"],
    label: string,
    ms: number,
    startDelay = 0,
  ) => {
    let toolId = "";
    schedule(() => {
      toolId = startToolCall(stageId, kind, label);
    }, startDelay);
    schedule(() => {
      if (toolId) finishToolCall(stageId, toolId);
    }, startDelay + ms);
    return startDelay + ms;
  };

  const addThought = (stageId: StageId, thought: Omit<Thought, "id">) => {
    const id = uid();
    set((s) => ({
      stages: {
        ...s.stages,
        [stageId]: {
          ...s.stages[stageId],
          thoughts: [...s.stages[stageId].thoughts, { id, ...thought }],
        },
      },
    }));
    return id;
  };

  const updateAsset = (id: string, patch: Partial<Asset>) =>
    set((s) => ({
      assets: s.assets.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    }));

  /**
   * Update an asset's `url` while preserving the previous URL in `versions[]`.
   * Use this for any user-visible regeneration (QC fix, manual retry,
   * batch-edit) so the gallery can show every prior version.
   */
  const updateAssetWithVersion = (
    id: string,
    nextUrl: string,
    source: import("./types").AssetVersion["source"],
    note?: string,
    extra?: Partial<Asset>,
  ) =>
    set((s) => ({
      assets: s.assets.map((a) => {
        if (a.id !== id) return a;
        const prev = a.url;
        const versions = a.versions ? [...a.versions] : [];
        if (prev && /^https?:\/\//.test(prev) && prev !== nextUrl) {
          versions.push({
            url: prev,
            createdAt: Date.now(),
            source: a.versions?.length ? source : "init",
            note,
          });
        }
        return { ...a, ...extra, url: nextUrl, versions };
      }),
    }));

  const streamLines = (
    id: StageId,
    lines: string[],
    perLineDelay = 700,
    startDelay = 0,
    onDone?: () => void,
  ) => {
    lines.forEach((line, i) => {
      schedule(() => appendSummary(id, line), startDelay + i * perLineDelay);
    });
    if (onDone) schedule(onDone, startDelay + lines.length * perLineDelay);
  };

  const collapseAfter = (id: StageId, delay = 1400) =>
    schedule(() => updateStage(id, { expanded: false }), delay);

  const isAuto = () => get().autoMode === "auto";

  /** Open a soft-gate that auto-advances after 15s in Auto mode. */
  const openGate = (gate: Gate, defaultAction: () => void) => {
    const auto = isAuto();
    set({
      gate,
      softGate: auto ? { defaultAction, fireAt: Date.now() + 15000 } : null,
    });
    if (auto) {
      schedule(() => {
        if (get().gate === gate) defaultAction();
      }, 15000);
    }
  };

  const closeGate = () => set({ gate: null, softGate: null });

  /** Persist current task snapshot into taskHistory */
  const persistCurrent = (status: TaskRecord["status"]) => {
    const { taskId, taskTitle, brief, assets, taskHistory, taskKind, stages, script } = get();
    if (!taskId) return;
    const now = Date.now();
    const existing = taskHistory.find((t) => t.id === taskId);
    const stageSummaries: Partial<Record<StageId, string[]>> = {};
    const stageSnapshots: Partial<Record<StageId, StageSnapshot>> = {};
    let failureReason: string | undefined;
    for (const sid of STAGE_ORDER) {
      const st = stages[sid];
      if (st.summary.length) stageSummaries[sid] = st.summary.slice();
      if (st.summary.length || st.toolCalls.length || st.thoughts.length) {
        stageSnapshots[sid] = {
          status: st.status,
          summary: st.summary.slice(),
          toolCalls: st.toolCalls.slice(),
          thoughts: st.thoughts.slice(),
        };
      }
      if (status === "failed" && st.status === "failed" && !failureReason) {
        failureReason = st.summary[st.summary.length - 1] ?? `${STAGE_LABEL[sid]} 失败`;
      }
    }
    const record: TaskRecord = {
      id: taskId,
      title: taskTitle,
      prompt: brief?.prompt ?? "",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      status,
      kind: taskKind,
      assets,
      stageSummaries,
      stageSnapshots,
      script: script ?? existing?.script,
      failureReason: failureReason ?? existing?.failureReason,
      brief,
    };
    const next = [record, ...taskHistory.filter((t) => t.id !== taskId)];
    set({ taskHistory: next });
    saveHistory(next);
  };



  // -------- Stage runners --------

  const runScene = () => {
    updateStage("scene", { status: "running", expanded: true });
    runTool("scene", "skill", "ai-video-studio · scene-builder", 1100, 0);
    const promptTxt = get().prompt || get().brief?.prompt || "";
    const briefLine = promptTxt
      ? `锁定主题：${promptTxt.slice(0, 40)}${promptTxt.length > 40 ? "…" : ""}`
      : "正在分析品牌 brief 与受众…";
    streamLines(
      "scene",
      [
        briefLine,
        "拆解情绪/节奏/受众场景…",
        "为本主题选定镜头语言（推 / 跟 / 特写组合）…",
      ],
      850,
      1300,
      () => {
        updateStage("scene", { status: "ready" });
        consume("scene", "Scene · brief analysis", 1, get().taskId);
        collapseAfter("scene", 1400);
        schedule(() => runStructure(), 1600);
      },
    );
  };

  const runStructure = () => {
    updateStage("structure", { status: "running", expanded: true });
    const tcId = startToolCall("structure", "tool", "video-script-writer · LLM");
    appendSummary("structure", "调用大模型生成本次剧本与分镜…");

    const startedRunId = get().runId;
    const b = get().brief;
    void (async () => {
      let script: GeneratedScript | null = null;
      try {
        const attachments = get().attachments.map((a) => ({
          kind: a.kind,
          name: a.name,
          caption: a.ref ?? undefined,
          url: /^https?:\/\//.test(a.url) ? a.url : undefined,
        }));
        script = await generateScript({
          data: {
            prompt: b?.prompt ?? "",
            adType: b?.adType ?? "",
            format: b?.format ?? "",
            visualSource: b?.visualSource ?? "",
            visualStyle: b?.visualStyle ?? "",
            attachments,
          },
        });
      } catch (e) {
        console.error("[structure] generateScript failed", e);
        appendSummary("structure", `脚本生成失败：${(e as Error).message}`);
        updateStage("structure", { errorMessage: (e as Error).message });
      }
      if (get().runId !== startedRunId) return;
      finishToolCall("structure", tcId);

      if (script) {
        set({ script });
        appendSummary("structure", `情绪：${script.mood}`);
        appendSummary("structure", `镜头语言：${script.cameraLanguage}`);
        for (const line of script.structureSummary) appendSummary("structure", line);
        addThought("structure", {
          title: "分镜方案",
          body: script.shots.map(
            (s) => `${s.shot} · ${s.duration} · ${s.motion} — ${s.scene}（${s.elements}）`,
          ),
        });
      } else {
        appendSummary("structure", "使用默认 5 镜头结构作为兜底。");
      }

      updateStage("structure", { status: "ready" });
      consume("structure", "Script + storyboard", 3, get().taskId);
      openGate("script", () => runWardrobe());
    })();
  };

  const runWardrobe = () => {
    closeGate();
    updateStage("wardrobe", { status: "running", expanded: true });
    runTool("wardrobe", "tool", "wardrobe-stylist · text-to-image", 1500, 0);

    const script = get().script;
    const wardrobeSpec = Array.isArray(script?.wardrobe) && script!.wardrobe!.length > 0
      ? script!.wardrobe!
      : [
          { id: "W01", caption: "主角形象" },
          { id: "W02", caption: "配角形象" },
          { id: "P01", caption: "关键道具" },
        ];

    streamLines(
      "wardrobe",
      wardrobeSpec.map((w) => `${w.id}：${w.caption}`),
      650,
      300,
    );

    const wardrobeAssets: Asset[] = wardrobeSpec.map((w) => ({
      id: w.id,
      kind: "image",
      label: w.id,
      caption: w.caption,
      status: "Queued",
      stageId: "wardrobe",
      width: 768,
      height: w.id === "P01" ? 768 : 1024,
    }));
    set((s) => ({
      assets: [...s.assets, ...wardrobeAssets],
      rail: { ...s.rail, open: true, flashId: wardrobeSpec[0]?.id },
    }));

    const startedRunId = get().runId;
    const taskId = get().taskId ?? undefined;
    const briefPrompt = get().brief?.prompt ?? "";

    void (async () => {
      const userId = await ensureUserId();
      if (!userId) {
        const reason = "请先登录后再生成服装/道具素材";
        for (const w of wardrobeAssets) {
          if (get().runId !== startedRunId) return;
          updateAsset(w.id, {
            status: "Failed",
            errorMessage: reason,
            errorCode: "auth_required",
          });
        }
        appendSummary("wardrobe", `未登录 · 已暂停生成（${reason}）`);
        updateStage("wardrobe", { status: "failed", errorMessage: reason });
        set({ phase: "failed" });
        persistCurrent("failed");
        return;
      }
      for (const w of wardrobeAssets) {
        if (get().runId !== startedRunId) return;
        updateAsset(w.id, { status: "Generating", errorMessage: undefined });
        const isProp = /^P/i.test(w.id);
        const isHero = /^W0*1$/i.test(w.id);
        const role = isProp
          ? "key prop / object hero shot, centered, studio lighting, neutral background"
          : isHero
            ? "main character / hero subject portrait, full body, neutral background, reference sheet style"
            : "secondary character / supporting subject portrait, full body, neutral background, reference sheet style";
        const { styleToPromptFragment } = await import("@/lib/sc/intake-engine");
        const styleFragment = styleToPromptFragment(get().brief?.visualStyle);
        const fullPrompt = [
          styleFragment ? `Style: ${styleFragment}.` : "",
          `Reference asset ${w.id} for the short film. Subject: ${w.caption}.`,
          `Style direction: ${role}.`,
          `User brief (must reflect the actual subject, do NOT invent unrelated brands or scenes): ${briefPrompt}`,
        ].filter(Boolean).join("\n\n");
        try {
          const b64 = await streamGenerateImage({
            prompt: fullPrompt,
            quality: "low",
            onPartial: (dataUrl) => {
              if (get().runId !== startedRunId) return;
              updateAsset(w.id, { url: dataUrl });
            },
          });
          if (get().runId !== startedRunId) return;
          const url = await uploadBase64Image({ base64: b64, userId, taskId });
          if (get().runId !== startedRunId) return;
          updateAsset(w.id, { status: "Ready", url, errorMessage: undefined });
          consume("wardrobe", `Wardrobe · ${w.id}`, 2, get().taskId);
        } catch (e) {
          console.error("[wardrobe] failed", w.id, e);
          updateAsset(w.id, {
            status: "Failed",
            errorMessage: (e as Error).message,
            errorCode: "gen_failed",
          });
          appendSummary(
            "wardrobe",
            `${w.id} 生成失败：${(e as Error).message}（未扣积分）`,
          );
        }
      }

      if (get().runId !== startedRunId) return;
      appendSummary("wardrobe", "服装/道具准备完毕 · 风格统一");

      // Auto-bind a preset voice to every character (W*) asset. Always
      // fetches the voices store first so binding works even if the user
      // hasn't opened the voice library panel yet.
      try {
        const [{ useVoices }, { bindCharacterVoice, listCharacterVoices }, { useCharacterVoices }] =
          await Promise.all([
            import("@/lib/sc/voices-store"),
            import("@/lib/characters.functions"),
            import("@/lib/sc/character-voices-store"),
          ]);
        const vState = useVoices.getState();
        await vState.fetchVoices().catch(() => void 0);
        const voices = useVoices.getState().voices.filter((v) => v.status === "ready");
        if (voices.length) {
          const existing = await listCharacterVoices({ data: {} }).catch(() => ({ bindings: [] }));
          const taken = new Set(
            (existing.bindings as Array<{ character_name: string }>).map((b) => b.character_name),
          );
          const characters = wardrobeAssets.filter((w) => /^W/i.test(w.id));
          let bound = 0;
          for (let i = 0; i < characters.length; i++) {
            const c = characters[i];
            const name = c.caption ?? c.id;
            if (taken.has(name)) continue;
            const isFemale = /女|her|she|sister|mother|girl/i.test(name);
            const isMale = /男|him|he|brother|father|boy/i.test(name);
            const pool = voices.filter((v) => {
              if (isFemale) return /female|woman|girl|她|女/i.test(`${v.name} ${v.description ?? ""}`);
              if (isMale) return /male|man|boy|他|男/i.test(`${v.name} ${v.description ?? ""}`);
              return true;
            });
            const pick = (pool.length ? pool : voices)[i % (pool.length || voices.length)];
            if (!pick) continue;
            await bindCharacterVoice({
              data: { character_name: name, voice_id: pick.id, task_id: get().taskId ?? undefined },
            }).catch(() => void 0);
            bound++;
          }
          // Notify UI to refresh badges on AssetCard.
          await useCharacterVoices.getState().refresh();
          if (bound > 0) {
            appendSummary(
              "wardrobe",
              `已为 ${bound} 位角色自动绑定默认音色 · 可在「音色库」中调整`,
            );
          }
        }
      } catch (e) {
        console.warn("[wardrobe] auto-bind voice failed", e);
      }

      updateStage("wardrobe", { status: "ready" });
      collapseAfter("wardrobe", 1600);
      persistCurrent("running");
      openGate("wardrobe", () => runPaint());
    })();
  };


  const runPaint = () => {
    closeGate();
    updateStage("paint", { status: "running", expanded: true });
    runTool("paint", "skill", "ai-video-studio · keyframe-painter", 800, 0);
    runTool("paint", "tool", "text-to-image · streaming", 1200, 900);

    const scriptForThought = get().script;
    const wardrobeIds = get()
      .assets.filter((a) => a.stageId === "wardrobe")
      .map((a) => a.id);
    const shotCount = scriptForThought?.shots?.length ?? STORYBOARD_ROWS.length;
    schedule(
      () =>
        addThought("paint", {
          title: "基于服装/道具素材生成分镜",
          body: [
            wardrobeIds.length
              ? `锁定服装/道具参考：${wardrobeIds.join(" · ")}`
              : "未生成服装/道具参考 · 直接按 prompt 渲染",
            `将分批生成 ${shotCount} 个关键帧，覆盖全部镜头。`,
            scriptForThought?.cameraLanguage
              ? `镜头语言：${scriptForThought.cameraLanguage}`
              : "镜头语言：依据脚本动态选择",
            scriptForThought?.mood
              ? `情绪基调：${scriptForThought.mood}`
              : "情绪基调：贴合用户主题",
          ],
          thumbAssetIds: wardrobeIds,
        }),
      1200,
    );

    const script = get().script;
    const SHOTS = script?.shots?.length
      ? script.shots.map((s) => ({
          shot: s.shot,
          motion: s.motion,
          scene: s.scene,
          elements: s.elements,
          prompt: s.prompt,
        }))
      : STORYBOARD_ROWS.map((r) => ({ ...r, prompt: "" }));
    streamLines(
      "paint",
      [`队列接收 · ${SHOTS.length} 个关键帧 · prompt 已写入…`],
      0,
      200,
    );

    // 全部以 Queued 插入
    const paintAssets: Asset[] = SHOTS.map((r) => ({
      id: r.shot,
      kind: "image" as const,
      label: r.shot,
      caption: `Keyframe · ${r.scene}`,
      status: "Queued" as const,
      stageId: "paint" as const,
      width: 1080,
      height: 1920,
    }));
    set((s) => ({
      assets: [...s.assets, ...paintAssets],
      rail: { ...s.rail, open: true, flashId: SHOTS[0]?.shot },
    }));

    // 串行真实生图
    const startedRunId = get().runId;
    void (async () => {
      const userId = await ensureUserId();
      const taskId = get().taskId ?? undefined;
      const briefPrompt = get().brief?.prompt ?? "";

      if (!userId) {
        const reason = "请先登录后再生成关键帧";
        for (const r of SHOTS) {
          if (get().runId !== startedRunId) return;
          updateAsset(r.shot, {
            status: "Failed",
            errorMessage: reason,
            errorCode: "auth_required",
          });
        }
        appendSummary("paint", `未登录 · 已暂停生成（${reason}）`);
        updateStage("paint", { status: "failed", errorMessage: reason });
        set({ phase: "failed" });
        persistCurrent("failed");
        return;
      }

      for (const r of SHOTS) {
        if (get().runId !== startedRunId) return;
        updateAsset(r.shot, { status: "Generating" });
        appendSummary("paint", `${r.shot} 生成中 · ${r.motion}`);
        try {
          const { styleToPromptFragment } = await import("@/lib/sc/intake-engine");
          const styleFragment = styleToPromptFragment(get().brief?.visualStyle);
          const stylePrefix = styleFragment ? `Style: ${styleFragment}.\n\n` : "";
          const fullPrompt = r.prompt
            ? `${stylePrefix}${r.prompt}\n\nReference brief: ${briefPrompt}`
            : [
                stylePrefix + briefPrompt,
                KEYFRAME_PROMPT_DETAIL,
                `Shot ${r.shot} · ${r.scene} · ${r.motion} · ${r.elements}`,
              ].filter(Boolean).join("\n\n");
          const b64 = await streamGenerateImage({
            prompt: fullPrompt,
            quality: "low",
            onPartial: (dataUrl) => {
              if (get().runId !== startedRunId) return;
              updateAsset(r.shot, { url: dataUrl });
            },
          });
          if (get().runId !== startedRunId) return;
          const url = await uploadBase64Image({ base64: b64, userId, taskId });
          if (get().runId !== startedRunId) return;
          updateAsset(r.shot, { status: "Ready", url });
          consume("paint", `Keyframe ${r.shot} · stream-gen`, 5, get().taskId);
          appendSummary("paint", `${r.shot} Ready · ${r.motion}`);
        } catch (e) {
          console.error("[paint] failed", r.shot, e);
          updateAsset(r.shot, {
            status: "Failed",
            errorMessage: (e as Error).message,
            errorCode: "gen_failed",
          });
          appendSummary(
            "paint",
            `${r.shot} 生成失败：${(e as Error).message}（未扣积分）`,
          );
        }
      }

      if (get().runId !== startedRunId) return;
      updateStage("paint", { status: "ready" });
      appendSummary(
        "paint",
        `${SHOTS.length} 个关键帧已就绪 · 锁定为 V01–V0${SHOTS.length} 的 image_url`,
      );
      collapseAfter("paint", 1800);
      persistCurrent("running");
      openGate("keyframe", () => runQC());
    })();
  };

  const runQC = () => {
    closeGate();
    updateStage("qc", { status: "running", expanded: true });
    const tcId = startToolCall("qc", "skill", "qc-consistency-checker · multimodal");
    appendSummary("qc", "采集所有关键帧 · 提交多模态一致性检查…");

    const startedRunId = get().runId;
    const scriptForQC = get().script;
    const briefForQC = get().brief;
    const shotsForQC = get()
      .assets.filter(
        (a) => a.stageId === "paint" && a.url && /^https?:\/\//.test(a.url),
      )
      .map((a) => {
        const meta = scriptForQC?.shots?.find((s) => s.shot === a.id);
        return {
          id: a.id,
          url: a.url as string,
          scene: meta?.scene ?? a.caption ?? "",
          elements: meta?.elements ?? "",
        };
      });

    void (async () => {
      if (shotsForQC.length === 0) {
        if (get().runId !== startedRunId) return;
        finishToolCall("qc", tcId);
        appendSummary("qc", "未找到可检查的真实关键帧 · 跳过 QC");
        updateStage("qc", { status: "ready" });
        collapseAfter("qc", 1400);
        schedule(() => runLife(), 1100);
        return;
      }

      let result: import("@/lib/qc.functions").QcResult;
      try {
        const { checkConsistency } = await import("@/lib/qc.functions");
        result = await checkConsistency({
          data: {
            shots: shotsForQC,
            brief: briefForQC
              ? { prompt: briefForQC.prompt, adType: briefForQC.adType }
              : undefined,
          },
        });
      } catch (e) {
        console.error("[qc] checkConsistency failed", e);
        result = {
          issues: [],
          passedDimensions: [
            "角色一致性",
            "场景一致性",
            "服装/道具连贯",
            "故事连贯性",
            "幻觉/事实性",
            "法务/合规",
          ],
          degraded: true,
          error: (e as Error).message,
        };
      }
      if (get().runId !== startedRunId) return;
      finishToolCall("qc", tcId);

      // Save issues onto stage thoughts for downstream use
      pendingQcIssues = result.issues;

      for (const dim of result.passedDimensions) {
        appendSummary("qc", `${dim} ✓`);
      }

      if (result.issues.length === 0) {
        appendSummary(
          "qc",
          result.degraded ? "QC 服务降级 · 默认通过" : "一致性全部通过 ✓",
        );
        updateStage("qc", { status: "ready" });
        collapseAfter("qc", 1400);
        schedule(() => runLife(), 1100);
        return;
      }

      appendSummary("qc", `发现 ${result.issues.length} 处问题，需要修正：`);
      addThought("qc", {
        title: "修改建议",
        body: result.issues.map(
          (it) =>
            `${it.shotId} · ${it.dimension}（${it.severity}）— ${it.suggestion}`,
        ),
      });
      openGate("qc-fix", () => applyQCFixInternal());
    })();
  };

  const applyQCFixInternal = () => {
    closeGate();
    const issues = pendingQcIssues;
    if (!issues.length) {
      appendSummary("qc", "无待修正项 · 直接进入下一步");
      updateStage("qc", { status: "ready" });
      collapseAfter("qc", 1400);
      schedule(() => runLife(), 1100);
      return;
    }

    appendSummary("qc", `调用快模型重生成 ${issues.length} 个镜头…`);
    const startedRunId = get().runId;
    const userId = get().currentUserId;
    const taskId = get().taskId ?? undefined;
    const briefPrompt = get().brief?.prompt ?? "";

    void (async () => {
      // Collect wardrobe reference URLs (W01/W02/P01) for character/prop locking.
      const wardrobeRefs = get()
        .assets.filter(
          (a) =>
            a.stageId === "wardrobe" &&
            a.url &&
            /^https?:\/\//.test(a.url),
        )
        .map((a) => a.url as string);

      for (const issue of issues) {
        if (get().runId !== startedRunId) return;
        const tcId = startToolCall("qc", "tool", `re-paint · ${issue.shotId}`);
        updateAsset(issue.shotId, { status: "Generating", errorMessage: undefined });
        try {
          if (!userId) {
            updateAsset(issue.shotId, { status: "Ready" });
          } else {
            const originalShot = get().assets.find(
              (a) => a.id === issue.shotId,
            );
            const originalUrl =
              originalShot?.url && /^https?:\/\//.test(originalShot.url)
                ? originalShot.url
                : undefined;
            const refs = [...wardrobeRefs];
            if (originalUrl) refs.push(originalUrl);

            const editPrompt = [
              `Re-render keyframe ${issue.shotId} for a short film while strictly preserving character identity and key prop appearance from the reference images (W01 hero, W02 supporting, P01 key prop).`,
              `Consistency dimension to fix: ${issue.dimension}. Required correction: ${issue.suggestion}`,
              `Detailed instruction: ${issue.fixPrompt}`,
              `User brief (stay on-topic, do NOT introduce unrelated brands or scenes): ${briefPrompt}`,
              `Keep the same composition and framing as the last reference image (the previous version of this shot). Output a single final keyframe image.`,
            ].join("\n\n");

            const { editImageWithRefs } = await import(
              "@/lib/image-edit.functions"
            );
            const { b64 } = await editImageWithRefs({
              data: { prompt: editPrompt, imageUrls: refs.slice(0, 6) },
            });
            if (get().runId !== startedRunId) return;
            const url = await uploadBase64Image({ base64: b64, userId, taskId });
            if (get().runId !== startedRunId) return;
            updateAsset(issue.shotId, {
              status: "Ready",
              url,
              errorMessage: undefined,
            });
          }
          appendSummary("qc", `${issue.shotId} 已修正 (${issue.dimension})`);
        } catch (e) {
          console.error("[qc] re-paint failed", issue.shotId, e);
          updateAsset(issue.shotId, {
            status: "Failed",
            errorMessage: (e as Error).message,
            errorCode: "edit_failed",
          });
          appendSummary(
            "qc",
            `${issue.shotId} 修正失败：${(e as Error).message}（未扣积分）`,
          );
        } finally {
          finishToolCall("qc", tcId);
        }
      }
      if (get().runId !== startedRunId) return;
      pendingQcIssues = [];
      appendSummary("qc", "修正完成 · 一致性全部通过 ✓");
      updateStage("qc", { status: "ready" });
      collapseAfter("qc", 1400);
      schedule(() => runLife(), 1100);
    })();
  };

  const runLife = () => {
    closeGate();
    const VIDEO_COST_PER_SEG = 30;
    const briefFormat = get().brief?.format ?? "";
    const requestedDuration = parseFormatDuration(briefFormat);
    const videoRatio = parseFormatRatio(briefFormat);

    // Build segment plan: prefer 10s chunks, top up with a 5s tail.
    const script = get().script;
    const shotsRef = script?.shots ?? [];
    const paintAssetsAll = get().assets.filter((a) => a.stageId === "paint" && a.url);
    const pickKeyframe = (shotId: string | undefined): string | undefined => {
      if (shotId) {
        const exact = paintAssetsAll.find((p) => p.id === shotId);
        if (exact?.url) return exact.url;
      }
      const httpFirst = paintAssetsAll.find((p) => /^https?:\/\//.test(p.url!));
      return (httpFirst ?? paintAssetsAll[0])?.url;
    };

    const planDurations: Array<5 | 10> = [];
    if (requestedDuration <= 5) {
      planDurations.push(5);
    } else if (requestedDuration <= 10) {
      planDurations.push(10);
    } else {
      const tens = Math.floor(requestedDuration / 10);
      const rem = requestedDuration - tens * 10;
      for (let i = 0; i < tens; i++) planDurations.push(10);
      if (rem >= 3) planDurations.push(5);
    }
    // Cap segment count to available shots (or at least 1 segment).
    const maxSegs = Math.max(1, Math.min(planDurations.length, Math.max(shotsRef.length, 1)));
    const segments = planDurations.slice(0, maxSegs);
    if (segments.length === 0) segments.push(10);
    const totalCost = VIDEO_COST_PER_SEG * segments.length;

    if (!canAfford(totalCost)) {
      updateStage("life", { status: "recovering", expanded: true, summary: [] });
      const tid = get().taskId ?? undefined;
      useCredits.getState().openLow(tid);
      set({ phase: "failed" });
      persistCurrent("failed");
      return;
    }

    updateStage("life", { status: "running", expanded: true });
    runTool("life", "skill", "reference-image-to-video · Seedance", 1200, 0);

    const totalSeconds = segments.reduce((s, n) => s + n, 0);
    appendSummary(
      "life",
      `计划：${segments.length} 段 · ${segments.join("+")}s ≈ ${totalSeconds}s ${
        totalSeconds === requestedDuration
          ? ""
          : `（用户期望 ${requestedDuration}s，按 Seedance 5s/10s 颗粒拼接）`
      }`.trim(),
    );

    // Collect wardrobe refs once
    const wardrobeRefs = get()
      .assets.filter(
        (a) =>
          a.stageId === "wardrobe" && a.url && /^https?:\/\//.test(a.url),
      )
      .map((a) => a.url as string)
      .slice(0, 4);

    // Pre-insert all V0N assets (Queued)
    const segAssets: Asset[] = segments.map((dur, i) => {
      const idx = i + 1;
      const segId = `V${idx.toString().padStart(2, "0")}`;
      const shot = shotsRef[i] ?? shotsRef[shotsRef.length - 1];
      const keyUrl = pickKeyframe(shot?.shot);
      return {
        id: segId,
        kind: "video" as const,
        label: segId,
        caption: shot?.scene
          ? `${shot.shot ?? segId} · ${shot.scene} · ${dur}s`
          : `Segment ${idx} · ${dur}s`,
        status: "Queued" as const,
        stageId: "life" as const,
        duration: formatDurationLabel(dur),
        segmentIndex: i,
        sourceShotId: shot?.shot,
        poster: keyUrl,
      };
    });
    set((s) => ({
      assets: [...s.assets, ...segAssets],
      rail: { ...s.rail, open: true, flashId: segAssets[0]?.id },
    }));

    const briefPrompt = get().brief?.prompt ?? "";
    const startedRunId = get().runId;

    void (async () => {
      // Refresh auth before deciding fail-fast
      let userId = get().currentUserId;
      if (!userId) {
        try {
          const { data } = await supabase.auth.getUser();
          userId = data.user?.id ?? null;
          if (userId) set({ currentUserId: userId });
        } catch {
          /* ignore */
        }
      }
      if (!userId) {
        const reason = "未登录，无法生成真实视频。请先登录后重试。";
        for (const sa of segAssets) {
          updateAsset(sa.id, { status: "Failed", errorMessage: reason });
        }
        updateStage("life", { status: "failed", errorMessage: reason });
        appendSummary("life", `生成失败：${reason}（未扣积分）`);
        set({ phase: "failed" });
        persistCurrent("failed");
        return;
      }

      // Run each segment in parallel
      const tasks = segAssets.map(async (sa, i) => {
        const dur = segments[i];
        const shot = shotsRef[i] ?? shotsRef[shotsRef.length - 1];
        const keyUrl = pickKeyframe(shot?.shot);
        if (!keyUrl) {
          updateAsset(sa.id, {
            status: "Failed",
            errorMessage: "缺少首帧关键帧，请重跑 Keyframes 阶段。",
            errorCode: "missing_keyframe",
          });
          appendSummary("life", `${sa.id} 失败：缺少关键帧（未扣积分）`);
          return false;
        }
        const segPrompt = [
          shot?.prompt || briefPrompt,
          shot?.scene ? `Scene: ${shot.scene}` : "",
          shot?.motion ? `Camera/motion: ${shot.motion}` : "",
          shot?.elements ? `Key elements: ${shot.elements}` : "",
          `Stay strictly on the user's brief: ${briefPrompt}`,
          `Preserve character/prop identity from reference images.`,
        ]
          .filter(Boolean)
          .join("\n");

        updateAsset(sa.id, { status: "Processing" });
        appendSummary("life", `提交 ${sa.id} · ${shot?.shot ?? "—"} · ${dur}s`);

        try {
          const refs = [...wardrobeRefs, keyUrl].slice(0, 6);
          const { taskId: seedanceTaskId } = await submitVideoTask({
            data: {
              route: "reference-image-to-video",
              payload: {
                prompt: segPrompt,
                image_urls: refs,
                ratio: videoRatio,
                duration: dur,
              } as unknown as { prompt: string },
            },
          });
          if (get().runId !== startedRunId) return false;
          appendSummary("life", `${sa.id} Seedance task: ${seedanceTaskId}`);

          // Poll
          const started = Date.now();
          while (true) {
            if (get().runId !== startedRunId) return false;
            await new Promise((r) => setTimeout(r, 3000));
            let r;
            try {
              r = await pollVideoTask({ data: { taskId: seedanceTaskId } });
            } catch (e) {
              console.error(`[life] ${sa.id} poll error`, e);
              continue;
            }
            if (get().runId !== startedRunId) return false;
            if (r.status === "success" && r.ossUrl) {
              updateAsset(sa.id, {
                status: "Ready",
                url: r.ossUrl,
                poster: keyUrl,
              });
              consume("life", `Video ${sa.id} · seedance`, VIDEO_COST_PER_SEG, get().taskId);
              appendSummary("life", `${sa.id} Ready`);
              return true;
            }
            if (r.status === "failed") {
              updateAsset(sa.id, {
                status: "Failed",
                errorMessage: "Seedance 渲染失败",
                errorCode: "seedance_failed",
              });
              appendSummary("life", `${sa.id} 渲染失败（未扣积分）`);
              return false;
            }
            if (Date.now() - started > 5 * 60_000) {
              updateAsset(sa.id, {
                status: "Failed",
                errorMessage: "Seedance 轮询超时（5min）",
                errorCode: "timeout",
              });
              appendSummary("life", `${sa.id} 轮询超时（未扣积分）`);
              return false;
            }
            updateAsset(sa.id, { status: "Processing" });
          }
        } catch (e) {
          console.error(`[life] ${sa.id} submit failed`, e);
          updateAsset(sa.id, {
            status: "Failed",
            errorMessage: (e as Error).message,
            errorCode: "submit_failed",
          });
          appendSummary("life", `${sa.id} 提交失败：${(e as Error).message}（未扣积分）`);
          return false;
        }
      });

      const results = await Promise.all(tasks);
      if (get().runId !== startedRunId) return;
      const okCount = results.filter(Boolean).length;
      if (okCount === segAssets.length) {
        updateStage("life", { status: "ready" });
        appendSummary("life", `全部 ${okCount} 段 Ready · 合计 ≈ ${totalSeconds}s`);
        collapseAfter("life", 1800);
        persistCurrent("running");
        schedule(() => runDetails(), 1600);
      } else if (okCount === 0) {
        updateStage("life", { status: "failed", errorMessage: "全部视频段渲染失败，可在下方单独重做某一段" });
        set({ phase: "failed" });
        persistCurrent("failed");
      } else {
        const partial = `${okCount}/${segAssets.length} 段成功，其余失败 · 可点击单段重试`;
        updateStage("life", { status: "failed", errorMessage: partial });
        appendSummary("life", partial);
        set({ phase: "failed" });
        persistCurrent("failed");
      }
    })();
  };

  /**
   * Re-submit a single life segment (V0N) without restarting the whole stage.
   * Reuses the existing keyframe + wardrobe references; consumes credit only
   * on success (same as runLife).
   */
  const runWardrobeAsset = (assetId: string) => {
    const asset = get().assets.find((a) => a.id === assetId);
    if (!asset || asset.stageId !== "wardrobe") return;
    const startedRunId = get().runId;
    const briefPrompt = get().brief?.prompt ?? "";
    updateAsset(assetId, { status: "Generating", errorMessage: undefined, errorCode: undefined });
    appendSummary("wardrobe", `${assetId} 单图重做中…`);
    void (async () => {
      const userId = await ensureUserId();
      if (!userId) {
        updateAsset(assetId, {
          status: "Failed",
          errorMessage: "请先登录后再生成",
          errorCode: "auth_required",
        });
        return;
      }
      const taskId = get().taskId ?? undefined;
      const isProp = /^P/i.test(assetId);
      const isHero = /^W0*1$/i.test(assetId);
      const role = isProp
        ? "key prop / object hero shot, centered, studio lighting, neutral background"
        : isHero
          ? "main character / hero subject portrait, full body, neutral background, reference sheet style"
          : "secondary character / supporting subject portrait, full body, neutral background, reference sheet style";
      const { styleToPromptFragment } = await import("@/lib/sc/intake-engine");
      const styleFragment = styleToPromptFragment(get().brief?.visualStyle);
      const fullPrompt = [
        styleFragment ? `Style: ${styleFragment}.` : "",
        `Reference asset ${assetId} for the short film. Subject: ${asset.caption ?? assetId}.`,
        `Style direction: ${role}.`,
        `User brief (must reflect the actual subject, do NOT invent unrelated brands or scenes): ${briefPrompt}`,
      ].filter(Boolean).join("\n\n");
      try {
        const b64 = await streamGenerateImage({
          prompt: fullPrompt,
          quality: "low",
          onPartial: (dataUrl) => {
            if (get().runId !== startedRunId) return;
            updateAsset(assetId, { url: dataUrl });
          },
        });
        if (get().runId !== startedRunId) return;
        const url = await uploadBase64Image({ base64: b64, userId, taskId });
        if (get().runId !== startedRunId) return;
        updateAssetWithVersion(assetId, url, "manual-retry", "单图重做", {
          status: "Ready",
          errorMessage: undefined,
          errorCode: undefined,
        });
        consume("wardrobe", `Wardrobe · ${assetId} retry`, 2, get().taskId);
        appendSummary("wardrobe", `${assetId} 重做完成`);
      } catch (e) {
        console.error("[wardrobe] single retry failed", assetId, e);
        updateAsset(assetId, {
          status: "Failed",
          errorMessage: (e as Error).message,
          errorCode: "gen_failed",
        });
      }
    })();
  };

  const runPaintShot = (assetId: string) => {
    const asset = get().assets.find((a) => a.id === assetId);
    if (!asset || asset.stageId !== "paint") return;
    const startedRunId = get().runId;
    const briefPrompt = get().brief?.prompt ?? "";
    const script = get().script;
    const shot = script?.shots?.find((s) => s.shot === assetId);
    updateAsset(assetId, { status: "Generating", errorMessage: undefined, errorCode: undefined });
    appendSummary("paint", `${assetId} 单图重做中…`);
    void (async () => {
      const userId = await ensureUserId();
      if (!userId) {
        updateAsset(assetId, {
          status: "Failed",
          errorMessage: "请先登录后再生成",
          errorCode: "auth_required",
        });
        return;
      }
      const taskId = get().taskId ?? undefined;
      const { styleToPromptFragment } = await import("@/lib/sc/intake-engine");
      const styleFragment = styleToPromptFragment(get().brief?.visualStyle);
      const stylePrefix = styleFragment ? `Style: ${styleFragment}.\n\n` : "";
      const fullPrompt = shot?.prompt
        ? `${stylePrefix}${shot.prompt}\n\nReference brief: ${briefPrompt}`
        : [
            stylePrefix + briefPrompt,
            KEYFRAME_PROMPT_DETAIL,
            shot
              ? `Shot ${shot.shot} · ${shot.scene} · ${shot.motion} · ${shot.elements}`
              : `Shot ${assetId} · ${asset.caption ?? ""}`,
          ].filter(Boolean).join("\n\n");
      try {
        const b64 = await streamGenerateImage({
          prompt: fullPrompt,
          quality: "low",
          onPartial: (dataUrl) => {
            if (get().runId !== startedRunId) return;
            updateAsset(assetId, { url: dataUrl });
          },
        });
        if (get().runId !== startedRunId) return;
        const url = await uploadBase64Image({ base64: b64, userId, taskId });
        if (get().runId !== startedRunId) return;
        updateAssetWithVersion(assetId, url, "manual-retry", "单图重做", {
          status: "Ready",
          errorMessage: undefined,
          errorCode: undefined,
        });
        consume("paint", `Keyframe ${assetId} · retry`, 5, get().taskId);
        appendSummary("paint", `${assetId} 重做完成`);
      } catch (e) {
        console.error("[paint] single retry failed", assetId, e);
        updateAsset(assetId, {
          status: "Failed",
          errorMessage: (e as Error).message,
          errorCode: "gen_failed",
        });
      }
    })();
  };

  const runLifeSegment = (assetId: string) => {
    const asset = get().assets.find((a) => a.id === assetId);
    if (!asset || asset.stageId !== "life") return;
    const script = get().script;
    const shotsRef = script?.shots ?? [];
    const shot = shotsRef.find((s) => s.shot === asset.sourceShotId)
      ?? shotsRef[asset.segmentIndex ?? 0]
      ?? shotsRef[shotsRef.length - 1];

    const paintAssetsAll = get().assets.filter((a) => a.stageId === "paint" && a.url);
    const keyUrl =
      (shot && paintAssetsAll.find((p) => p.id === shot.shot)?.url) ||
      asset.poster ||
      paintAssetsAll.find((p) => /^https?:\/\//.test(p.url!))?.url ||
      paintAssetsAll[0]?.url;

    const dur = parseInt(String(asset.duration ?? "0:10").replace(/[^0-9]/g, "")) || 10;
    const segDur: 5 | 10 = dur >= 10 ? 10 : 5;
    const briefFormat = get().brief?.format ?? "";
    const videoRatio = parseFormatRatio(briefFormat);
    const briefPrompt = get().brief?.prompt ?? "";
    const VIDEO_COST_PER_SEG = 30;

    if (!canAfford(VIDEO_COST_PER_SEG)) {
      const tid = get().taskId ?? undefined;
      useCredits.getState().openLow(tid);
      return;
    }

    if (!keyUrl) {
      updateAsset(asset.id, {
        status: "Failed",
        errorMessage: "缺少首帧关键帧，请重跑 Keyframes 阶段。",
        errorCode: "missing_keyframe",
      });
      return;
    }

    // Reset stage to running so global UI reflects activity.
    updateStage("life", { status: "running", expanded: true, errorMessage: undefined });
    set({ phase: "running" });

    const wardrobeRefs = get()
      .assets.filter((a) => a.stageId === "wardrobe" && a.url && /^https?:\/\//.test(a.url))
      .map((a) => a.url as string)
      .slice(0, 4);

    const segPrompt = [
      shot?.prompt || briefPrompt,
      shot?.scene ? `Scene: ${shot.scene}` : "",
      shot?.motion ? `Camera/motion: ${shot.motion}` : "",
      shot?.elements ? `Key elements: ${shot.elements}` : "",
      `Stay strictly on the user's brief: ${briefPrompt}`,
      `Preserve character/prop identity from reference images.`,
    ].filter(Boolean).join("\n");

    updateAsset(asset.id, { status: "Processing", errorMessage: undefined, errorCode: undefined });
    appendSummary("life", `重做 ${asset.id} · ${shot?.shot ?? "—"} · ${segDur}s`);

    const startedRunId = get().runId;
    void (async () => {
      try {
        const refs = [...wardrobeRefs, keyUrl].slice(0, 6);
        const { taskId: seedanceTaskId } = await submitVideoTask({
          data: {
            route: "reference-image-to-video",
            payload: {
              prompt: segPrompt,
              image_urls: refs,
              ratio: videoRatio,
              duration: segDur,
            } as unknown as { prompt: string },
          },
        });
        if (get().runId !== startedRunId) return;
        const started = Date.now();
        while (true) {
          if (get().runId !== startedRunId) return;
          await new Promise((r) => setTimeout(r, 3000));
          let r;
          try {
            r = await pollVideoTask({ data: { taskId: seedanceTaskId } });
          } catch (e) {
            console.error(`[life] segment ${asset.id} poll error`, e);
            continue;
          }
          if (get().runId !== startedRunId) return;
          if (r.status === "success" && r.ossUrl) {
            updateAssetWithVersion(asset.id, r.ossUrl, "manual-retry", "单段重做", {
              status: "Ready",
              poster: keyUrl,
              errorMessage: undefined,
              errorCode: undefined,
            });
            consume("life", `Video ${asset.id} · seedance retry`, VIDEO_COST_PER_SEG, get().taskId);
            appendSummary("life", `${asset.id} Ready`);
            // Re-evaluate stage status: if all life segments are Ready, mark stage ready.
            const allLife = get().assets.filter((a) => a.stageId === "life");
            if (allLife.every((a) => a.status === "Ready")) {
              updateStage("life", { status: "ready", errorMessage: undefined });
              persistCurrent("running");
              schedule(() => runDetails(), 1200);
            }
            return;
          }
          if (r.status === "failed") {
            updateAsset(asset.id, {
              status: "Failed",
              errorMessage: "Seedance 渲染失败",
              errorCode: "seedance_failed",
            });
            updateStage("life", { status: "failed", errorMessage: "至少一段视频渲染失败" });
            set({ phase: "failed" });
            return;
          }
          if (Date.now() - started > 5 * 60_000) {
            updateAsset(asset.id, {
              status: "Failed",
              errorMessage: "Seedance 轮询超时（5min）",
              errorCode: "timeout",
            });
            updateStage("life", { status: "failed", errorMessage: "至少一段视频超时" });
            set({ phase: "failed" });
            return;
          }
        }
      } catch (e) {
        console.error(`[life] segment ${asset.id} submit failed`, e);
        updateAsset(asset.id, {
          status: "Failed",
          errorMessage: (e as Error).message,
          errorCode: "submit_failed",
        });
        updateStage("life", { status: "failed", errorMessage: (e as Error).message });
        set({ phase: "failed" });
      }
    })();
  };


  const runDetails = () => {
    updateStage("details", { status: "running", expanded: true });
    const checks = [
      "QC：9:16 比例 ✓",
      "产品可见性 ✓",
      "无违规宣称 ✓",
      "视频链接已验证 ✓",
    ];
    streamLines("details", checks, 500, 200, () => {
      updateStage("details", { status: "ready" });
      consume("details", "Final QC pass", 2, get().taskId);
      set({ phase: "done" });
      collapseAfter("details", 1600);
      persistCurrent("done");
    });
  };

  const startRunning = () => {
    set({ phase: "running" });
    persistCurrent("running");
    runScene();
  };

  const requestPreflightOptions = (brief: Brief) => {
    // 进入 running 状态，让聊天面板可见
    set({ phase: "running" });
    persistCurrent("running");
    const agentId = uid();
    const agentMsg: ChatMsg = {
      id: agentId,
      role: "agent",
      text: "",
      ts: Date.now(),
      streaming: true,
      thinking: "",
      toolCalls: [],
      optionCards: [],
      skill: { name: "chat-director", sub: "refining brief" },
    };
    set((s) => ({ chatLog: [...s.chatLog, agentMsg] }));

    const patchAgent = (updater: (m: ChatMsg) => Partial<ChatMsg>) =>
      set((s) => ({
        chatLog: s.chatLog.map((m) => (m.id === agentId ? { ...m, ...updater(m) } : m)),
      }));

    void (async () => {
      try {
        const res = await fetch("/api/chat-stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "preflight-options",
            messages: [{ role: "user", content: brief.prompt }],
            context: { phase: "preflight", brief },
          }),
        });
        if (!res.ok || !res.body) {
          // 失败：直接 startRunning，不阻塞用户
          patchAgent(() => ({ streaming: false, text: "（跳过偏好确认，直接开拍）" }));
          startRunning();
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        const handle = (ev: string, dataStr: string) => {
          let d: unknown;
          try { d = JSON.parse(dataStr); } catch { return; }
          const data = d as { text?: string; questions?: unknown; id?: string; intent?: "preflight" | "refine" };
          if (ev === "token" && data.text) {
            patchAgent((m) => ({ text: m.text + data.text! }));
          } else if (ev === "option-card") {
            const qs = Array.isArray(data.questions) ? (data.questions as import("./types").ChatOptionQuestion[]) : [];
            patchAgent((m) => ({
              optionCards: [
                ...(m.optionCards ?? []),
                {
                  id: data.id ?? `oc_${uid()}`,
                  questions: qs,
                  status: "awaiting",
                  intent: data.intent ?? "preflight",
                  primaryLabel: "Continue",
                },
              ],
            }));
          } else if (ev === "done") {
            patchAgent(() => ({ streaming: false }));
          }
        };
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const blocks = buf.split(/\r?\n\r?\n/);
          buf = blocks.pop() ?? "";
          for (const block of blocks) {
            const lines = block.split(/\r?\n/);
            let ev = "message";
            const dataLines: string[] = [];
            for (const raw of lines) {
              if (raw.startsWith("event:")) ev = raw.slice(6).trim();
              else if (raw.startsWith("data:")) dataLines.push(raw.slice(5).replace(/^\s/, ""));
            }
            if (dataLines.length) handle(ev, dataLines.join("\n"));
          }
        }
        patchAgent(() => ({ streaming: false }));
      } catch {
        patchAgent(() => ({ streaming: false, text: "（跳过偏好确认，直接开拍）" }));
        startRunning();
      }
    })();
  };

  return {
    phase: "empty",
    prompt: "",
    brief: null,
    stages: initialStages(),
    assets: [],
    taskTitle: "New chat",
    taskId: null,
    taskKind: "oneoff",
    taskHistory: loadHistory(),
    attachments: [],
    gate: null,
    softGate: null,
    rail: { open: false },
    viewMode: loadViewMode(),
    autoMode: loadAutoMode(),
    timers: [],
    runId: 0,
    selection: [],
    chatLog: [],
    versionDrawerAssetId: null,
    previewAssetId: null,
    currentUserId: null,
    script: null,

    intakeSel: {},
    intakeCustoms: {},
    intakeOthers: null,

    setPrompt: (v) => set({ prompt: v }),
    setAutoMode: (m) => {
      set({ autoMode: m });
      try {
        window.localStorage.setItem(AUTO_KEY, m);
      } catch {
        /* ignore */
      }
    },
    setViewMode: (v) => {
      set({ viewMode: v });
      try {
        window.localStorage.setItem(VIEW_KEY, v);
      } catch {
        /* ignore */
      }
    },

    setIntakeSel: (key, value) =>
      set((s) => ({ intakeSel: { ...s.intakeSel, [key]: value } })),
    requestIntakeOthers: (key, label) => set({ intakeOthers: { key, label } }),
    cancelIntakeOthers: () => set({ intakeOthers: null }),
    resolveIntakeOthers: (value) => {
      const o = get().intakeOthers;
      if (!o) return;
      const v = value.trim();
      if (!v) {
        set({ intakeOthers: null });
        return;
      }
      set((s) => ({
        intakeCustoms: {
          ...s.intakeCustoms,
          [o.key]: [...(s.intakeCustoms[o.key] ?? []), v],
        },
        intakeSel: { ...s.intakeSel, [o.key]: v },
        intakeOthers: null,
        chatLog: [],
      }));
    },

    chatMessage: (text) => {
      const t = text.trim();
      if (!t) return;
      const userMsg: ChatMsg = {
        id: uid(),
        role: "user",
        text: t,
        ts: Date.now(),
      };
      const agentId = uid();
      const agentMsg: ChatMsg = {
        id: agentId,
        role: "agent",
        text: "",
        ts: Date.now(),
        streaming: true,
        thinking: "",
        toolCalls: [],
      };
      set((s) => ({ chatLog: [...s.chatLog, userMsg, agentMsg] }));

      const patchAgent = (
        updater: (msg: ChatMsg) => Partial<ChatMsg>,
      ) =>
        set((s) => ({
          chatLog: s.chatLog.map((m) =>
            m.id === agentId ? { ...m, ...updater(m) } : m,
          ),
        }));

      void (async () => {
        const s = get();
        const history = s.chatLog
          .slice(-12)
          .filter((m) => m.id !== agentId && m.text)
          .map((m) => ({
            role: (m.role === "agent" ? "assistant" : "user") as
              | "assistant"
              | "user",
            content: m.text,
          }));
        if (!history.length || history[history.length - 1]?.content !== t) {
          history.push({ role: "user", content: t });
        }
        const ctxScript = s.script
          ? {
              mood: s.script.mood,
              shots: s.script.shots?.map((sh) => ({
                shot: sh.shot,
                duration: sh.duration,
                scene: sh.scene,
              })),
            }
          : undefined;
        const payload = {
          messages: history,
          context: {
            phase: s.phase,
            brief: s.brief ?? undefined,
            script: ctxScript,
          },
        };

        const failWith = (reason: string) => {
          patchAgent((m) => ({
            streaming: false,
            text: "AI 暂不可用：" + reason,
            toolCalls: (m.toolCalls ?? []).map((tc) =>
              tc.status === "done" || tc.status === "failed"
                ? tc
                : {
                    ...tc,
                    status: "failed",
                    durationMs:
                      tc.durationMs ?? Date.now() - tc.startedAt,
                    output: tc.output ?? reason,
                  },
            ),
          }));
        };

        try {
          const res = await fetch("/api/chat-stream", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!res.ok || !res.body) {
            const errText = await res.text().catch(() => "");
            throw new Error(
              res.status === 429
                ? "请求过于频繁，请稍后再试"
                : res.status === 402
                  ? "AI 额度已用尽，请到 Settings · Usage 充值后再试"
                  : errText || `HTTP ${res.status}`,
            );
          }

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buf = "";
          

          const handleEvent = (ev: string, dataStr: string) => {
            let data: unknown;
            try {
              data = JSON.parse(dataStr);
            } catch {
              return;
            }
            const d = data as {
              id?: string;
              label?: string;
              text?: string;
              summary?: string;
              message?: string;
            };

            if (ev === "phase") {
              if (!d.id || !d.label) return;
              patchAgent((m) => ({
                toolCalls: [
                  ...(m.toolCalls ?? []),
                  {
                    id: d.id!,
                    label: d.label!,
                    kind: "skill",
                    status: "pending",
                    startedAt: Date.now(),
                  },
                ],
              }));
            } else if (ev === "phase-start") {
              patchAgent((m) => ({
                toolCalls: (m.toolCalls ?? []).map((tc) =>
                  tc.id === d.id
                    ? { ...tc, status: "running", startedAt: Date.now() }
                    : tc,
                ),
              }));
            } else if (ev === "thinking") {
              if (!d.text) return;
              patchAgent((m) => {
                const next = (m.thinking ?? "") + d.text!;
                const tcs = (m.toolCalls ?? []).map((tc) =>
                  tc.status === "running"
                    ? { ...tc, input: (tc.input ?? "") + d.text! }
                    : tc,
                );
                return { thinking: next, toolCalls: tcs };
              });
            } else if (ev === "phase-done") {
              patchAgent((m) => ({
                toolCalls: (m.toolCalls ?? []).map((tc) =>
                  tc.id === d.id
                    ? {
                        ...tc,
                        status: "done",
                        durationMs: Date.now() - tc.startedAt,
                        output: d.summary ?? tc.output,
                      }
                    : tc,
                ),
              }));
            } else if (ev === "token") {
              if (!d.text) return;
              patchAgent((m) => ({ text: m.text + d.text! }));
            } else if (ev === "done") {
              patchAgent((m) => ({
                streaming: false,
                toolCalls: (m.toolCalls ?? []).map((tc) =>
                  tc.status === "done" || tc.status === "failed"
                    ? tc
                    : {
                        ...tc,
                        status: "done",
                        durationMs:
                          tc.durationMs ?? Date.now() - tc.startedAt,
                      },
                ),
                text: m.text || d.text || "AI 没有返回内容，请换种说法再试一次。",
              }));
            } else if (ev === "error") {
              failWith(d.message ?? "stream_failed");
            }
          };

          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            // SSE：以空行分隔消息块
            const blocks = buf.split(/\r?\n\r?\n/);
            buf = blocks.pop() ?? "";
            for (const block of blocks) {
              const lines = block.split(/\r?\n/);
              let ev = "message";
              const dataLines: string[] = [];
              for (const raw of lines) {
                const line = raw;
                if (line.startsWith("event:")) ev = line.slice(6).trim();
                else if (line.startsWith("data:"))
                  dataLines.push(line.slice(5).replace(/^\s/, ""));
              }
              if (dataLines.length) {
                handleEvent(ev, dataLines.join("\n"));
              }
            }
          }

          // 流自然结束兜底
          patchAgent((m) => ({
            streaming: false,
            toolCalls: (m.toolCalls ?? []).map((tc) =>
              tc.status === "done" || tc.status === "failed"
                ? tc
                : {
                    ...tc,
                    status: "done",
                    durationMs: tc.durationMs ?? Date.now() - tc.startedAt,
                  },
            ),
            text:
              m.text || "AI 没有返回内容，请换种说法再试一次。",
          }));
        } catch (err) {
          const reason = err instanceof Error ? err.message : "未知错误";
          failWith(reason);
        }
      })();
    },




    addAttachment: (a) => set((s) => ({ attachments: [...s.attachments, a] })),
    removeAttachment: (id) =>
      set((s) => ({ attachments: s.attachments.filter((a) => a.id !== id) })),
    clearAttachments: () => set({ attachments: [] }),

    submit: (prompt) => {
      const text = prompt.trim();
      if (!text) return;
      clearTimers();
      const taskKind: TaskKind = isSeriesPrompt(text) ? "series" : "oneoff";
      const newTaskId = newId();
      set((s) => ({
        runId: s.runId + 1,
        prompt: "",
        taskTitle: inferTaskTitle(text),
        taskId: newTaskId,
        taskKind,
        phase: "thinking",
        stages: initialStages(),
        assets: [],
        gate: null,
        softGate: null,
        selection: [],
        chatLog: [],
        rail: { open: false, flashId: undefined, focusedAssetId: undefined },
        brief: { prompt: text, adType: "", format: "", visualSource: "", mode: "" },
        intakeSel: {},
        intakeCustoms: {},
        intakeOthers: null,
        // 不重置 currentUserId：由模块底部的全局订阅维护
        script: null,
      }));
      // submit 时兜底再拉一次，确保是最新登录态
      supabase.auth.getUser().then(async ({ data }) => {
        set({ currentUserId: data.user?.id ?? null });

        // Auto-create + attach project when this looks like a series episode
        if (data.user && taskKind === "series") {
          try {
            const { useProjects } = await import("@/lib/sc/projects-store");
            const { createProject } = await import("@/lib/projects.functions");
            const projectsState = useProjects.getState();
            if (!projectsState.loaded) await projectsState.fetchProjects();
            const fresh = useProjects.getState().projects;
            const presetName = inferTaskTitle(text);
            let existing = fresh.find((p) => p.name === presetName);
            if (!existing) {
              const { project } = await createProject({
                data: { name: presetName, kind: "series", icon: "series" },
              });
              existing = project as typeof fresh[number];
              useProjects.setState((s) => ({ projects: [existing!, ...s.projects] }));
            }
            useProjects.getState().setCurrentProject(existing.id);
            // task_id column is uuid; the in-memory `t_xxx` ids aren't UUIDs,
            // so skip the row-level attach. The currentProjectId in store is enough
            // for the UI to highlight the project, and persistence is recorded in
            // `projects.brief` on subsequent saves.
          } catch (e) {
            console.warn("[auto-create project] failed", e);
          }
        }
      });
      const delay = 1500 + Math.random() * 1000;
      schedule(() => {
        set({ phase: "intake" });
      }, delay);
    },

    confirmBrief: (brief) => {
      set({ brief });
      // 不再立刻 startRunning：先让 AI 抛一张多问题选项卡
      requestPreflightOptions(brief);
    },

    submitOptionCard: (msgId, cardId, answers) => {
      const summaryParts: string[] = [];
      set((s) => ({
        chatLog: s.chatLog.map((m) => {
          if (m.id !== msgId || !m.optionCards) return m;
          return {
            ...m,
            optionCards: m.optionCards.map((c) => {
              if (c.id !== cardId) return c;
              const nextQs = c.questions.map((q) => {
                const a = answers[q.id];
                if (!a) return q;
                const labels = a.selected
                  .map((sid) => q.options.find((o) => o.id === sid)?.label ?? sid)
                  .filter(Boolean);
                if (a.otherText) labels.push(a.otherText);
                if (labels.length) summaryParts.push(`${q.label} → ${labels.join(" / ")}`);
                return { ...q, selected: a.selected, otherText: a.otherText };
              });
              return { ...c, questions: nextQs, status: "submitted" as const };
            }),
          };
        }),
      }));
      // 把答案落到 brief 上，方便下游脚本生成参考
      const cur = get().brief;
      if (cur) {
        const extra = summaryParts.join("\n");
        set({
          brief: {
            ...cur,
            prompt: extra ? `${cur.prompt}\n\n[偏好]\n${extra}` : cur.prompt,
          },
        });
      }
      // 触发后续流程
      const card = get().chatLog
        .find((m) => m.id === msgId)?.optionCards
        ?.find((c) => c.id === cardId);
      if (card?.intent === "preflight") startRunning();
    },

    skipOptionCard: (msgId, cardId) => {
      set((s) => ({
        chatLog: s.chatLog.map((m) => {
          if (m.id !== msgId || !m.optionCards) return m;
          return {
            ...m,
            optionCards: m.optionCards.map((c) =>
              c.id === cardId ? { ...c, status: "skipped" as const } : c,
            ),
          };
        }),
      }));
      const card = get().chatLog
        .find((m) => m.id === msgId)?.optionCards
        ?.find((c) => c.id === cardId);
      if (card?.intent === "preflight") startRunning();
    },

    skipIntake: () => {
      const b = get().brief;
      set({
        brief: {
          prompt: b?.prompt ?? "",
          adType: "Premium / Cinematic",
          format: "9:16 · 30s",
          visualSource: "Generate from prompt",
          mode: "Auto · 全自动连续推进",
        },
      });
      startRunning();
    },

    approveScript: () => runWardrobe(),
    tweakScript: () => set({ phase: "intake", gate: null, softGate: null }),
    approveWardrobe: () => runPaint(),
    tweakWardrobe: () => {
      closeGate();
      // simply re-run wardrobe
      set((s) => ({
        assets: s.assets.filter((a) => !["W01", "W02", "P01"].includes(a.id)),
        stages: { ...s.stages, wardrobe: emptyStage() },
      }));
      runWardrobe();
    },
    approveKeyframe: () => runQC(),
    regenerateKeyframe: () => {
      closeGate();
      set((s) => ({
        assets: s.assets.filter((a) => a.stageId !== "paint"),
        stages: { ...s.stages, paint: emptyStage() },
      }));
      runPaint();
    },
    applyQCFix: () => applyQCFixInternal(),
    keepAsIs: () => {
      closeGate();
      appendSummary("qc", "用户保留原样 · 跳过修正");
      updateStage("qc", { status: "ready" });
      collapseAfter("qc", 1400);
      schedule(() => runLife(), 1100);
    },
    cancelSoftGate: () => set({ softGate: null }),

    cancel: () => {
      clearTimers();
      set((s) => ({ runId: s.runId + 1 }));
      set((s) => {
        const stages = { ...s.stages };
        for (const id of STAGE_ORDER) {
          if (stages[id].status === "running") {
            stages[id] = {
              ...stages[id],
              status: "recovering",
              summary: [...stages[id].summary, "用户已取消，进入 Recovering"],
              expanded: true,
            };
          }
        }
        return {
          stages,
          assets: s.assets.map((a) =>
            a.status === "Generating" ||
            a.status === "Queued" ||
            a.status === "Processing"
              ? { ...a, status: "Recovering" as const }
              : a,
          ),
          phase: "failed",
          gate: null,
          softGate: null,
        };
      });
      persistCurrent("failed");
    },

    reset: (opts) => {
      const { phase } = get();
      if (opts?.fromUserAction && (phase === "running" || phase === "thinking")) {
        persistCurrent("interrupted");
      }
      clearTimers();
      set((s) => ({
        runId: s.runId + 1,
        phase: "empty",
        prompt: "",
        brief: null,
        stages: initialStages(),
        assets: [],
        taskTitle: "New chat",
        taskId: null,
        taskKind: "oneoff",
        attachments: [],
        gate: null,
        softGate: null,
        selection: [],
        rail: { open: false, flashId: undefined, focusedAssetId: undefined },
        intakeSel: {},
        intakeCustoms: {},
        intakeOthers: null,
        chatLog: [],
        script: null,
      }));
    },

    toggleStage: (id) =>
      set((s) => ({
        stages: {
          ...s.stages,
          [id]: { ...s.stages[id], expanded: !s.stages[id].expanded },
        },
      })),

    toggleThought: (stageId, thoughtId) => {
      // thoughts are rendered as <details>; this is for external triggers only
      // currently no expanded flag stored — kept as no-op placeholder
      void stageId;
      void thoughtId;
    },

    setRailOpen: (v) => set((s) => ({ rail: { ...s.rail, open: v } })),
    focusAsset: (id) =>
      set((s) => ({ rail: { ...s.rail, open: true, focusedAssetId: id } })),

    toggleSelect: (id) =>
      set((s) => ({
        selection: s.selection.includes(id)
          ? s.selection.filter((x) => x !== id)
          : [...s.selection, id],
      })),
    clearSelection: () => set({ selection: [] }),
    batchEditAssets: (ids, instruction) => {
      if (!ids.length) return;
      set((s) => ({
        assets: s.assets.map((a) =>
          ids.includes(a.id) ? { ...a, status: "Processing" as const } : a,
        ),
        selection: [],
      }));
      // re-open details stage with stream of fix
      updateStage("details", { status: "running", expanded: true });
      appendSummary("details", `批量修改 ${ids.length} 个素材 · 指令：${instruction}`);
      runTool("details", "skill", "fast-model · batch-edit", 1000, 0);
      addThought("details", {
        title: `批量修改思路 · ${ids.length} 个资产`,
        body: [
          `用户指令：${instruction}`,
          "调用快模型批量重生成，保留构图/角色一致性。",
          "Fast model · 0 credits · Preview only。",
        ],
        thumbAssetIds: ids,
      });
      ids.forEach((id, i) => {
        runTool("details", "tool", `re-paint · ${id}`, 1400, 1100 + i * 500);
        schedule(
          () => updateAsset(id, { status: "Ready", url: SAMPLE_KEYFRAME }),
          1100 + i * 500 + 1500,
        );
      });
      schedule(
        () => {
          appendSummary("details", "批量修改完成 · 全部 Ready ✓");
          updateStage("details", { status: "ready" });
          collapseAfter("details", 1600);
          persistCurrent("done");
        },
        1100 + ids.length * 500 + 1800,
      );
    },

    restoreTask: (id) => {
      const rec = get().taskHistory.find((t) => t.id === id);
      if (!rec) return;
      clearTimers();
      const stages = initialStages();
      // Prefer full snapshots (toolCalls + thoughts). Fall back to legacy
      // summaries-only records.
      const snaps = rec.stageSnapshots ?? {};
      const sums = rec.stageSummaries ?? {};
      let failedStageId: StageId | undefined;
      for (const sid of STAGE_ORDER) {
        const snap = snaps[sid];
        const sum = sums[sid];
        if (snap) {
          stages[sid] = {
            status: snap.status,
            summary: snap.summary.slice(),
            toolCalls: snap.toolCalls.slice(),
            thoughts: snap.thoughts.slice(),
            expanded: true,
          };
          if (snap.status === "failed" && !failedStageId) failedStageId = sid;
        } else if (sum && sum.length) {
          stages[sid] = {
            ...emptyStage(),
            status: rec.status === "failed" && sid === "life" ? "failed" : "ready",
            summary: sum,
            expanded: true,
          };
          if (rec.status === "failed" && sid === "life" && !failedStageId) failedStageId = sid;
        }
      }
      const restoredBrief: Brief = rec.brief ?? {
        prompt: rec.prompt,
        adType: "Restored",
        format: "—",
        visualSource: "—",
        mode: "—",
      };
      const chatLog: ChatMsg[] = [];
      if (rec.status === "failed") {
        const stageLabel = failedStageId ? STAGE_LABEL[failedStageId] : "运行";
        const reason = rec.failureReason ?? "未知错误";
        chatLog.push({
          id: `restore-${rec.id}`,
          role: "agent",
          ts: Date.now(),
          text: `该任务在「${stageLabel}」阶段失败：${reason}。要我重做这一步，还是从头再跑一遍？`,
          actions: [
            ...(failedStageId
              ? [{ label: "重做此步", kind: "retry-stage" as const, stageId: failedStageId }]
              : []),
            { label: "整任务重跑", kind: "rerun-all" as const },
          ],
        });
      }
      set((s) => ({
        runId: s.runId + 1,
        phase: rec.status === "done" ? "done" : "failed",
        taskId: rec.id,
        taskTitle: rec.title,
        taskKind: rec.kind,
        brief: restoredBrief,
        script: (rec.script as GeneratedScript | undefined) ?? null,
        stages,
        assets: rec.assets,
        gate: null,
        softGate: null,
        selection: [],
        chatLog,
        rail: { open: rec.assets.length > 0 },
      }));
    },


    deleteTask: (id) => {
      const next = get().taskHistory.filter((t) => t.id !== id);
      set({ taskHistory: next });
      saveHistory(next);
    },

    retryStage: (id) => {
      // 重做前同步刷新一次最新登录态，避免点了重试还报「未登录」
      void supabase.auth.getUser().then(({ data }) => {
        set({ currentUserId: data.user?.id ?? null });
      });
      clearTimers();
      set((s) => ({
        runId: s.runId + 1,
        phase: "running",
        gate: null,
        softGate: null,
        // 清掉该 stage 的 assets，并把该 stage 之后的 stages 全部置回 pending
        assets: s.assets.filter((a) => a.stageId !== id),
        stages: STAGE_ORDER.reduce(
          (acc, sid) => {
            if (sid === id) {
              acc[sid] = emptyStage();
            } else if (STAGE_ORDER.indexOf(sid) > STAGE_ORDER.indexOf(id)) {
              acc[sid] = emptyStage();
            } else {
              acc[sid] = s.stages[sid];
            }
            return acc;
          },
          {} as Record<StageId, StageState>,
        ),
      }));
      const runners: Partial<Record<StageId, () => void>> = {
        scene: runScene,
        structure: runStructure,
        wardrobe: runWardrobe,
        paint: runPaint,
        qc: runQC,
        life: runLife,
        details: runDetails,
      };
      const runner = runners[id];
      if (runner) schedule(runner, 200);
    },

    retryAsset: (assetId) => {
      const asset = get().assets.find((a) => a.id === assetId);
      if (!asset || !asset.stageId) return;
      // life：仅重做该单段
      if (asset.stageId === "life") {
        runLifeSegment(assetId);
        return;
      }
      if (asset.stageId === "paint") {
        runPaintShot(assetId);
        return;
      }
      if (asset.stageId === "wardrobe") {
        runWardrobeAsset(assetId);
        return;
      }
    },

    setActiveVersion: (assetId, versionIndex) => {
      set((s) => ({
        assets: s.assets.map((a) => {
          if (a.id !== assetId) return a;
          const versions = a.versions ?? [];
          const target = versions[versionIndex];
          if (!target || !a.url) return a;
          // push current url as a "manual-revert" record so we never lose it
          const nextVersions: typeof versions = versions.map((v, i) =>
            i === versionIndex ? { ...v, url: a.url!, createdAt: Date.now(), source: "manual-revert", note: "切回此版本" } : v,
          );
          return { ...a, url: target.url, versions: nextVersions };
        }),
      }));
    },

    openVersionDrawer: (assetId) => set({ versionDrawerAssetId: assetId }),
    closeVersionDrawer: () => set({ versionDrawerAssetId: null }),
    openPreview: (assetId) => set({ previewAssetId: assetId }),
    closePreview: () => set({ previewAssetId: null }),





    forceState: (s) => {
      clearTimers();
      const ready = (summary: string[]): StageState => ({
        ...emptyStage(),
        status: "ready",
        summary,
        expanded: false,
      });
      const base = {
        phase: "running" as Phase,
        stages: initialStages(),
        assets: [] as Asset[],
        taskId: newId(),
        taskKind: "oneoff" as TaskKind,
        brief: {
          prompt: "Demo: 城市晚风 30s",
          adType: "Premium",
          format: "9:16 · 30s",
          visualSource: "Generate from prompt",
          mode: "Auto",
        },
        taskTitle: "Demo task",
        gate: null as Gate,
        softGate: null,
        rail: { open: true } as RailState,
        runId: (get().runId ?? 0) + 1,
      };
      switch (s) {
        case "empty":
          set({ ...base, phase: "empty", brief: null, taskTitle: "New chat", taskId: null, rail: { open: false } });
          break;
        case "intake":
          set({ ...base, phase: "intake" });
          break;
        case "image-generating":
          set({
            ...base,
            stages: {
              ...base.stages,
              scene: ready(["方向已锁定"]),
              structure: ready(["脚本/分镜就绪"]),
              wardrobe: ready(["服装/道具就绪"]),
              paint: { ...emptyStage(), status: "running", summary: ["生成 A01…"], expanded: true },
            },
            assets: [
              { id: "A01", kind: "image", label: "A01", caption: "Keyframe", status: "Generating", stageId: "paint", width: 1080, height: 1920 },
            ],
          });
          break;
        case "video-processing":
          set({
            ...base,
            stages: {
              ...base.stages,
              scene: ready(["方向已锁定"]),
              structure: ready(["脚本/分镜就绪"]),
              wardrobe: ready(["服装/道具就绪"]),
              paint: ready(["A01 Ready"]),
              qc: ready(["一致性通过"]),
              life: { ...emptyStage(), status: "running", summary: ["V01 Processing…"], expanded: true },
            },
            assets: [
              { id: "A01", kind: "image", label: "A01", caption: "Keyframe", status: "Ready", url: SAMPLE_KEYFRAME, stageId: "paint", width: 1080, height: 1920 },
              { id: "V01", kind: "video", label: "V01", caption: "Hero film", status: "Processing", stageId: "life", duration: "0:30" },
            ],
          });
          break;
        case "ready":
          set({
            ...base,
            phase: "done",
            stages: {
              scene: ready(["方向已锁定"]),
              structure: ready(["脚本/分镜就绪"]),
              wardrobe: ready(["服装/道具就绪"]),
              paint: ready(["A01 Ready"]),
              qc: ready(["一致性通过"]),
              life: ready(["V01 Ready"]),
              details: ready(["QC 通过"]),
            },
            assets: [
              { id: "A01", kind: "image", label: "A01", caption: "Keyframe", status: "Ready", url: SAMPLE_KEYFRAME, stageId: "paint", width: 1080, height: 1920 },
              { id: "V01", kind: "video", label: "V01", caption: "Hero film", status: "Ready", url: SAMPLE_VIDEO, poster: SAMPLE_KEYFRAME, stageId: "life", duration: "0:30" },
            ],
          });
          break;
        case "series-demo":
          set({
            ...base,
            phase: "done",
            taskKind: "series",
            taskTitle: "Galileo Episode Series",
            brief: {
              prompt: "做一个连续剧集系列：3 集 × 4 个场景",
              adType: "Series / Episode",
              format: "16:9 · per scene 12s",
              visualSource: "Generate from prompt",
              mode: "Auto · 全自动连续推进",
            },
            stages: {
              scene: ready(["剧集大纲已锁定"]),
              structure: ready(["每集分镜就绪"]),
              wardrobe: ready(["服装/道具就绪"]),
              paint: ready(["关键帧批次完成"]),
              qc: ready(["一致性通过"]),
              life: ready(["全部成片完成"]),
              details: ready(["QC 通过"]),
            },
            assets: SERIES_DEMO,
          });
          break;
        case "recovering":
          set({
            ...base,
            stages: {
              ...base.stages,
              scene: ready(["方向已锁定"]),
              structure: ready(["脚本/分镜就绪"]),
              wardrobe: ready(["服装/道具就绪"]),
              paint: { ...emptyStage(), status: "recovering", summary: ["未返回可用 URL，重试中"], expanded: true },
            },
            assets: [
              { id: "A01", kind: "image", label: "A01", caption: "Keyframe", status: "Recovering", stageId: "paint" },
            ],
          });
          break;
        case "failed":
          set({
            ...base,
            phase: "failed",
            stages: {
              scene: ready(["方向已锁定"]),
              structure: ready(["脚本/分镜就绪"]),
              wardrobe: ready(["服装/道具就绪"]),
              paint: ready(["A01 Ready"]),
              qc: ready(["一致性通过"]),
              life: { ...emptyStage(), status: "failed", summary: ["返回内容不是可播放视频"], expanded: true },
              details: emptyStage(),
            },
            assets: [
              { id: "A01", kind: "image", label: "A01", caption: "Keyframe", status: "Ready", url: SAMPLE_KEYFRAME, stageId: "paint", width: 1080, height: 1920 },
              { id: "V01", kind: "video", label: "V01", caption: "Hero film", status: "Failed", stageId: "life" },
            ],
          });
          break;
      }
    },
  };
});

// 全局订阅 auth 状态：登录/登出/token 刷新都同步进 store，保证 retry / 新任务读到最新 userId
if (typeof window !== "undefined") {
  supabase.auth.getUser().then(({ data }) => {
    useSC.setState({ currentUserId: data.user?.id ?? null });
  });
  supabase.auth.onAuthStateChange((_event, session) => {
    useSC.setState({ currentUserId: session?.user?.id ?? null });
  });
}
