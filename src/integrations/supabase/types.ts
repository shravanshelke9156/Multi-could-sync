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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      cloud_config: {
        Row: {
          enabled: boolean
          id: string
          last_checked: string
          provider: Database["public"]["Enums"]["cloud_provider"]
          sim_state: Database["public"]["Enums"]["provider_sim_state"]
          user_id: string
        }
        Insert: {
          enabled?: boolean
          id?: string
          last_checked?: string
          provider: Database["public"]["Enums"]["cloud_provider"]
          sim_state?: Database["public"]["Enums"]["provider_sim_state"]
          user_id: string
        }
        Update: {
          enabled?: boolean
          id?: string
          last_checked?: string
          provider?: Database["public"]["Enums"]["cloud_provider"]
          sim_state?: Database["public"]["Enums"]["provider_sim_state"]
          user_id?: string
        }
        Relationships: []
      }
      cloud_files: {
        Row: {
          cloud_file_id: string | null
          file_id: string
          hash: string | null
          id: string
          last_synced: string | null
          provider: Database["public"]["Enums"]["cloud_provider"]
          status: Database["public"]["Enums"]["sync_status"]
          user_id: string
        }
        Insert: {
          cloud_file_id?: string | null
          file_id: string
          hash?: string | null
          id?: string
          last_synced?: string | null
          provider: Database["public"]["Enums"]["cloud_provider"]
          status?: Database["public"]["Enums"]["sync_status"]
          user_id: string
        }
        Update: {
          cloud_file_id?: string | null
          file_id?: string
          hash?: string | null
          id?: string
          last_synced?: string | null
          provider?: Database["public"]["Enums"]["cloud_provider"]
          status?: Database["public"]["Enums"]["sync_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cloud_files_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
        ]
      }
      file_versions: {
        Row: {
          created_at: string
          file_id: string
          file_size: number
          hash: string
          id: string
          storage_path: string
          user_id: string
          version_number: number
        }
        Insert: {
          created_at?: string
          file_id: string
          file_size?: number
          hash: string
          id?: string
          storage_path: string
          user_id: string
          version_number: number
        }
        Update: {
          created_at?: string
          file_id?: string
          file_size?: number
          hash?: string
          id?: string
          storage_path?: string
          user_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "file_versions_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
        ]
      }
      files: {
        Row: {
          created_at: string
          current_hash: string
          current_version: number
          file_size: number
          filename: string
          id: string
          mime_type: string | null
          overall_status: Database["public"]["Enums"]["sync_status"]
          storage_path: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_hash: string
          current_version?: number
          file_size?: number
          filename: string
          id?: string
          mime_type?: string | null
          overall_status?: Database["public"]["Enums"]["sync_status"]
          storage_path: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_hash?: string
          current_version?: number
          file_size?: number
          filename?: string
          id?: string
          mime_type?: string | null
          overall_status?: Database["public"]["Enums"]["sync_status"]
          storage_path?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
          name?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
        }
        Relationships: []
      }
      sync_logs: {
        Row: {
          created_at: string
          duration_ms: number | null
          file_id: string | null
          filename: string | null
          id: string
          message: string | null
          operation: string
          provider: Database["public"]["Enums"]["cloud_provider"] | null
          retry_count: number
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          file_id?: string | null
          filename?: string | null
          id?: string
          message?: string | null
          operation: string
          provider?: Database["public"]["Enums"]["cloud_provider"] | null
          retry_count?: number
          status: string
          user_id: string
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          file_id?: string | null
          filename?: string | null
          id?: string
          message?: string | null
          operation?: string
          provider?: Database["public"]["Enums"]["cloud_provider"] | null
          retry_count?: number
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_logs_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
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
      cloud_provider: "aws_s3" | "google_drive" | "azure_blob"
      provider_sim_state:
        | "AVAILABLE"
        | "UNAVAILABLE"
        | "SLOW"
        | "UPLOAD_FAILURE"
      sync_status:
        | "PENDING"
        | "SYNCING"
        | "SYNCHRONIZED"
        | "PARTIAL"
        | "FAILED"
        | "CONFLICT"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      cloud_provider: ["aws_s3", "google_drive", "azure_blob"],
      provider_sim_state: [
        "AVAILABLE",
        "UNAVAILABLE",
        "SLOW",
        "UPLOAD_FAILURE",
      ],
      sync_status: [
        "PENDING",
        "SYNCING",
        "SYNCHRONIZED",
        "PARTIAL",
        "FAILED",
        "CONFLICT",
      ],
    },
  },
} as const
