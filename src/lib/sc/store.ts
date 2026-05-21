import { create } from "zustand";
import {
  type Asset,
  type Brief,
  type Gate,
  type Phase,
  type StageId,
  type StageState,
  STAGE_ORDER,
} from "./types";
import { SAMPLE_KEYFRAME, SAMPLE_VIDEO } from "./samples";
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
  gate: Gate;
  rail: RailState;
  timers: number[];

  setPrompt: (v: string) => void;
  submit: (prompt: string) => void;
  confirmBrief: (brief: Brief) => void;
  skipIntake: () => void;
  approveScript: () => void;
  tweakScript: () => void;
  approveKeyframe: () => void;
  regenerateKeyframe: () => void;
  cancel: () => void;
  reset: () => void;
  toggleStage: (id: StageId) => void;
  setRailOpen: (v: boolean) => void;
  focusAsset: (id: string) => void;
  forceState: (s: string) => void;
}

const initialStages = (): Record<StageId, StageState> =>
  STAGE_ORDER.reduce(
    (acc, id) => {
      acc[id] = { status: "pending", summary: [], expanded: true };
      return acc;
    },
    {} as Record<StageId, StageState>,
  );

const isFullAuto = (text: string) =>
  /(全自动|full[\s-]?auto|你决定|直接生成|按默认|auto[\s-]?run)/i.test(text);

