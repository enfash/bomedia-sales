export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      activity: {
        Row: {
          actor_name: string
          actor_uid: string
          created_at: string
          id: string
          message: string
          meta: Json | null
          type: Database["public"]["Enums"]["activity_type"]
        }
        Insert: {
          actor_name: string
          actor_uid: string
          created_at?: string
          id?: string
          message: string
          meta?: Json | null
          type: Database["public"]["Enums"]["activity_type"]
        }
        Update: {
          actor_name?: string
          actor_uid?: string
          created_at?: string
          id?: string
          message?: string
          meta?: Json | null
          type?: Database["public"]["Enums"]["activity_type"]
        }
        Relationships: []
      }
      allowed_users: {
        Row: {
          email: string
          invited_at: string
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          email: string
          invited_at?: string
          role?: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          email?: string
          invited_at?: string
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: []
      }
      batch_adjustments: {
        Row: {
          amount: number
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["adjustment_kind"]
          label: string
          sale_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["adjustment_kind"]
          label: string
          sale_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["adjustment_kind"]
          label?: string
          sale_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "batch_adjustments_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sale_totals"
            referencedColumns: ["sale_id"]
          },
          {
            foreignKeyName: "batch_adjustments_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          contact: string | null
          created_at: string
          id: string
          name: string
          name_key: string | null
        }
        Insert: {
          contact?: string | null
          created_at?: string
          id?: string
          name: string
          name_key?: string | null
        }
        Update: {
          contact?: string | null
          created_at?: string
          id?: string
          name?: string
          name_key?: string | null
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          category: Database["public"]["Enums"]["expense_category"]
          created_at: string
          description: string | null
          id: string
          logged_by: string
          logged_by_name: string
        }
        Insert: {
          amount: number
          category: Database["public"]["Enums"]["expense_category"]
          created_at?: string
          description?: string | null
          id?: string
          logged_by: string
          logged_by_name: string
        }
        Update: {
          amount?: number
          category?: Database["public"]["Enums"]["expense_category"]
          created_at?: string
          description?: string | null
          id?: string
          logged_by?: string
          logged_by_name?: string
        }
        Relationships: []
      }
      inventory_rolls: {
        Row: {
          category: string | null
          cost: number
          cost_per_sqft: number | null
          created_at: string
          id: string
          item_name: string
          low_stock_threshold_ft: number
          material_type: Database["public"]["Enums"]["material_type"]
          price_per_sqft: number
          raw_length_ft: number
          remaining_length_ft: number
          roll_code: string
          status: Database["public"]["Enums"]["roll_status"] | null
          total_length_ft: number
          waste_factor: number | null
          width_ft: number
        }
        Insert: {
          category?: string | null
          cost: number
          cost_per_sqft?: number | null
          created_at?: string
          id?: string
          item_name: string
          low_stock_threshold_ft?: number
          material_type: Database["public"]["Enums"]["material_type"]
          price_per_sqft: number
          raw_length_ft: number
          remaining_length_ft: number
          roll_code: string
          status?: Database["public"]["Enums"]["roll_status"] | null
          total_length_ft: number
          waste_factor?: number | null
          width_ft: number
        }
        Update: {
          category?: string | null
          cost?: number
          cost_per_sqft?: number | null
          created_at?: string
          id?: string
          item_name?: string
          low_stock_threshold_ft?: number
          material_type?: Database["public"]["Enums"]["material_type"]
          price_per_sqft?: number
          raw_length_ft?: number
          remaining_length_ft?: number
          roll_code?: string
          status?: Database["public"]["Enums"]["roll_status"] | null
          total_length_ft?: number
          waste_factor?: number | null
          width_ft?: number
        }
        Relationships: []
      }
      payment_allocations: {
        Row: {
          amount: number
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["allocation_kind"]
          payment_batch_id: string
          sale_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["allocation_kind"]
          payment_batch_id: string
          sale_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["allocation_kind"]
          payment_batch_id?: string
          sale_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_allocations_payment_batch_id_fkey"
            columns: ["payment_batch_id"]
            isOneToOne: false
            referencedRelation: "payment_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sale_totals"
            referencedColumns: ["sale_id"]
          },
          {
            foreignKeyName: "payment_allocations_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_batches: {
        Row: {
          collected_by: string
          collected_by_name: string
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          notes: string | null
          received_at: string
          reversal_of: string | null
          reversal_reason: string | null
          total_amount: number
        }
        Insert: {
          collected_by: string
          collected_by_name: string
          id?: string
          method: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          received_at?: string
          reversal_of?: string | null
          reversal_reason?: string | null
          total_amount: number
        }
        Update: {
          collected_by?: string
          collected_by_name?: string
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          received_at?: string
          reversal_of?: string | null
          reversal_reason?: string | null
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "payment_batches_reversal_of_fkey"
            columns: ["reversal_of"]
            isOneToOne: false
            referencedRelation: "payment_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          name: string | null
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          created_at?: string
          id: string
          name?: string | null
          role?: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          created_at?: string
          id?: string
          name?: string | null
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: []
      }
      quote_lines: {
        Row: {
          height_ft: number
          id: string
          material_type: Database["public"]["Enums"]["material_type"]
          quantity: number
          quote_id: string
          sqft: number | null
          unit_price: number
          width_ft: number
        }
        Insert: {
          height_ft: number
          id?: string
          material_type: Database["public"]["Enums"]["material_type"]
          quantity?: number
          quote_id: string
          sqft?: number | null
          unit_price: number
          width_ft: number
        }
        Update: {
          height_ft?: number
          id?: string
          material_type?: Database["public"]["Enums"]["material_type"]
          quantity?: number
          quote_id?: string
          sqft?: number | null
          unit_price?: number
          width_ft?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_lines_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["quote_id"]
          },
        ]
      }
      quotes: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          quote_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          quote_id?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          quote_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_debt"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "quotes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_line_consumption: {
        Row: {
          created_at: string
          id: string
          length_ft: number | null
          roll_id: string | null
          sale_line_id: string
          skip_reason: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          length_ft?: number | null
          roll_id?: string | null
          sale_line_id: string
          skip_reason?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          length_ft?: number | null
          roll_id?: string | null
          sale_line_id?: string
          skip_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sale_line_consumption_roll_id_fkey"
            columns: ["roll_id"]
            isOneToOne: false
            referencedRelation: "inventory_rolls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_line_consumption_sale_line_id_fkey"
            columns: ["sale_line_id"]
            isOneToOne: false
            referencedRelation: "sale_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_lines: {
        Row: {
          eyelets: boolean
          height_ft: number
          id: string
          job_name: string | null
          job_unit: string
          lamination: boolean
          material_type: Database["public"]["Enums"]["material_type"]
          quantity: number
          sale_id: string
          sqft: number | null
          total: number
          turnaround_time: string | null
          unit_price: number
          width_ft: number
        }
        Insert: {
          eyelets?: boolean
          height_ft: number
          id?: string
          job_name?: string | null
          job_unit?: string
          lamination?: boolean
          material_type: Database["public"]["Enums"]["material_type"]
          quantity?: number
          sale_id: string
          sqft?: number | null
          total: number
          turnaround_time?: string | null
          unit_price: number
          width_ft: number
        }
        Update: {
          eyelets?: boolean
          height_ft?: number
          id?: string
          job_name?: string | null
          job_unit?: string
          lamination?: boolean
          material_type?: Database["public"]["Enums"]["material_type"]
          quantity?: number
          sale_id?: string
          sqft?: number | null
          total?: number
          turnaround_time?: string | null
          unit_price?: number
          width_ft?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_lines_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sale_totals"
            referencedColumns: ["sale_id"]
          },
          {
            foreignKeyName: "sale_lines_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          client_id: string
          created_at: string
          due_date: string | null
          id: string
          is_voided: boolean
          job_status: Database["public"]["Enums"]["job_status"]
          logged_by: string
          logged_by_name: string
          notes: string | null
          receipt_number: string
          superseded_by_sale_id: string | null
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
          voided_by_name: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          due_date?: string | null
          id?: string
          is_voided?: boolean
          job_status?: Database["public"]["Enums"]["job_status"]
          logged_by: string
          logged_by_name: string
          notes?: string | null
          receipt_number: string
          superseded_by_sale_id?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
          voided_by_name?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          due_date?: string | null
          id?: string
          is_voided?: boolean
          job_status?: Database["public"]["Enums"]["job_status"]
          logged_by?: string
          logged_by_name?: string
          notes?: string | null
          receipt_number?: string
          superseded_by_sale_id?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
          voided_by_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_debt"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "sales_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_superseded_by_sale_id_fkey"
            columns: ["superseded_by_sale_id"]
            isOneToOne: false
            referencedRelation: "sale_totals"
            referencedColumns: ["sale_id"]
          },
          {
            foreignKeyName: "sales_superseded_by_sale_id_fkey"
            columns: ["superseded_by_sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      waste_log: {
        Row: {
          id: string
          length_ft: number
          logged_at: string
          logged_by: string
          reason: Database["public"]["Enums"]["waste_reason"]
          roll_id: string
        }
        Insert: {
          id?: string
          length_ft: number
          logged_at?: string
          logged_by: string
          reason: Database["public"]["Enums"]["waste_reason"]
          roll_id: string
        }
        Update: {
          id?: string
          length_ft?: number
          logged_at?: string
          logged_by?: string
          reason?: Database["public"]["Enums"]["waste_reason"]
          roll_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "waste_log_roll_id_fkey"
            columns: ["roll_id"]
            isOneToOne: false
            referencedRelation: "inventory_rolls"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      client_debt: {
        Row: {
          balance: number | null
          client_id: string | null
          name: string | null
          total_billed: number | null
          total_paid: number | null
        }
        Relationships: []
      }
      materials_valuation: {
        Row: {
          material_type: Database["public"]["Enums"]["material_type"] | null
          realised_expected_revenue: number | null
          remaining_asset_value: number | null
          remaining_expected_revenue: number | null
          remaining_length_ft: number | null
          roll_count: number | null
          total_cost: number | null
          total_length_ft: number | null
          width_ft: number | null
        }
        Relationships: []
      }
      sale_totals: {
        Row: {
          sale_id: string | null
          total_amount: number | null
          total_paid: number | null
        }
        Relationships: []
      }
      unconsumed_sale_lines: {
        Row: {
          material_type: Database["public"]["Enums"]["material_type"] | null
          quantity: number | null
          sale_created_at: string | null
          sale_id: string | null
          sale_line_id: string | null
          skip_reason: string | null
          skipped_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sale_line_consumption_sale_line_id_fkey"
            columns: ["sale_line_id"]
            isOneToOne: false
            referencedRelation: "sale_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_lines_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sale_totals"
            referencedColumns: ["sale_id"]
          },
          {
            foreignKeyName: "sale_lines_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      create_sale: {
        Args: {
          p_adjustments?: Json
          p_client_id: string
          p_due_date?: string
          p_lines: Json
          p_notes?: string
          p_opening_payment?: Json
          p_receipt_number: string
        }
        Returns: {
          client_id: string
          created_at: string
          due_date: string | null
          id: string
          is_voided: boolean
          job_status: Database["public"]["Enums"]["job_status"]
          logged_by: string
          logged_by_name: string
          notes: string | null
          receipt_number: string
          superseded_by_sale_id: string | null
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
          voided_by_name: string | null
        }
        SetofOptions: {
          from: "*"
          to: "sales"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      deduct_for_sale_line: {
        Args: { p_line: Database["public"]["Tables"]["sale_lines"]["Row"] }
        Returns: undefined
      }
      delete_auth_user_for_email: {
        Args: { target_email: string }
        Returns: undefined
      }
      is_admin: { Args: never; Returns: boolean }
      record_payment: {
        Args: {
          p_amount: number
          p_method: Database["public"]["Enums"]["payment_method"]
          p_payment_batch_id: string
          p_reversal_of?: string
          p_reversal_reason?: string
          p_sale_id: string
        }
        Returns: {
          collected_by: string
          collected_by_name: string
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          notes: string | null
          received_at: string
          reversal_of: string | null
          reversal_reason: string | null
          total_amount: number
        }
        SetofOptions: {
          from: "*"
          to: "payment_batches"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reverse_sale_line_consumption: {
        Args: { p_sale_line_id: string }
        Returns: undefined
      }
      revoke_user: { Args: { target_email: string }; Returns: undefined }
    }
    Enums: {
      activity_type:
        | "sale_created"
        | "payment_recorded"
        | "production_moved"
        | "expense_logged"
        | "sale_deleted"
        | "sale_edited"
      adjustment_kind: "mov" | "delivery" | "legacy"
      allocation_kind: "settlement" | "rounding"
      expense_category:
        | "Raw Materials"
        | "SAV 3ft"
        | "SAV 4ft"
        | "SAV 5ft"
        | "SAV 7ft"
        | "Flex 3ft"
        | "Flex 4ft"
        | "Flex 5ft"
        | "Flex 6ft"
        | "Flex 7ft"
        | "Flex 8ft"
        | "Flex 10ft"
        | "Ink"
        | "Equipment"
        | "Utilities"
        | "Salaries"
        | "Transport"
        | "Maintenance"
        | "Marketing"
        | "Office Supplies"
        | "Miscellaneous"
      job_status: "Queued" | "Printing" | "Finishing" | "Ready" | "Delivered"
      material_type:
        | "Flex"
        | "SAV"
        | "Window Graphics"
        | "Solite"
        | "Clear Stickers"
      payment_method: "Transfer" | "POS" | "Cash"
      roll_status: "Active" | "Low Stock" | "Out of Stock"
      user_role: "admin" | "staff"
      waste_reason:
        | "Print head calibration run"
        | "Colour alignment test strip"
        | "Media edge trim / setup"
        | "Misprinted job — reprint needed"
        | "Customer proof"
        | "Roll leader / tail damage"
        | "Machine jam — damaged section"
        | "Other (see description)"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      activity_type: [
        "sale_created",
        "payment_recorded",
        "production_moved",
        "expense_logged",
        "sale_deleted",
        "sale_edited",
      ],
      adjustment_kind: ["mov", "delivery", "legacy"],
      allocation_kind: ["settlement", "rounding"],
      expense_category: [
        "Raw Materials",
        "SAV 3ft",
        "SAV 4ft",
        "SAV 5ft",
        "SAV 7ft",
        "Flex 3ft",
        "Flex 4ft",
        "Flex 5ft",
        "Flex 6ft",
        "Flex 7ft",
        "Flex 8ft",
        "Flex 10ft",
        "Ink",
        "Equipment",
        "Utilities",
        "Salaries",
        "Transport",
        "Maintenance",
        "Marketing",
        "Office Supplies",
        "Miscellaneous",
      ],
      job_status: ["Queued", "Printing", "Finishing", "Ready", "Delivered"],
      material_type: [
        "Flex",
        "SAV",
        "Window Graphics",
        "Solite",
        "Clear Stickers",
      ],
      payment_method: ["Transfer", "POS", "Cash"],
      roll_status: ["Active", "Low Stock", "Out of Stock"],
      user_role: ["admin", "staff"],
      waste_reason: [
        "Print head calibration run",
        "Colour alignment test strip",
        "Media edge trim / setup",
        "Misprinted job — reprint needed",
        "Customer proof",
        "Roll leader / tail damage",
        "Machine jam — damaged section",
        "Other (see description)",
      ],
    },
  },
} as const

