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
import { SAMPLE_KEYFRAME, SAMPLE_VIDEO, SERIES_DEMO } from "./samples";
import { inferTaskTitle } from "./intake-engine";
import { useCredits } from "./credits-store";

const consume = (stage: string, label: string, cost: number) =>
  useCredits.getState().consume(stage, label, cost);
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

  /** Open a soft-gate that auto-advances after 20s in Auto mode. */
  const openGate = (gate: Gate, defaultAction: () => void) => {
    const auto = isAuto();
    set({
      gate,
      softGate: auto ? { defaultAction, fireAt: Date.now() + 20000 } : null,
    });
    if (auto) {
      schedule(() => {
        // re-check the same gate is still open (user didn't act)
        if (get().gate === gate) defaultAction();
      }, 20000);
    }
  };

  const closeGate = () => set({ gate: null, softGate: null });

  /** Persist current task snapshot into taskHistory */
  const persistCurrent = (status: TaskRecord["status"]) => {
    const { taskId, taskTitle, brief, assets, taskHistory, taskKind } = get();
    if (!taskId) return;
    const now = Date.now();
    const existing = taskHistory.find((t) => t.id === taskId);
    const record: TaskRecord = {
      id: taskId,
      title: taskTitle,
      prompt: brief?.prompt ?? "",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      status,
      kind: taskKind,
      assets,
    };
    const next = [record, ...taskHistory.filter((t) => t.id !== taskId)];
    set({ taskHistory: next });
    saveHistory(next);
  };

  // -------- Stage runners --------

  const runScene = () => {
    updateStage("scene", { status: "running", expanded: true });
    runTool("scene", "skill", "ai-video-studio · scene-builder", 1100, 0);
    streamLines(
      "scene",
      [
        "正在分析品牌 brief 与受众…",
        "锁定情绪：Premium · Twilight",
        "镜头语言：缓推 + 侧跟 + 微距旋转",
      ],
      850,
      1300,
      () => {
        updateStage("scene", { status: "ready" });
        consume("scene", "Scene · brief analysis", 1);
        collapseAfter("scene", 1400);
        schedule(() => runStructure(), 1600);
      },
    );
  };

  const runStructure = () => {
    updateStage("structure", { status: "running", expanded: true });
    runTool("structure", "tool", "video-script-writer", 1600, 0);
    runTool("structure", "tool", "storyboard-planner", 1800, 1700);

    // a foldable thought block (no thumbs yet — wardrobe / paint not run)
    schedule(
      () =>
        addThought("structure", {
          title: "脚本结构推导",
          body: [
            "5 镜头叙事：环境建立 → 人物登场 → 产品互动 → 主题升华 → 品牌收尾。",
            "节奏控制：前 3s 强 hook，10s 处情绪转折，最后 2s 留 logo。",
            "音效层：弦乐铺底 + 鼓点过渡 + 收尾混响。",
          ],
        }),
      2200,
    );

    streamLines(
      "structure",
      [
        "撰写脚本与分镜结构…",
        "30s · 9:16 · 5 个镜头连续叙事",
        "镜头 1：环境建立 + 产品开场",
        "镜头 2-4：人物互动与产品特写",
        "镜头 5：品牌 logo 收尾",
        "VO 中性低音 + 弦乐 + 鼓点过渡",
      ],
      700,
      3600,
      () => {
        updateStage("structure", { status: "ready" });
        if (isAuto()) {
          schedule(() => runWardrobe(), 1100);
        } else {
          openGate("script", () => runWardrobe());
        }
      },
    );
  };

  const runWardrobe = () => {
    closeGate();
    updateStage("wardrobe", { status: "running", expanded: true });
    runTool("wardrobe", "tool", "wardrobe-stylist · text-to-image", 1500, 0);
    streamLines(
      "wardrobe",
      [
        "解析年代/世界观背景 → 1920s 巴黎",
        "主角 W01：丝绒长裙 + 珍珠头饰",
        "配角 W02：燕尾礼服 + 怀表",
        "关键道具 P01：水晶香水瓶",
      ],
      650,
      300,
    );

    const wardrobeAssets: Asset[] = [
      { id: "W01", kind: "image", label: "W01", caption: "主角服装 · 1920s 丝绒礼服", status: "Queued", stageId: "wardrobe", width: 768, height: 1024 },
      { id: "W02", kind: "image", label: "W02", caption: "配角服装 · 燕尾礼服", status: "Queued", stageId: "wardrobe", width: 768, height: 1024 },
      { id: "P01", kind: "image", label: "P01", caption: "关键道具 · 水晶香水瓶", status: "Queued", stageId: "wardrobe", width: 768, height: 768 },
    ];
    set((s) => ({
      assets: [...s.assets, ...wardrobeAssets],
      rail: { ...s.rail, open: true, flashId: "W01" },
    }));

    wardrobeAssets.forEach((a, i) => {
      schedule(() => updateAsset(a.id, { status: "Generating" }), 1200 + i * 400);
      schedule(
        () => updateAsset(a.id, { status: "Ready", url: SAMPLE_KEYFRAME }),
        3200 + i * 400,
      );
    });

    schedule(() => {
      appendSummary("wardrobe", "服装/道具准备完毕 · 风格统一 · 与 1920s 背景吻合");
      updateStage("wardrobe", { status: "ready" });
      collapseAfter("wardrobe", 1600);
      persistCurrent("running");
      if (isAuto()) {
        schedule(() => runPaint(), 1200);
      } else {
        openGate("wardrobe", () => runPaint());
      }
    }, 4800);
  };

  const runPaint = () => {
    closeGate();
    updateStage("paint", { status: "running", expanded: true });
    runTool("paint", "skill", "ai-video-studio · keyframe-painter", 800, 0);
    runTool("paint", "tool", "text-to-image · MovieFlow", 5400, 900);

    // thought with wardrobe thumbnails — shows "I'm generating frames using these assets"
    schedule(
      () =>
        addThought("paint", {
          title: "基于服装/道具素材生成分镜",
          body: [
            "锁定主角 W01 + 配角 W02 + 道具 P01 作为参考。",
            "构图：左 1/3 主角，景深虚化背景，强调瓶身高光。",
            "光照：暮蓝主光 + 暖橙轮廓 + 烛火点缀。",
          ],
          thumbAssetIds: ["W01", "W02", "P01"],
        }),
      1200,
    );

    streamLines("paint", ["生成 A01 关键帧 · prompt 已写入…"], 0, 200);
    set((s) => ({
      assets: [
        ...s.assets,
        {
          id: "A01",
          kind: "image",
          label: "A01",
          caption: "Keyframe · Hero shot",
          status: "Queued",
          stageId: "paint",
          width: 1080,
          height: 1920,
        },
      ],
      rail: { ...s.rail, open: true, flashId: "A01" },
    }));

    schedule(() => updateAsset("A01", { status: "Generating" }), 1400);
    schedule(() => appendSummary("paint", "MovieFlow 队列已接收任务"), 1500);
    schedule(() => updateAsset("A01", { status: "Processing" }), 3600);
    schedule(() => appendSummary("paint", "采样中：构图 / 光照 / 色温…"), 3700);

    schedule(() => {
      updateAsset("A01", { status: "Ready", url: SAMPLE_KEYFRAME });
      updateStage("paint", { status: "ready" });
      appendSummary("paint", "A01 Ready · 已锁定为 V01 的 image_url");
      collapseAfter("paint", 1800);
      persistCurrent("running");
      if (isAuto()) {
        schedule(() => runQC(), 1200);
      } else {
        openGate("keyframe", () => runQC());
      }
    }, 6200);
  };

  const runQC = () => {
    closeGate();
    updateStage("qc", { status: "running", expanded: true });
    runTool("qc", "skill", "qc-consistency-checker", 800, 0);
    runTool("qc", "tool", "character-consistency", 1100, 900);
    runTool("qc", "tool", "scene-coherence", 1100, 2000);
    runTool("qc", "tool", "hallucination-guard", 1100, 3100);
    runTool("qc", "tool", "compliance-scanner", 900, 4200);

    streamLines(
      "qc",
      [
        "检查角色一致性（C01 跨镜对比）…",
        "检查场景一致性（E01 风格统一）…",
        "检查服装/道具连贯性（W01 / W02 / P01）…",
        "检查故事节拍 vs 关键帧对齐…",
        "幻觉/事实性扫描…",
      ],
      900,
      200,
    );

    schedule(() => {
      appendSummary("qc", "发现 1 处问题：主角妆容在 A03 与 A01 不一致");
      addThought("qc", {
        title: "修改建议",
        body: [
          "建议：以 A01 妆容为基准，调用快模型重生成 A03 的人物层。",
          "成本：Fast model · 0 credits · Preview only · 不影响积分。",
        ],
      });
      if (isAuto()) {
        schedule(() => applyQCFixInternal(), 1500);
      } else {
        openGate("qc-fix", () => applyQCFixInternal());
      }
    }, 5400);
  };

  const applyQCFixInternal = () => {
    closeGate();
    appendSummary("qc", "调用快模型重生成 A03（preview · 0 credits）…");
    runTool("qc", "tool", "fast-model · re-paint", 2200, 0);
    schedule(() => {
      appendSummary("qc", "修正完成 · 一致性全部通过 ✓");
      updateStage("qc", { status: "ready" });
      collapseAfter("qc", 1600);
      schedule(() => runLife(), 1200);
    }, 2400);
  };

  const runLife = () => {
    closeGate();
    updateStage("life", { status: "running", expanded: true });
    runTool("life", "skill", "first-frame-to-video · MovieFlow", 1200, 0);
    streamLines("life", ["提交 V01 first-frame-to-video…"], 0, 100);
    set((s) => ({
      assets: [
        ...s.assets,
        {
          id: "V01",
          kind: "video",
          label: "V01",
          caption: "Hero film · 30s",
          status: "Queued",
          stageId: "life",
          duration: "0:30",
        },
      ],
    }));

    schedule(() => updateAsset("V01", { status: "Processing" }), 1200);
    schedule(() => appendSummary("life", "MovieFlow 渲染中（first-frame-to-video）"), 1300);
    schedule(() => updateAsset("V01", { status: "Status checked" }), 4500);
    schedule(() => appendSummary("life", "Status checked · 视频流可用"), 4600);

    schedule(() => {
      updateAsset("V01", {
        status: "Ready",
        url: SAMPLE_VIDEO,
        poster: SAMPLE_KEYFRAME,
      });
      updateStage("life", { status: "ready" });
      appendSummary("life", "V01 Ready · 30s · 9:16 · 画质验证通过");
      collapseAfter("life", 1800);
      persistCurrent("running");
      schedule(() => runDetails(), 1600);
    }, 7000);
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
      }));
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
        rail: { open: false, flashId: undefined, focusedAssetId: undefined },
        brief: { prompt: text, adType: "", format: "", visualSource: "", mode: "" },
        intakeSel: {},
        intakeCustoms: {},
        intakeOthers: null,
      }));
      const delay = 1500 + Math.random() * 1000;
      schedule(() => {
        if (get().autoMode === "auto") {
          set((s) => ({
            brief: {
              prompt: s.brief?.prompt ?? text,
              adType: taskKind === "series" ? "Series · Episode" : "Short cinema",
              format: "30s · 9:16",
              visualSource: "Generate from prompt",
              mode: "Auto · 全自动连续推进",
            },
          }));
          startRunning();
        } else {
          set({ phase: "intake" });
        }
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
        assets: s.assets.filter((a) => a.id !== "A01"),
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
      if (rec.status === "done") {
        for (const sid of STAGE_ORDER) {
          stages[sid] = { ...emptyStage(), status: "ready", expanded: false };
        }
      }
      set((s) => ({
        runId: s.runId + 1,
        phase: rec.status === "done" ? "done" : "failed",
        taskId: rec.id,
        taskTitle: rec.title,
        taskKind: rec.kind,
        brief: {
          prompt: rec.prompt,
          adType: "Restored",
          format: "—",
          visualSource: "—",
          mode: "—",
        },
        stages,
        assets: rec.assets,
        gate: null,
        softGate: null,
        rail: { open: rec.assets.length > 0 },
      }));
    },

    deleteTask: (id) => {
      const next = get().taskHistory.filter((t) => t.id !== id);
      set({ taskHistory: next });
      saveHistory(next);
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
          prompt: "Demo: YSL Libre 30s",
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