export const useSC = create<SCState>((set, get) => {
  const clearTimers = () => {
    for (const t of get().timers) clearTimeout(t);
    set({ timers: [] });
  };

  const schedule = (fn: () => void, delay: number) => {
    const id = window.setTimeout(fn, delay) as unknown as number;
    set({ timers: [...get().timers, id] });
  };

  const updateStage = (id: StageId, patch: Partial<StageState>) =>
    set((s) => ({
      stages: { ...s.stages, [id]: { ...s.stages[id], ...patch } },
    }));

  const updateAsset = (id: string, patch: Partial<Asset>) =>
    set((s) => ({
      assets: s.assets.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    }));

  const markStageReady = (
    id: StageId,
    summary: string[],
    autoCollapseAfter = 1400,
  ) => {
    updateStage(id, { status: "ready", summary, expanded: true });
    schedule(() => updateStage(id, { expanded: false }), autoCollapseAfter);
  };

  const runScene = () => {
    updateStage("scene", {
      status: "running",
      summary: ["分析品牌调性…", "锁定情绪与受众…"],
      expanded: true,
    });
    schedule(() => {
      markStageReady("scene", [
        "方向：Premium · 暮光质感",
        "镜头语言：缓推 + 侧跟 + 微距旋转",
        "受众：25–40，都市，追求质感",
      ]);
    }, 1100);
  };

  const runStructure = () => {
    updateStage("structure", {
      status: "running",
      summary: ["撰写脚本与分镜…"],
      expanded: true,
    });
    schedule(() => {
      markStageReady(
        "structure",
        [
          "30s · 9:16 · 5 个镜头，单条连续叙事",
          "VO 中性低音，弦乐 + 鼓点过渡",
        ],
        1800,
      );
      // gate: wait for user approval unless full-auto
      const auto = isFullAuto(get().brief?.mode ?? "");
      if (auto) {
        schedule(() => runPaint(), 1900);
      } else {
        set({ gate: "script" });
      }
    }, 1600);
  };

  const runPaint = () => {
    set({ gate: null });
    updateStage("paint", {
      status: "running",
      summary: ["生成 A01 关键帧…"],
      expanded: true,
    });
    set((s) => ({
      assets: [
        ...s.assets,
        {
          id: "A01",
          kind: "image",
          label: "A01",
          caption: "Keyframe · Hero shot",
          status: "Generating",
          stageId: "paint",
          width: 1080,
          height: 1920,
        },
      ],
      // first asset → flash & open rail
      rail: { ...s.rail, open: true, flashId: "A01" },
    }));

    schedule(() => updateAsset("A01", { status: "Processing" }), 1800);
    schedule(() => {
      updateAsset("A01", {
        status: "Ready",
        url: SAMPLE_KEYFRAME,
      });
      updateStage("paint", {
        status: "ready",
        summary: [
          "A01 已就绪，构图与色温符合 brief",
          "已锁定为 V01 的 image_url",
        ],
        expanded: true,
      });
      // for media stages, collapse the prompt-detail toggle area only;
      // assets stay visible. We collapse summary list after a moment.
      schedule(() => updateStage("paint", { expanded: false }), 1600);

      const auto = isFullAuto(get().brief?.mode ?? "");
      if (auto) {
        schedule(() => runLife(), 1700);
      } else {
        set({ gate: "keyframe" });
      }
    }, 3600);
  };

  const runLife = () => {
    set({ gate: null });
    updateStage("life", {
      status: "running",
      summary: ["提交 V01 first-frame-to-video…"],
      expanded: true,
    });
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
    schedule(() => updateAsset("V01", { status: "Status checked" }), 2900);
    schedule(() => {
      updateAsset("V01", {
        status: "Ready",
        url: SAMPLE_VIDEO,
        poster: SAMPLE_KEYFRAME,
      });
      updateStage("life", {
        status: "ready",
        summary: [
          "V01 已就绪，关键帧来源一致",
          "时长 30s，9:16，画质验证通过",
        ],
        expanded: true,
      });
      schedule(() => updateStage("life", { expanded: false }), 1600);
      schedule(() => runDetails(), 1500);
    }, 4600);
  };

  const runDetails = () => {
    updateStage("details", {
      status: "running",
      summary: ["运行质量检查与下一步建议…"],
      expanded: true,
    });
    schedule(() => {
      markStageReady("details", [
        "QC：9:16 ✓  产品可见 ✓  无违规宣称 ✓  视频链接已验证 ✓",
      ]);
      set({ phase: "done" });
    }, 1100);
  };

  const startRunning = () => {
    set({ phase: "running" });
    runScene();
    schedule(() => runStructure(), 1300);
  };

  return {
    phase: "empty",
    prompt: "",
    brief: null,
    stages: initialStages(),
    assets: [],
    taskTitle: "New chat",
    gate: null,
    rail: { open: false },
    timers: [],

    setPrompt: (v) => set({ prompt: v }),

    submit: (prompt) => {
      const text = prompt.trim();
      if (!text) return;
      set({
        prompt: "",
        taskTitle: inferTaskTitle(text),
        phase: "thinking",
        brief: { prompt: text, adType: "", format: "", visualSource: "", mode: "" },
      });
      const delay = 900 + Math.random() * 700;
      schedule(() => {
        if (isFullAuto(text)) {
          set((s) => ({
            brief: {
              prompt: s.brief?.prompt ?? text,
              adType: "Premium / Cinematic",
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
      // simple re-run of paint
      set((s) => ({
        assets: s.assets.filter((a) => a.id !== "A01"),
        gate: null,
        stages: { ...s.stages, paint: { status: "pending", summary: [], expanded: true } },
      }));
      runPaint();
    },

    cancel: () => {
      clearTimers();
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
    },

    reset: () => {
      clearTimers();
      set({
        phase: "empty",
        prompt: "",
        brief: null,
        stages: initialStages(),
        assets: [],
        taskTitle: "New chat",
        gate: null,
        rail: { open: false },
      });
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

    forceState: (s) => {
      clearTimers();
      const base = {
        phase: "running" as Phase,
        stages: initialStages(),
        assets: [] as Asset[],
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
      };
      const ready = (summary: string[]): StageState => ({
        status: "ready",
        summary,
        expanded: false,
      });
      switch (s) {
        case "empty":
          set({ ...base, phase: "empty", brief: null, taskTitle: "New chat", rail: { open: false } });
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
