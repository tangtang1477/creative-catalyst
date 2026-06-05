export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      assets: {
        Row: {
          caption: string | null
          created_at: string
          id: string
          kind: string
          label: string | null
          media_kind: string | null
          meta: Json | null
          parent_asset_id: string | null
          source: string
          stage: string | null
          task_id: string | null
          url: string
          user_id: string
          version: number
        }
        Insert: {
          caption?: string | null
          created_at?: string
          id?: string
          kind: string
          label?: string | null
          media_kind?: string | null
          meta?: Json | null
          parent_asset_id?: string | null
          source: string
          stage?: string | null
          task_id?: string | null
          url: string
          user_id: string
          version?: number
        }
        Update: {
          caption?: string | null
          created_at?: string
          id?: string
          kind?: string
          label?: string | null
          media_kind?: string | null
          meta?: Json | null
          parent_asset_id?: string | null
          source?: string
          stage?: string | null
          task_id?: string | null
          url?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "assets_parent_asset_id_fkey"
            columns: ["parent_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "video_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      character_voices: {
        Row: {
          character_name: string
          created_at: string
          id: string
          project_id: string | null
          task_id: string | null
          user_id: string
          voice_id: string
        }
        Insert: {
          character_name: string
          created_at?: string
          id?: string
          project_id?: string | null
          task_id?: string | null
          user_id: string
          voice_id: string
        }
        Update: {
          character_name?: string
          created_at?: string
          id?: string
          project_id?: string | null
          task_id?: string | null
          user_id?: string
          voice_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "character_voices_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "character_voices_voice_id_fkey"
            columns: ["voice_id"]
            isOneToOne: false
            referencedRelation: "voices"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_ledger: {
        Row: {
          cost: number
          created_at: string
          id: string
          kind: string
          label: string
          stage: string | null
          task_id: string | null
          user_id: string
        }
        Insert: {
          cost: number
          created_at?: string
          id?: string
          kind?: string
          label: string
          stage?: string | null
          task_id?: string | null
          user_id: string
        }
        Update: {
          cost?: number
          created_at?: string
          id?: string
          kind?: string
          label?: string
          stage?: string | null
          task_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      project_episodes: {
        Row: {
          created_at: string
          episode_no: number
          id: string
          project_id: string
          task_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          episode_no?: number
          id?: string
          project_id: string
          task_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          episode_no?: number
          id?: string
          project_id?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_episodes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_episodes_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "video_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          brief: Json | null
          created_at: string
          icon: string | null
          id: string
          kind: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          brief?: Json | null
          created_at?: string
          icon?: string | null
          id?: string
          kind?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          brief?: Json | null
          created_at?: string
          icon?: string | null
          id?: string
          kind?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      seedance_jobs: {
        Row: {
          asset_id: string | null
          created_at: string
          error_message: string | null
          oss_url: string | null
          progress: number
          raw: Json | null
          request_payload: Json | null
          route: string
          status: string
          task_id: string
          updated_at: string
          user_id: string
          video_task_id: string | null
        }
        Insert: {
          asset_id?: string | null
          created_at?: string
          error_message?: string | null
          oss_url?: string | null
          progress?: number
          raw?: Json | null
          request_payload?: Json | null
          route: string
          status?: string
          task_id: string
          updated_at?: string
          user_id: string
          video_task_id?: string | null
        }
        Update: {
          asset_id?: string | null
          created_at?: string
          error_message?: string | null
          oss_url?: string | null
          progress?: number
          raw?: Json | null
          request_payload?: Json | null
          route?: string
          status?: string
          task_id?: string
          updated_at?: string
          user_id?: string
          video_task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seedance_jobs_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seedance_jobs_video_task_id_fkey"
            columns: ["video_task_id"]
            isOneToOne: false
            referencedRelation: "video_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      video_tasks: {
        Row: {
          brief: Json | null
          created_at: string
          id: string
          kind: string
          project_id: string | null
          prompt: string
          snapshot: Json | null
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          brief?: Json | null
          created_at?: string
          id?: string
          kind?: string
          project_id?: string | null
          prompt: string
          snapshot?: Json | null
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          brief?: Json | null
          created_at?: string
          id?: string
          kind?: string
          project_id?: string | null
          prompt?: string
          snapshot?: Json | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      voices: {
        Row: {
          created_at: string
          description: string | null
          error: string | null
          external_id: string | null
          id: string
          lang: string | null
          name: string
          origin_audio_url: string | null
          sample_url: string | null
          source: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          error?: string | null
          external_id?: string | null
          id?: string
          lang?: string | null
          name: string
          origin_audio_url?: string | null
          sample_url?: string | null
          source?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          error?: string | null
          external_id?: string | null
          id?: string
          lang?: string | null
          name?: string
          origin_audio_url?: string | null
          sample_url?: string | null
          source?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      wan_jobs: {
        Row: {
          asset_id: string | null
          created_at: string
          error_message: string | null
          operations: Json | null
          oss_url: string | null
          progress: number
          raw: Json | null
          request_payload: Json | null
          route: string
          status: string
          task_id: string
          updated_at: string
          user_id: string
          video_task_id: string | null
        }
        Insert: {
          asset_id?: string | null
          created_at?: string
          error_message?: string | null
          operations?: Json | null
          oss_url?: string | null
          progress?: number
          raw?: Json | null
          request_payload?: Json | null
          route: string
          status?: string
          task_id: string
          updated_at?: string
          user_id: string
          video_task_id?: string | null
        }
        Update: {
          asset_id?: string | null
          created_at?: string
          error_message?: string | null
          operations?: Json | null
          oss_url?: string | null
          progress?: number
          raw?: Json | null
          request_payload?: Json | null
          route?: string
          status?: string
          task_id?: string
          updated_at?: string
          user_id?: string
          video_task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wan_jobs_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wan_jobs_video_task_id_fkey"
            columns: ["video_task_id"]
            isOneToOne: false
            referencedRelation: "video_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
