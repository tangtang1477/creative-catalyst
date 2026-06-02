import { create } from "zustand";
import { listCharacterVoices } from "@/lib/characters.functions";

export interface CVBinding {
  id: string;
  character_name: string;
  voice_id: string;
}

interface CVState {
  bindings: CVBinding[];
  loaded: boolean;
  loading: boolean;
  fetch: () => Promise<void>;
  refresh: () => Promise<void>;
  voiceForName: (name: string) => CVBinding | undefined;
}

export const useCharacterVoices = create<CVState>((set, get) => ({
  bindings: [],
  loaded: false,
  loading: false,
  fetch: async () => {
    if (get().loaded || get().loading) return;
    set({ loading: true });
    try {
      const r = await listCharacterVoices({ data: {} });
      set({ bindings: (r.bindings as CVBinding[]) ?? [], loaded: true });
    } catch {
      set({ loaded: true });
    } finally {
      set({ loading: false });
    }
  },
  refresh: async () => {
    set({ loading: true });
    try {
      const r = await listCharacterVoices({ data: {} });
      set({ bindings: (r.bindings as CVBinding[]) ?? [], loaded: true });
    } catch {
      /* ignore */
    } finally {
      set({ loading: false });
    }
  },
  voiceForName: (name) => get().bindings.find((b) => b.character_name === name),
}));
