import { create } from "zustand";
import {
  listProjects as fnList,
  createProject as fnCreate,
  deleteProject as fnDelete,
} from "@/lib/projects.functions";

export type ProjectKind = "investment" | "homework" | "writing" | "travel" | "custom";

export interface ProjectRow {
  id: string;
  name: string;
  kind: ProjectKind;
  icon: string | null;
  brief: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

interface ProjectsState {
  projects: ProjectRow[];
  loading: boolean;
  error: string | null;
  createOpen: boolean;
  /** Optional preset name when opening the dialog from the guidance card. */
  draft: { name?: string; kind?: ProjectKind } | null;
  loaded: boolean;
  fetchProjects: () => Promise<void>;
  openCreate: (draft?: { name?: string; kind?: ProjectKind } | null) => void;
  closeCreate: () => void;
  create: (input: { name: string; kind: ProjectKind; icon?: string }) => Promise<ProjectRow>;
  remove: (id: string) => Promise<void>;
}

export const useProjects = create<ProjectsState>((set, get) => ({
  projects: [],
  loading: false,
  error: null,
  createOpen: false,
  draft: null,
  loaded: false,

  fetchProjects: async () => {
    if (get().loading) return;
    set({ loading: true, error: null });
    try {
      const { projects } = await fnList();
      set({ projects: projects as ProjectRow[], loaded: true });
    } catch (e) {
      set({ error: (e as Error).message });
    } finally {
      set({ loading: false });
    }
  },

  openCreate: (draft = null) => set({ createOpen: true, draft }),
  closeCreate: () => set({ createOpen: false, draft: null }),

  create: async (input) => {
    const { project } = await fnCreate({ data: input });
    set((s) => ({ projects: [project as ProjectRow, ...s.projects], createOpen: false, draft: null }));
    return project as ProjectRow;
  },

  remove: async (id) => {
    await fnDelete({ data: { id } });
    set((s) => ({ projects: s.projects.filter((p) => p.id !== id) }));
  },
}));
