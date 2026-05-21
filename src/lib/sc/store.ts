import { create } from "zustand";
import {
  type Asset,
  type Brief,
  type Phase,
  type StageId,
  type StageState,
  STAGE_ORDER,
} from "./types";
import { SAMPLE_KEYFRAME, SAMPLE_VIDEO } from "./samples";

interface SCState {
  phase: Phase;
  prompt: string;
  brief: Brief | null;
  stages: Record<StageId, StageState>;
  assets: Asset[];
  taskTitle: string;
  timers: number[];

  setPrompt: (v: string) => void;
  submit: (prompt: string) => void;
  startIntake: (prompt: string) => void;
  confirmBrief: (brief: Brief) => void;
  skipIntake: () => void;
  cancel: () => void;
  reset: () => void;
  forceState: (s: string) => void;
}

const initialStages = (): Record<StageId, StageState> =>
  STAGE_ORDER.reduce(
    (acc, id) => {
      acc[id] = { status: "pending", summary: [] };
      return acc;
    },
    {} as Record<StageId, StageState>,
  );

const isFullAuto = (text: string) =>
  /(全自动|full[\s-]?auto|你决定|直接生成|按默认)/i.test(text);

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

  const runFullAuto = () => {
    set({ phase: "running" });

    // Stage: scene
    updateStage("scene", { status: "running", summary: ["分析品牌调性…"] });
    schedule(() => {
      updateStage("scene", {
        status: "ready",
        summary: [
          "方向：Luxury / Premium，蓝色暮光，巴黎公寓",
          "镜头语言：缓推 + 侧跟 + 微距旋转",
          "受众：25–40，都市女性，追求自由与质感",
        ],
      });
    }, 900);

    // Stage: structure
    schedule(() => {
      updateStage("structure", {
        status: "running",
        summary: ["撰写脚本与分镜…"],
      });
    }, 1000);
    schedule(() => {
      updateStage("structure", {
        status: "ready",
        summary: [
          "30s 9:16，5 个镜头，单条连续叙事",
          "VO 中性低音，配乐弦乐 + 鼓点过渡",
        ],
      });
    }, 2400);

    // Stage: paint
    schedule(() => {
      updateStage("paint", {
        status: "running",
        summary: ["生成 A01 关键帧…"],
      });
      set((s) => ({
        assets: [
          ...s.assets,
          {
            id: "A01",
            kind: "image",
            label: "A01 Keyframe",
            status: "Generating",
          },
        ],
      }));
    }, 2600);

    schedule(() => updateAsset("A01", { status: "Processing" }), 4200);
    schedule(() => {
      updateAsset("A01", { status: "Ready", url: SAMPLE_KEYFRAME });
      updateStage("paint", {
        status: "ready",
        summary: [
          "A01 已就绪，构图与色温符合 brief",
          "已锁定为 V01 的 image_url",
        ],
      });
    }, 5800);

    // Stage: life
    schedule(() => {
      updateStage("life", {
        status: "running",
        summary: ["提交 V01 first-frame-to-video…"],
      });
      set((s) => ({
        assets: [
          ...s.assets,
          {
            id: "V01",
            kind: "video",
            label: "V01 Video",
            status: "Queued",
          },
        ],
      }));
    }, 6000);

    schedule(() => updateAsset("V01", { status: "Processing" }), 7200);
    schedule(() => updateAsset("V01", { status: "Status checked" }), 9000);
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
      });
    }, 11000);

    // Stage: details
    schedule(() => {
      updateStage("details", {
        status: "ready",
        summary: [
          "QC：9:16 ✓  产品可见 ✓  无违规宣称 ✓  视频链接已验证 ✓",
        ],
      });
      set({ phase: "done" });
    }, 11500);
  };

  return {
    phase: "empty",
    prompt: "",
    brief: null,
    stages: initialStages(),
    assets: [],
    taskTitle: "New chat",
    timers: [],

    setPrompt: (v) => set({ prompt: v }),

    submit: (prompt) => {
      const text = prompt.trim();
      if (!text) return;
      set({ prompt: "", taskTitle: text.slice(0, 28) || "New chat" });
      if (isFullAuto(text)) {
        set({
          brief: {
            prompt: text,
            adType: "Luxury / Premium",
            format: "30s 9:16",
            visualSource: "自动生成场景",
            mode: "全自动，连续推进",
          },
        });
        runFullAuto();
      } else {
        set({ phase: "intake", brief: { prompt: text, adType: "", format: "", visualSource: "", mode: "" } });
      }
    },

    startIntake: (prompt) => {
      set({
        phase: "intake",
        prompt: "",
        taskTitle: prompt.slice(0, 28) || "New chat",
        brief: { prompt, adType: "", format: "", visualSource: "", mode: "" },
      });
    },

    confirmBrief: (brief) => {
      set({ brief });
      runFullAuto();
    },

    skipIntake: () => {
      const b = get().brief;
      set({
        brief: {
          prompt: b?.prompt ?? "",
          adType: "Luxury / Premium",
          format: "30s 9:16",
          visualSource: "自动生成场景",
          mode: "全自动，连续推进",
        },
      });
      runFullAuto();
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
      });
    },

    forceState: (s) => {
      clearTimers();
      const base = {
        phase: "running" as Phase,
        stages: initialStages(),
        assets: [] as Asset[],
        brief: {
          prompt: "Demo: YSL Libre 30s",
          adType: "Luxury / Premium",
          format: "30s 9:16",
          visualSource: "自动生成场景",
          mode: "全自动",
        },
        taskTitle: "Demo task",
      };
      switch (s) {
        case "empty":
          set({ ...base, phase: "empty", brief: null, taskTitle: "New chat" });
          break;
        case "intake":
          set({ ...base, phase: "intake" });
          break;
        case "image-generating":
          set({
            ...base,
            stages: {
              ...base.stages,
              scene: { status: "ready", summary: ["方向已锁定"] },
              structure: { status: "ready", summary: ["脚本/分镜就绪"] },
              paint: { status: "running", summary: ["生成 A01…"] },
            },
            assets: [
              { id: "A01", kind: "image", label: "A01 Keyframe", status: "Generating" },
            ],
          });
          break;
        case "video-processing":
          set({
            ...base,
            stages: {
              ...base.stages,
              scene: { status: "ready", summary: ["方向已锁定"] },
              structure: { status: "ready", summary: ["脚本/分镜就绪"] },
              paint: { status: "ready", summary: ["A01 Ready"] },
              life: { status: "running", summary: ["V01 Processing…"] },
            },
            assets: [
              { id: "A01", kind: "image", label: "A01 Keyframe", status: "Ready", url: SAMPLE_KEYFRAME },
              { id: "V01", kind: "video", label: "V01 Video", status: "Processing" },
            ],
          });
          break;
        case "ready":
          set({
            ...base,
            phase: "done",
            stages: {
              scene: { status: "ready", summary: ["方向已锁定"] },
              structure: { status: "ready", summary: ["脚本/分镜就绪"] },
              paint: { status: "ready", summary: ["A01 Ready"] },
              life: { status: "ready", summary: ["V01 Ready"] },
              details: { status: "ready", summary: ["QC 通过"] },
            },
            assets: [
              { id: "A01", kind: "image", label: "A01 Keyframe", status: "Ready", url: SAMPLE_KEYFRAME },
              { id: "V01", kind: "video", label: "V01 Video", status: "Ready", url: SAMPLE_VIDEO, poster: SAMPLE_KEYFRAME },
            ],
          });
          break;
        case "recovering":
          set({
            ...base,
            stages: {
              ...base.stages,
              scene: { status: "ready", summary: ["方向已锁定"] },
              structure: { status: "ready", summary: ["脚本/分镜就绪"] },
              paint: { status: "recovering", summary: ["未返回可用 URL，重试中"] },
            },
            assets: [
              { id: "A01", kind: "image", label: "A01 Keyframe", status: "Recovering" },
            ],
          });
          break;
        case "failed":
          set({
            ...base,
            phase: "failed",
            stages: {
              scene: { status: "ready", summary: ["方向已锁定"] },
              structure: { status: "ready", summary: ["脚本/分镜就绪"] },
              paint: { status: "ready", summary: ["A01 Ready"] },
              life: { status: "failed", summary: ["返回内容不是可播放视频"] },
              details: { status: "pending", summary: [] },
            },
            assets: [
              { id: "A01", kind: "image", label: "A01 Keyframe", status: "Ready", url: SAMPLE_KEYFRAME },
              { id: "V01", kind: "video", label: "V01 Video", status: "Failed" },
            ],
          });
          break;
      }
    },
  };
});
