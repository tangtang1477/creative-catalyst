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
  STAGE_ORDER,
} from "./types";
import { SAMPLE_KEYFRAME, SAMPLE_VIDEO, SERIES_DEMO } from "./samples";
import { inferTaskTitle } from "./intake-engine";

interface RailState {
  open: boolean;
  flashId?: string;
  focusedAssetId?: string;
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
  rail: RailState;
  autoMode: AutoMode;
  timers: number[];
  runId: number;

  // Intake interactive state (lifted from IntakeCard so CommandInput can drive Others input)
  intakeSel: Record<string, string>;
  intakeCustoms: Record<string, string[]>;
  intakeOthers: { key: string; label: string } | null;

  setPrompt: (v: string) => void;
  setAutoMode: (m: AutoMode) => void;
  addAttachment: (a: Attachment) => void;
  removeAttachment: (id: string) => void;
  clearAttachments: () => void;
  submit: (prompt: string) => void;
  confirmBrief: (brief: Brief) => void;
  skipIntake: () => void;
  approveScript: () => void;
  tweakScript: () => void;
  approveKeyframe: () => void;
  regenerateKeyframe: () => void;
  cancel: () => void;
  reset: (opts?: { fromUserAction?: boolean }) => void;
  toggleStage: (id: StageId) => void;
  setRailOpen: (v: boolean) => void;
  focusAsset: (id: string) => void;
  forceState: (s: string) => void;
  restoreTask: (id: string) => void;
  deleteTask: (id: string) => void;

  setIntakeSel: (key: string, value: string) => void;
  requestIntakeOthers: (key: string, label: string) => void;
  cancelIntakeOthers: () => void;
  resolveIntakeOthers: (value: string) => void;
}

const HISTORY_KEY = "sc.tasks";
const AUTO_KEY = "sc.autoMode";

const initialStages = (): Record<StageId, StageState> =>
  STAGE_ORDER.reduce(
    (acc, id) => {
      acc[id] = { status: "pending", summary: [], expanded: true };
      return acc;
    },
    {} as Record<StageId, StageState>,
  );

const isFullAutoPrompt = (text: string) =>
  /(全自动|full[\s-]?auto|你决定|直接生成|按默认|auto[\s-]?run)/i.test(text);

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
  if (typeof window === "undefined") return "confirm";
  const v = window.localStorage.getItem(AUTO_KEY);
  return v === "auto" ? "auto" : "confirm";
};

