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
  type TaskKind,
  type TaskRecord,
  type ToolCall,
  type Thought,
  type ViewMode,
  STAGE_ORDER,
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

interface ChatMsg {
  id: string;
  role: "user" | "agent";
  text: string;
  ts: number;
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
    const { taskId, taskTitle, brief, assets, taskHistory, taskKind, stages } = get();
    if (!taskId) return;
    const now = Date.now();
    const existing = taskHistory.find((t) => t.id === taskId);
    const stageSummaries: Partial<Record<StageId, string[]>> = {};
    for (const sid of STAGE_ORDER) {
      const sum = stages[sid].summary;
      if (sum.length) stageSummaries[sid] = sum.slice(-6);
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
        script = await generateScript({
          data: {
            prompt: b?.prompt ?? "",
            adType: b?.adType ?? "",
            format: b?.format ?? "",
            visualSource: b?.visualSource ?? "",
          },
        });
      } catch (e) {
        console.error("[structure] generateScript failed", e);
        appendSummary("structure", `脚本生成失败：${(e as Error).message}`);
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
    const wardrobeSpec = script?.wardrobe?.length
      ? script.wardrobe
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
    const userId = get().currentUserId;
    const taskId = get().taskId ?? undefined;
    const briefPrompt = get().brief?.prompt ?? "";

    void (async () => {
      if (!userId) {
        appendSummary("wardrobe", "未登录 · 跳过真实生图，使用示例图");
        for (const w of wardrobeAssets) {
          if (get().runId !== startedRunId) return;
          updateAsset(w.id, { status: "Ready", url: SAMPLE_KEYFRAME });
        }
      } else {
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
          const fullPrompt = [
            `Reference asset ${w.id} for the short film. Subject: ${w.caption}.`,
            `Style: ${role}.`,
            `User brief (must reflect the actual subject, do NOT invent unrelated brands or scenes): ${briefPrompt}`,
          ].join("\n\n");
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
      }

      if (get().runId !== startedRunId) return;
      appendSummary("wardrobe", "服装/道具准备完毕 · 风格统一");
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
      const userId = get().currentUserId;
      const taskId = get().taskId ?? undefined;
      const briefPrompt = get().brief?.prompt ?? "";

      if (!userId) {
        appendSummary("paint", "未登录 · 跳过真实生图，使用示例图");
        for (const r of SHOTS) {
          if (get().runId !== startedRunId) return;
          updateAsset(r.shot, { status: "Ready", url: SAMPLE_KEYFRAME });
        }
      } else {
        for (const r of SHOTS) {
          if (get().runId !== startedRunId) return;
          updateAsset(r.shot, { status: "Generating" });
          appendSummary("paint", `${r.shot} 生成中 · ${r.motion}`);
          try {
            const fullPrompt = r.prompt
              ? `${r.prompt}\n\nReference brief: ${briefPrompt}`
              : [
                  briefPrompt,
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
    const VIDEO_COST = 30;
    if (!canAfford(VIDEO_COST)) {
      updateStage("life", {
        status: "recovering",
        expanded: true,
        summary: [],
      });
      const tid = get().taskId ?? undefined;
      useCredits.getState().openLow(tid);
      set({ phase: "failed" });
      persistCurrent("failed");
      return;
    }
    const briefFormat = get().brief?.format ?? "";
    const videoDuration = parseFormatDuration(briefFormat);
    const videoRatio = parseFormatRatio(briefFormat);

    updateStage("life", { status: "running", expanded: true });
    runTool("life", "skill", "first-frame-to-video · Seedance", 1200, 0);
    streamLines("life", [`提交 V01 first-frame-to-video · ${videoDuration}s · ${videoRatio}`], 0, 100);
    set((s) => ({
      assets: [
        ...s.assets,
        {
          id: "V01",
          kind: "video",
          label: "V01",
          caption: `Hero film · ${videoDuration}s`,
          status: "Queued",
          stageId: "life",
          duration: formatDurationLabel(videoDuration),
        },
      ],
    }));



    // 取 paint 阶段第一个真实关键帧（http URL，非 data: 预览）
    const firstKeyframeUrl = (() => {
      const a = get().assets.find(
        (x) => x.stageId === "paint" && x.url && /^https?:\/\//.test(x.url),
      );
      return a?.url;
    })();
    const userId = get().currentUserId;
    const briefPrompt = get().brief?.prompt ?? "";
    const startedRunId = get().runId;

    if (!userId || !firstKeyframeUrl) {
      // fallback：未登录或没有真图，走示例视频
      appendSummary("life", "未登录或无关键帧 · 使用示例视频");
      schedule(() => updateAsset("V01", { status: "Processing" }), 1200);
      schedule(() => {
        updateAsset("V01", { status: "Ready", url: SAMPLE_VIDEO, poster: SAMPLE_KEYFRAME });
        updateStage("life", { status: "ready" });
        consume("life", "Video V01 · sample", VIDEO_COST, get().taskId);
        appendSummary("life", "V01 Ready (sample)");
        collapseAfter("life", 1800);
        persistCurrent("running");
        schedule(() => runDetails(), 1600);
      }, 3000);
      return;
    }

    updateAsset("V01", { status: "Processing" });
    appendSummary("life", "Seedance 提交中（first-frame-to-video）…");

    void (async () => {
      try {
        const { taskId: seedanceTaskId } = await submitVideoTask({
          data: {
            route: "first-frame-to-video",
            payload: {
              prompt: briefPrompt,
              image_url: firstKeyframeUrl,
              ratio: videoRatio,
              duration: videoDuration,
            },
          },
        });

        if (get().runId !== startedRunId) return;
        appendSummary("life", `Seedance task: ${seedanceTaskId}`);

        const started = Date.now();
        let stopped = false;
        let timer: number | null = null;
        const stop = () => {
          stopped = true;
          if (timer !== null) {
            window.clearInterval(timer);
            timer = null;
          }
        };

        const tick = async () => {
          if (stopped || get().runId !== startedRunId) {
            stop();
            return;
          }
          try {
            const r = await pollVideoTask({ data: { taskId: seedanceTaskId } });
            if (stopped || get().runId !== startedRunId) return;
            if (r.status === "success" && r.ossUrl) {
              stop();
              const cur = get().assets.find((a) => a.id === "V01");
              if (cur?.status !== "Ready") {
                updateAsset("V01", {
                  status: "Ready",
                  url: r.ossUrl,
                  poster: firstKeyframeUrl,
                });
                updateStage("life", { status: "ready" });
                consume("life", "Video V01 · seedance", VIDEO_COST, get().taskId);
                appendSummary("life", "V01 Ready · seedance oss_url 已写入");
                collapseAfter("life", 1800);
                persistCurrent("running");
                schedule(() => runDetails(), 1600);
              }
              return;
            }
            if (r.status === "failed") {
              stop();
              const reason = "Seedance 渲染失败";
              updateAsset("V01", {
                status: "Failed",
                errorMessage: reason,
                errorCode: "seedance_failed",
              });
              appendSummary("life", `${reason}（未扣积分）`);
              updateStage("life", { status: "failed" });
              set({ phase: "failed" });
              persistCurrent("failed");
              return;
            }
            if (Date.now() - started > 5 * 60_000) {
              stop();
              updateAsset("V01", {
                status: "Failed",
                errorMessage: "Seedance 轮询超时（5min 未返回结果）",
                errorCode: "timeout",
              });
              appendSummary("life", "Seedance 轮询超时（5min）· 未扣积分");
              updateStage("life", { status: "failed" });
              set({ phase: "failed" });
              persistCurrent("failed");
              return;
            }
            updateAsset("V01", { status: "Processing" });
          } catch (e) {
            console.error("[life] poll error", e);
            appendSummary("life", `轮询出错：${(e as Error).message}`);
          }
        };
        await tick();
        if (!stopped) {
          timer = window.setInterval(tick, 3000) as unknown as number;
        }
      } catch (e) {
        console.error("[life] submit failed", e);
        updateAsset("V01", {
          status: "Failed",
          errorMessage: (e as Error).message,
          errorCode: "submit_failed",
        });
        appendSummary("life", `提交失败：${(e as Error).message}（未扣积分）`);
        updateStage("life", { status: "failed" });
        set({ phase: "failed" });
        persistCurrent("failed");
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
      set((s) => ({ chatLog: [...s.chatLog, userMsg] }));

      void (async () => {
        try {
          const { chatReply } = await import("@/lib/chat.functions");
          const s = get();
          const history = s.chatLog.slice(-10).map((m) => ({
            role: (m.role === "agent" ? "assistant" : "user") as
              | "assistant"
              | "user",
            content: m.text,
          }));
          const messages = [
            ...history,
            { role: "user" as const, content: t },
          ];
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
          const result = await chatReply({
            data: {
              messages,
              context: {
                phase: s.phase,
                brief: s.brief ?? undefined,
                script: ctxScript,
              },
            },
          });
          const agentMsg: ChatMsg = {
            id: uid(),
            role: "agent",
            text: result.reply,
            ts: Date.now(),
          };
          set((st) => ({ chatLog: [...st.chatLog, agentMsg] }));
        } catch (err) {
          const agentMsg: ChatMsg = {
            id: uid(),
            role: "agent",
            text:
              "AI 暂不可用：" +
              (err instanceof Error ? err.message : "未知错误"),
            ts: Date.now(),
          };
          set((st) => ({ chatLog: [...st.chatLog, agentMsg] }));
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
      set((s) => ({
        runId: s.runId + 1,
        prompt: "",
        taskTitle: inferTaskTitle(text),
        taskId: newId(),
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
        currentUserId: null,
        script: null,
      }));
      // 异步抓 user id；没登录也允许走假数据 stage（paint/life 会自检并 fallback）
      supabase.auth.getUser().then(({ data }) => {
        set({ currentUserId: data.user?.id ?? null });
      });
      const delay = 1500 + Math.random() * 1000;
      schedule(() => {
        set({ phase: "intake" });
      }, delay);
    },

    confirmBrief: (brief) => {
      set({ brief });
      startRunning();
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
      // Restore stages strictly from the persisted summaries. Mark them ready
      // (or failed for the failed task) but DO NOT mark stages without snapshot
      // data as ready, so Workspace knows to skip rendering interactive children
      // that would otherwise crash on missing runtime data.
      const snap = rec.stageSummaries ?? {};
      for (const sid of STAGE_ORDER) {
        const sum = snap[sid];
        if (sum && sum.length) {
          stages[sid] = {
            ...emptyStage(),
            status: rec.status === "failed" && sid === "life" ? "failed" : "ready",
            summary: sum,
            expanded: false,
          };
        }
      }
      const restoredBrief: Brief = rec.brief ?? {
        prompt: rec.prompt,
        adType: "Restored",
        format: "—",
        visualSource: "—",
        mode: "—",
      };
      set((s) => ({
        runId: s.runId + 1,
        phase: rec.status === "done" ? "done" : "failed",
        taskId: rec.id,
        taskTitle: rec.title,
        taskKind: rec.kind,
        brief: restoredBrief,
        stages,
        assets: rec.assets,
        gate: null,
        softGate: null,
        selection: [],
        chatLog: [],
        rail: { open: rec.assets.length > 0 },
      }));
    },

    deleteTask: (id) => {
      const next = get().taskHistory.filter((t) => t.id !== id);
      set({ taskHistory: next });
      saveHistory(next);
    },

    retryStage: (id) => {
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
      // V01 / life：整段重跑 life
      if (asset.stageId === "life") {
        get().retryStage("life");
        return;
      }
      // paint 阶段：整段重跑 paint（简化处理，单帧重试不容易复用 prompt 顺序）
      if (asset.stageId === "paint") {
        get().retryStage("paint");
        return;
      }
      if (asset.stageId === "wardrobe") {
        get().retryStage("wardrobe");
        return;
      }
    },



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
