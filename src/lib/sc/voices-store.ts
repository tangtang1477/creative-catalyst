import { create } from "zustand";
import {
  listVoices as fnList,
  cloneVoice as fnClone,
  deleteVoice as fnDelete,
  previewVoice as fnPreview,
} from "@/lib/voices.functions";

export type VoiceStatus = "uploading" | "cloning" | "ready" | "failed";

export interface VoiceRow {
  id: string;
  user_id: string | null;
  source: "preset" | "cloned";
  external_id: string | null;
  name: string;
  lang: string | null;
  description: string | null;
  sample_url: string | null;
  status: VoiceStatus;
  error: string | null;
  created_at: string;
}

interface VoicesState {
  voices: VoiceRow[];
  loading: boolean;
  error: string | null;
  loaded: boolean;
  cloneOpen: boolean;
  previewingId: string | null;
  currentAudioUrl: string | null;
  fetchVoices: () => Promise<void>;
  openClone: () => void;
  closeClone: () => void;
  clone: (input: { name: string; description?: string; audio_url: string }) => Promise<VoiceRow>;
  remove: (id: string) => Promise<void>;
  preview: (voiceId: string) => Promise<void>;
  stopPreview: () => void;
}

let currentAudio: HTMLAudioElement | null = null;

export const useVoices = create<VoicesState>((set, get) => ({
  voices: [],
  loading: false,
  error: null,
  loaded: false,
  cloneOpen: false,
  previewingId: null,
  currentAudioUrl: null,

  fetchVoices: async () => {
    if (get().loading) return;
    set({ loading: true, error: null });
    try {
      const { voices } = await fnList();
      set({ voices: voices as VoiceRow[], loaded: true });
    } catch (e) {
      set({ error: (e as Error).message });
    } finally {
      set({ loading: false });
    }
  },

  openClone: () => set({ cloneOpen: true }),
  closeClone: () => set({ cloneOpen: false }),

  clone: async (input) => {
    const { voice } = await fnClone({ data: input });
    set((s) => ({ voices: [voice as VoiceRow, ...s.voices], cloneOpen: false }));
    return voice as VoiceRow;
  },

  remove: async (id) => {
    await fnDelete({ data: { id } });
    set((s) => ({ voices: s.voices.filter((v) => v.id !== id) }));
  },

  preview: async (voiceId) => {
    get().stopPreview();
    // Create the Audio element synchronously so we stay within the user
    // gesture context — autoplay policies (Safari especially) block play()
    // when the element is created after an await.
    const audio = new Audio();
    audio.preload = "auto";
    currentAudio = audio;
    set({ previewingId: voiceId });
    try {
      const { audioBase64, mime } = await fnPreview({ data: { voice_id: voiceId } });
      // If a newer preview started or stop was called, abandon this one.
      if (currentAudio !== audio) return;
      const url = `data:${mime};base64,${audioBase64}`;
      audio.src = url;
      set({ currentAudioUrl: url });
      audio.onended = () => set({ previewingId: null, currentAudioUrl: null });
      audio.onerror = () => {
        console.error("[voice preview] audio element error", audio.error);
        set({ previewingId: null, currentAudioUrl: null, error: "音频播放失败" });
      };
      await audio.play();
    } catch (e) {
      console.error("[voice preview] failed:", e);
      if (currentAudio === audio) currentAudio = null;
      set({ previewingId: null, currentAudioUrl: null, error: (e as Error).message });
    }
  },

  stopPreview: () => {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }
    set({ previewingId: null, currentAudioUrl: null });
  },
}));
