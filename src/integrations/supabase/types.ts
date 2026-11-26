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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      admin_emails: {
        Row: {
          email: string
        }
        Insert: {
          email: string
        }
        Update: {
          email?: string
        }
        Relationships: []
      }
      beta_codes: {
        Row: {
          active: boolean
          code: string
          created_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
        }
        Relationships: []
      }
      forex_api_calls: {
        Row: {
          at: string
          id: number
          pair: string | null
          purpose: string
        }
        Insert: {
          at?: string
          id?: number
          pair?: string | null
          purpose: string
        }
        Update: {
          at?: string
          id?: number
          pair?: string | null
          purpose?: string
        }
        Relationships: []
      }
      forex_candles: {
        Row: {
          close: number
          high: number
          low: number
          open: number
          pair: string
          tf: string
          time: number
        }
        Insert: {
          close: number
          high: number
          low: number
          open: number
          pair: string
          tf: string
          time: number
        }
        Update: {
          close?: number
          high?: number
          low?: number
          open?: number
          pair?: string
          tf?: string
          time?: number
        }
        Relationships: []
      }
      forex_pair_sync: {
        Row: {
          created_at: string
          history_loaded: boolean
          last_fetch: string
          pair: string
        }
        Insert: {
          created_at?: string
          history_loaded?: boolean
          last_fetch?: string
          pair: string
        }
        Update: {
          created_at?: string
          history_loaded?: boolean
          last_fetch?: string
          pair?: string
        }
        Relationships: []
      }
      forex_sync_state: {
        Row: {
          id: number
          last_run: string
        }
        Insert: {
          id?: number
          last_run?: string
        }
        Update: {
          id?: number
          last_run?: string
        }
        Relationships: []
      }
      ob_recorder_requests: {
        Row: {
          created_at: string
          request_id: number
          source: string
          ts: string
        }
        Insert: {
          created_at?: string
          request_id: number
          source: string
          ts: string
        }
        Update: {
          created_at?: string
          request_id?: number
          source?: string
          ts?: string
        }
        Relationships: []
      }
      ob_recorder_state: {
        Row: {
          binance_blocked_until: string | null
          id: number
          last_agg_trade_id: number | null
          last_error: string | null
          oldest_removed_day: string | null
          recording_started_at: string
          retention_warning: string | null
          updated_at: string
        }
        Insert: {
          binance_blocked_until?: string | null
          id?: number
          last_agg_trade_id?: number | null
          last_error?: string | null
          oldest_removed_day?: string | null
          recording_started_at?: string
          retention_warning?: string | null
          updated_at?: string
        }
        Update: {
          binance_blocked_until?: string | null
          id?: number
          last_agg_trade_id?: number | null
          last_error?: string | null
          oldest_removed_day?: string | null
          recording_started_at?: string
          retention_warning?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ob_snapshots: {
        Row: {
          asks: number[]
          base: number
          bids: number[]
          close: number | null
          created_at: string
          high: number | null
          id: number
          low: number | null
          mid: number
          price_points: Json
          source: string
          step: number
          symbol: string
          trade_levels: Json
          ts: string
        }
        Insert: {
          asks: number[]
          base: number
          bids: number[]
          close?: number | null
          created_at?: string
          high?: number | null
          id?: never
          low?: number | null
          mid: number
          price_points?: Json
          source: string
          step: number
          symbol?: string
          trade_levels?: Json
          ts: string
        }
        Update: {
          asks?: number[]
          base?: number
          bids?: number[]
          close?: number | null
          created_at?: string
          high?: number | null
          id?: never
          low?: number | null
          mid?: number
          price_points?: Json
          source?: string
          step?: number
          symbol?: string
          trade_levels?: Json
          ts?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          beta_access: boolean
          created_at: string
          display_name: string | null
          email: string
          id: string
        }
        Insert: {
          beta_access?: boolean
          created_at?: string
          display_name?: string | null
          email: string
          id: string
        }
        Update: {
          beta_access?: boolean
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_list_users: {
        Args: never
        Returns: {
          beta_access: boolean
          created_at: string
          email: string
          id: string
          is_admin: boolean
          verified: boolean
        }[]
      }
      admin_set_beta: {
        Args: { _on: boolean; _user: string }
        Returns: undefined
      }
      fx_take_call: {
        Args: {
          _day_cap?: number
          _min_cap?: number
          _pair: string
          _purpose: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      ob_fire: { Args: { p_source: string; p_ts: string }; Returns: undefined }
      ob_history: {
        Args: { p_every: number; p_from: string; p_to: string }
        Returns: {
          asks: number[]
          base: number
          bids: number[]
          close: number
          high: number
          low: number
          mid: number
          price_points: Json
          source: string
          step: number
          trade_levels: Json
          ts: string
        }[]
      }
      ob_recorder_cleanup: { Args: never; Returns: undefined }
      ob_recorder_cleanup_budget: {
        Args: { p_budget: number }
        Returns: undefined
      }
      ob_recorder_status: { Args: never; Returns: Json }
      ob_recorder_tick: { Args: never; Returns: undefined }
      ob_retention_stats: { Args: never; Returns: Json }
      ob_snapshots_bytes: { Args: never; Returns: number }
      ob_store: {
        Args: { p_asks: Json; p_bids: Json; p_source: string; p_ts: string }
        Returns: undefined
      }
      ob_store_trades: { Args: { p_trades: Json }; Returns: undefined }
      redeem_beta_code: { Args: { _code: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