export const useSC = create<SCState>((set, get) => {
  const clearTimers = () => {
    for (const t of get().timers) clearTimeout(t);
    set({ timers: [] });
  };

  const schedule = (fn: () => void, delay: number) => {
    const startedRunId = get().runId;
    const id = window.setTimeout(() => {
      // assertPhase guard: bail if reset/cancel rebooted the run
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

  const updateAsset = (id: string, patch: Partial<Asset>) =>
    set((s) => ({
      assets: s.assets.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    }));

  const streamLines = (
    id: StageId,
    lines: string[],
    perLineDelay = 900,
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

  const isAutoFlow = () => get().autoMode === "auto";

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

  const runScene = () => {
    updateStage("scene", { status: "running", summary: [], expanded: true });
    const lines = [
      "正在分析品牌 brief 与受众…",
      "锁定情绪：Premium · Twilight",
      "镜头语言：缓推 + 侧跟 + 微距旋转",
    ];
    streamLines("scene", lines, 950, 200, () => {
      updateStage("scene", { status: "ready" });
      collapseAfter("scene", 1400);
    });
  };

  const runStructure = () => {
    updateStage("structure", { status: "running", summary: [], expanded: true });
    const lines = [
      "撰写脚本与分镜结构…",
      "30s · 9:16 · 5 个镜头连续叙事",
      "镜头 1：环境建立 + 产品开场",
      "镜头 2-4：人物互动与产品特写",
      "镜头 5：品牌 logo 收尾",
      "VO 中性低音 + 弦乐 + 鼓点过渡",
    ];
    streamLines("structure", lines, 950, 200, () => {
      updateStage("structure", { status: "ready" });
      // Both auto and confirm modes pause for user check-in
      set({ gate: "script" });
    });
  };

  const runPaint = () => {
    set({ gate: null });
    updateStage("paint", { status: "running", summary: [], expanded: true });
    streamLines("paint", ["生成 A01 关键帧 · prompt 已写入…"], 0, 100);
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
      // Always wait for user confirmation before starting video render
      set({ gate: "keyframe" });
    }, 6200);
  };

  const runLife = () => {
    set({ gate: null });
    updateStage("life", { status: "running", summary: [], expanded: true });
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
    updateStage("details", { status: "running", summary: [], expanded: true });
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
    schedule(() => runStructure(), 3800);
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
    rail: { open: false },
    autoMode: loadAutoMode(),
    timers: [],
    runId: 0,

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

    setIntakeSel: (key, value) =>
      set((s) => ({ intakeSel: { ...s.intakeSel, [key]: value } })),
    requestIntakeOthers: (key, label) =>
      set({ intakeOthers: { key, label } }),
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
        rail: { open: false, flashId: undefined, focusedAssetId: undefined },
        brief: { prompt: text, adType: "", format: "", visualSource: "", mode: "" },
        intakeSel: {},
        intakeCustoms: {},
        intakeOthers: null,
      }));
      const delay = 1500 + Math.random() * 1000;
      schedule(() => {
        // honor user's autoMode strictly
        const auto = get().autoMode === "auto";
        if (auto) {
          set((s) => ({
            brief: {
              prompt: s.brief?.prompt ?? text,
              adType: taskKind === "series" ? "Series / Episode" : "Premium / Cinematic",
              format: "9:16 · 30s",
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

    approveScript: () => runPaint(),
    tweakScript: () => set({ phase: "intake", gate: null }),
    approveKeyframe: () => runLife(),
    regenerateKeyframe: () => {
      set((s) => ({
        assets: s.assets.filter((a) => a.id !== "A01"),
        gate: null,
        stages: {
          ...s.stages,
          paint: { status: "pending", summary: [], expanded: true },
        },
      }));
      runPaint();
    },

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
        };
      });
      persistCurrent("failed");
    },

    reset: (opts) => {
      const { phase } = get();
      if (opts?.fromUserAction && (phase === "running" || phase === "thinking")) {
        // mark current task as interrupted in history before wiping
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

    setRailOpen: (v) => set((s) => ({ rail: { ...s.rail, open: v } })),
    focusAsset: (id) =>
      set((s) => ({ rail: { ...s.rail, open: true, focusedAssetId: id } })),

    restoreTask: (id) => {
      const rec = get().taskHistory.find((t) => t.id === id);
      if (!rec) return;
      clearTimers();
      const stages = initialStages();
      if (rec.status === "done") {
        for (const sid of STAGE_ORDER) {
          stages[sid] = { status: "ready", summary: [], expanded: false };
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
        rail: { open: true } as RailState,
        runId: (get().runId ?? 0) + 1,
      };
      const ready = (summary: string[]): StageState => ({
        status: "ready",
        summary,
        expanded: false,
      });
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
              paint: { status: "running", summary: ["生成 A01…"], expanded: true },
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
              paint: ready(["A01 Ready"]),
              life: { status: "running", summary: ["V01 Processing…"], expanded: true },
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
              paint: ready(["A01 Ready"]),
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
              paint: ready(["关键帧批次完成"]),
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
              paint: { status: "recovering", summary: ["未返回可用 URL，重试中"], expanded: true },
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
              paint: ready(["A01 Ready"]),
              life: { status: "failed", summary: ["返回内容不是可播放视频"], expanded: true },
              details: { status: "pending", summary: [], expanded: true },
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
