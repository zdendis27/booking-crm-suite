export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      ai_conversations: {
        Row: {
          id: string
          salon_id: string
          user_id: string
          title: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          salon_id: string
          user_id: string
          title?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          salon_id?: string
          user_id?: string
          title?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_messages: {
        Row: {
          id: string
          conversation_id: string
          salon_id: string
          role: string
          content: string
          tool_calls: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          conversation_id: string
          salon_id: string
          role: string
          content?: string
          tool_calls?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          conversation_id?: string
          salon_id?: string
          role?: string
          content?: string
          tool_calls?: Json | null
          created_at?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          id: string
          salon_id: string
          actor_id: string | null
          action: string
          entity: string
          entity_id: string | null
          before: Json | null
          after: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          salon_id: string
          actor_id?: string | null
          action: string
          entity: string
          entity_id?: string | null
          before?: Json | null
          after?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          salon_id?: string
          actor_id?: string | null
          action?: string
          entity?: string
          entity_id?: string | null
          before?: Json | null
          after?: Json | null
          created_at?: string
        }
        Relationships: []
      }
      automation_defaults: {
        Row: {
          type: Database["public"]["Enums"]["automation_type"]
          enabled: boolean
          config: Json
          requires_feature: string | null
        }
        Insert: {
          type: Database["public"]["Enums"]["automation_type"]
          enabled: boolean
          config?: Json
          requires_feature?: string | null
        }
        Update: {
          type?: Database["public"]["Enums"]["automation_type"]
          enabled?: boolean
          config?: Json
          requires_feature?: string | null
        }
        Relationships: []
      }
      automations: {
        Row: {
          id: string
          salon_id: string
          type: Database["public"]["Enums"]["automation_type"]
          enabled: boolean
          config: Json
          channels: Database["public"]["Enums"]["notification_channel"][]
          updated_at: string
        }
        Insert: {
          id?: string
          salon_id: string
          type: Database["public"]["Enums"]["automation_type"]
          enabled?: boolean
          config?: Json
          channels?: Database["public"]["Enums"]["notification_channel"][]
          updated_at?: string
        }
        Update: {
          id?: string
          salon_id?: string
          type?: Database["public"]["Enums"]["automation_type"]
          enabled?: boolean
          config?: Json
          channels?: Database["public"]["Enums"]["notification_channel"][]
          updated_at?: string
        }
        Relationships: []
      }
      booking_adjustments: {
        Row: {
          id: string
          salon_id: string
          booking_id: string
          kind: Database["public"]["Enums"]["adjustment_kind"]
          label: string
          amount: number
          ref_id: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          salon_id: string
          booking_id: string
          kind: Database["public"]["Enums"]["adjustment_kind"]
          label: string
          amount: number
          ref_id?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          salon_id?: string
          booking_id?: string
          kind?: Database["public"]["Enums"]["adjustment_kind"]
          label?: string
          amount?: number
          ref_id?: string | null
          created_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      booking_items: {
        Row: {
          id: string
          salon_id: string
          booking_id: string
          service_id: string
          staff_id: string
          position: number
          starts_at: string
          ends_at: string
          buffer_after_min: number
          name_snap: string
          duration_snap: number
          price_snap: number
          vat_snap: number
        }
        Insert: {
          id?: string
          salon_id: string
          booking_id: string
          service_id: string
          staff_id: string
          position: number
          starts_at: string
          ends_at: string
          buffer_after_min?: number
          name_snap: string
          duration_snap: number
          price_snap: number
          vat_snap?: number
        }
        Update: {
          id?: string
          salon_id?: string
          booking_id?: string
          service_id?: string
          staff_id?: string
          position?: number
          starts_at?: string
          ends_at?: string
          buffer_after_min?: number
          name_snap?: string
          duration_snap?: number
          price_snap?: number
          vat_snap?: number
        }
        Relationships: []
      }
      booking_products: {
        Row: {
          id: string
          salon_id: string
          booking_id: string
          product_id: string
          staff_id: string | null
          quantity: number
          unit_price_snap: number
          vat_snap: number
          name_snap: string
          created_at: string
        }
        Insert: {
          id?: string
          salon_id: string
          booking_id: string
          product_id: string
          staff_id?: string | null
          quantity: number
          unit_price_snap: number
          vat_snap?: number
          name_snap: string
          created_at?: string
        }
        Update: {
          id?: string
          salon_id?: string
          booking_id?: string
          product_id?: string
          staff_id?: string | null
          quantity?: number
          unit_price_snap?: number
          vat_snap?: number
          name_snap?: string
          created_at?: string
        }
        Relationships: []
      }
      bookings: {
        Row: {
          id: string
          salon_id: string
          location_id: string
          client_id: string
          primary_staff_id: string | null
          status: Database["public"]["Enums"]["booking_status"]
          source: Database["public"]["Enums"]["booking_source"]
          starts_at: string
          ends_at: string
          price_total: number
          discount_total: number
          products_total: number
          client_note: string | null
          internal_note: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          confirmed_at: string | null
          completed_at: string | null
          expires_at: string | null
          deposit_amount: number
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          salon_id: string
          location_id: string
          client_id: string
          primary_staff_id?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          source?: Database["public"]["Enums"]["booking_source"]
          starts_at: string
          ends_at: string
          price_total?: number
          discount_total?: number
          products_total?: number
          client_note?: string | null
          internal_note?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          confirmed_at?: string | null
          completed_at?: string | null
          expires_at?: string | null
          deposit_amount?: number
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          salon_id?: string
          location_id?: string
          client_id?: string
          primary_staff_id?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          source?: Database["public"]["Enums"]["booking_source"]
          starts_at?: string
          ends_at?: string
          price_total?: number
          discount_total?: number
          products_total?: number
          client_note?: string | null
          internal_note?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          confirmed_at?: string | null
          completed_at?: string | null
          expires_at?: string | null
          deposit_amount?: number
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      campaigns: {
        Row: {
          id: string
          salon_id: string
          name: string
          channel: Database["public"]["Enums"]["notification_channel"]
          subject: string | null
          body: string
          segment: Json
          status: string
          sent_count: number
          launched_at: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          salon_id: string
          name: string
          channel: Database["public"]["Enums"]["notification_channel"]
          subject?: string | null
          body: string
          segment?: Json
          status?: string
          sent_count?: number
          launched_at?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          salon_id?: string
          name?: string
          channel?: Database["public"]["Enums"]["notification_channel"]
          subject?: string | null
          body?: string
          segment?: Json
          status?: string
          sent_count?: number
          launched_at?: string | null
          created_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      cash_register_sessions: {
        Row: {
          id: string
          salon_id: string
          location_id: string
          opened_by: string | null
          opened_at: string
          opening_float: number
          closed_by: string | null
          closed_at: string | null
          counted_cash: number | null
          expected_cash: number | null
          note: string | null
        }
        Insert: {
          id?: string
          salon_id: string
          location_id: string
          opened_by?: string | null
          opened_at?: string
          opening_float?: number
          closed_by?: string | null
          closed_at?: string | null
          counted_cash?: number | null
          expected_cash?: number | null
          note?: string | null
        }
        Update: {
          id?: string
          salon_id?: string
          location_id?: string
          opened_by?: string | null
          opened_at?: string
          opening_float?: number
          closed_by?: string | null
          closed_at?: string | null
          counted_cash?: number | null
          expected_cash?: number | null
          note?: string | null
        }
        Relationships: []
      }
      client_consents: {
        Row: {
          id: string
          salon_id: string
          client_id: string
          type: Database["public"]["Enums"]["consent_type"]
          granted_at: string
          revoked_at: string | null
          source: string
          text_version: string | null
        }
        Insert: {
          id?: string
          salon_id: string
          client_id: string
          type: Database["public"]["Enums"]["consent_type"]
          granted_at?: string
          revoked_at?: string | null
          source?: string
          text_version?: string | null
        }
        Update: {
          id?: string
          salon_id?: string
          client_id?: string
          type?: Database["public"]["Enums"]["consent_type"]
          granted_at?: string
          revoked_at?: string | null
          source?: string
          text_version?: string | null
        }
        Relationships: []
      }
      client_notes: {
        Row: {
          id: string
          salon_id: string
          client_id: string
          author_id: string | null
          body: string
          pinned: boolean
          created_at: string
        }
        Insert: {
          id?: string
          salon_id: string
          client_id: string
          author_id?: string | null
          body: string
          pinned?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          salon_id?: string
          client_id?: string
          author_id?: string | null
          body?: string
          pinned?: boolean
          created_at?: string
        }
        Relationships: []
      }
      client_stats: {
        Row: {
          client_id: string
          salon_id: string
          visits_count: number
          no_show_count: number
          cancelled_count: number
          total_spent: number
          first_visit_at: string | null
          last_visit_at: string | null
          avg_interval_days: number | null
          next_expected_at: string | null
          favorite_staff_id: string | null
          favorite_service_id: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          salon_id: string
          visits_count?: number
          no_show_count?: number
          cancelled_count?: number
          total_spent?: number
          first_visit_at?: string | null
          last_visit_at?: string | null
          avg_interval_days?: number | null
          next_expected_at?: string | null
          favorite_staff_id?: string | null
          favorite_service_id?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          salon_id?: string
          visits_count?: number
          no_show_count?: number
          cancelled_count?: number
          total_spent?: number
          first_visit_at?: string | null
          last_visit_at?: string | null
          avg_interval_days?: number | null
          next_expected_at?: string | null
          favorite_staff_id?: string | null
          favorite_service_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      client_verifications: {
        Row: {
          id: string
          account_id: string
          channel: Database["public"]["Enums"]["verification_channel"]
          target: string
          code_hash: string
          ip_hash: string | null
          attempts: number
          created_at: string
          expires_at: string
          verified_at: string | null
        }
        Insert: {
          id?: string
          account_id: string
          channel: Database["public"]["Enums"]["verification_channel"]
          target: string
          code_hash: string
          ip_hash?: string | null
          attempts?: number
          created_at?: string
          expires_at: string
          verified_at?: string | null
        }
        Update: {
          id?: string
          account_id?: string
          channel?: Database["public"]["Enums"]["verification_channel"]
          target?: string
          code_hash?: string
          ip_hash?: string | null
          attempts?: number
          created_at?: string
          expires_at?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      clients: {
        Row: {
          id: string
          salon_id: string
          customer_account_id: string | null
          first_name: string
          last_name: string
          full_name: string | null
          phone: string | null
          email: string | null
          phone_verified_at: string | null
          email_verified_at: string | null
          birthday: string | null
          source: string
          merged_into: string | null
          anonymized_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          salon_id: string
          customer_account_id?: string | null
          first_name?: string
          last_name?: string
          phone?: string | null
          email?: string | null
          phone_verified_at?: string | null
          email_verified_at?: string | null
          birthday?: string | null
          source?: string
          merged_into?: string | null
          anonymized_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          salon_id?: string
          customer_account_id?: string | null
          first_name?: string
          last_name?: string
          phone?: string | null
          email?: string | null
          phone_verified_at?: string | null
          email_verified_at?: string | null
          birthday?: string | null
          source?: string
          merged_into?: string | null
          anonymized_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      commission_entries: {
        Row: {
          id: string
          salon_id: string
          booking_id: string
          staff_id: string
          source: string
          ref_id: string | null
          description: string
          base_amount: number
          rate_percent: number | null
          fixed_amount: number | null
          amount: number
          earned_on: string
          payout_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          salon_id: string
          booking_id: string
          staff_id: string
          source: string
          ref_id?: string | null
          description: string
          base_amount: number
          rate_percent?: number | null
          fixed_amount?: number | null
          amount: number
          earned_on: string
          payout_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          salon_id?: string
          booking_id?: string
          staff_id?: string
          source?: string
          ref_id?: string | null
          description?: string
          base_amount?: number
          rate_percent?: number | null
          fixed_amount?: number | null
          amount?: number
          earned_on?: string
          payout_id?: string | null
          created_at?: string
        }
        Relationships: []
      }
      commission_payouts: {
        Row: {
          id: string
          salon_id: string
          staff_id: string
          period_from: string
          period_to: string
          total: number
          status: string
          paid_at: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          salon_id: string
          staff_id: string
          period_from: string
          period_to: string
          total?: number
          status?: string
          paid_at?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          salon_id?: string
          staff_id?: string
          period_from?: string
          period_to?: string
          total?: number
          status?: string
          paid_at?: string | null
          created_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      customer_accounts: {
        Row: {
          id: string
          user_id: string
          email: string | null
          email_verified_at: string | null
          email_is_relay: boolean
          phone: string | null
          phone_verified_at: string | null
          first_name: string | null
          last_name: string | null
          birthday: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          email?: string | null
          email_verified_at?: string | null
          email_is_relay?: boolean
          phone?: string | null
          phone_verified_at?: string | null
          first_name?: string | null
          last_name?: string | null
          birthday?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          email?: string | null
          email_verified_at?: string | null
          email_is_relay?: boolean
          phone?: string | null
          phone_verified_at?: string | null
          first_name?: string | null
          last_name?: string | null
          birthday?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      customer_favorites: {
        Row: {
          id: string
          account_id: string
          salon_id: string
          staff_id: string | null
          service_ids: string[]
          label: string | null
          created_at: string
        }
        Insert: {
          id?: string
          account_id: string
          salon_id: string
          staff_id?: string | null
          service_ids?: string[]
          label?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          account_id?: string
          salon_id?: string
          staff_id?: string | null
          service_ids?: string[]
          label?: string | null
          created_at?: string
        }
        Relationships: []
      }
      deposit_policies: {
        Row: {
          salon_id: string
          enabled: boolean
          mode: string
          value: number
          only_new_clients: boolean
          min_total: number
          refundable_until_h: number
          updated_at: string
        }
        Insert: {
          salon_id: string
          enabled?: boolean
          mode?: string
          value?: number
          only_new_clients?: boolean
          min_total?: number
          refundable_until_h?: number
          updated_at?: string
        }
        Update: {
          salon_id?: string
          enabled?: boolean
          mode?: string
          value?: number
          only_new_clients?: boolean
          min_total?: number
          refundable_until_h?: number
          updated_at?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          id: string
          salon_id: string
          location_id: string | null
          supplier_id: string | null
          category: string
          description: string
          amount: number
          vat_amount: number
          method: Database["public"]["Enums"]["payment_method"]
          incurred_on: string
          receipt_path: string | null
          cash_session_id: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          salon_id: string
          location_id?: string | null
          supplier_id?: string | null
          category?: string
          description: string
          amount: number
          vat_amount?: number
          method?: Database["public"]["Enums"]["payment_method"]
          incurred_on?: string
          receipt_path?: string | null
          cash_session_id?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          salon_id?: string
          location_id?: string | null
          supplier_id?: string | null
          category?: string
          description?: string
          amount?: number
          vat_amount?: number
          method?: Database["public"]["Enums"]["payment_method"]
          incurred_on?: string
          receipt_path?: string | null
          cash_session_id?: string | null
          created_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      invoice_counters: {
        Row: {
          salon_id: string
          kind: Database["public"]["Enums"]["invoice_kind"]
          year: number
          last_number: number
        }
        Insert: {
          salon_id: string
          kind: Database["public"]["Enums"]["invoice_kind"]
          year: number
          last_number?: number
        }
        Update: {
          salon_id?: string
          kind?: Database["public"]["Enums"]["invoice_kind"]
          year?: number
          last_number?: number
        }
        Relationships: []
      }
      invoice_items: {
        Row: {
          id: string
          salon_id: string
          invoice_id: string
          position: number
          description: string
          quantity: number
          unit: string
          unit_price: number
          vat_rate: number
          total_gross: number
          total_net: number
          total_vat: number
        }
        Insert: {
          id?: string
          salon_id: string
          invoice_id: string
          position?: number
          description: string
          quantity?: number
          unit?: string
          unit_price: number
          vat_rate?: number
          total_gross?: number
          total_net?: number
          total_vat?: number
        }
        Update: {
          id?: string
          salon_id?: string
          invoice_id?: string
          position?: number
          description?: string
          quantity?: number
          unit?: string
          unit_price?: number
          vat_rate?: number
          total_gross?: number
          total_net?: number
          total_vat?: number
        }
        Relationships: []
      }
      invoice_payments: {
        Row: {
          id: string
          salon_id: string
          invoice_id: string
          payment_id: string | null
          amount: number
          paid_on: string
          bank_ref: string | null
          created_at: string
        }
        Insert: {
          id?: string
          salon_id: string
          invoice_id: string
          payment_id?: string | null
          amount: number
          paid_on?: string
          bank_ref?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          salon_id?: string
          invoice_id?: string
          payment_id?: string | null
          amount?: number
          paid_on?: string
          bank_ref?: string | null
          created_at?: string
        }
        Relationships: []
      }
      invoice_series: {
        Row: {
          salon_id: string
          kind: Database["public"]["Enums"]["invoice_kind"]
          prefix: string
        }
        Insert: {
          salon_id: string
          kind: Database["public"]["Enums"]["invoice_kind"]
          prefix: string
        }
        Update: {
          salon_id?: string
          kind?: Database["public"]["Enums"]["invoice_kind"]
          prefix?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          id: string
          salon_id: string
          kind: Database["public"]["Enums"]["invoice_kind"]
          status: Database["public"]["Enums"]["invoice_status"]
          number: string | null
          variable_symbol: string | null
          client_id: string | null
          booking_id: string | null
          related_invoice_id: string | null
          supplier: Json | null
          customer_name: string
          customer_ico: string | null
          customer_dic: string | null
          customer_street: string | null
          customer_city: string | null
          customer_zip: string | null
          customer_country: string
          customer_email: string | null
          issue_date: string | null
          taxable_supply_date: string | null
          due_date: string | null
          currency: string
          vat_payer: boolean
          total_net: number
          total_vat: number
          total_gross: number
          vat_summary: Json
          advance_paid: number
          paid_amount: number
          note: string | null
          pdf_path: string | null
          sent_at: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          salon_id: string
          kind?: Database["public"]["Enums"]["invoice_kind"]
          status?: Database["public"]["Enums"]["invoice_status"]
          number?: string | null
          variable_symbol?: string | null
          client_id?: string | null
          booking_id?: string | null
          related_invoice_id?: string | null
          supplier?: Json | null
          customer_name: string
          customer_ico?: string | null
          customer_dic?: string | null
          customer_street?: string | null
          customer_city?: string | null
          customer_zip?: string | null
          customer_country?: string
          customer_email?: string | null
          issue_date?: string | null
          taxable_supply_date?: string | null
          due_date?: string | null
          currency?: string
          vat_payer?: boolean
          total_net?: number
          total_vat?: number
          total_gross?: number
          vat_summary?: Json
          advance_paid?: number
          paid_amount?: number
          note?: string | null
          pdf_path?: string | null
          sent_at?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          salon_id?: string
          kind?: Database["public"]["Enums"]["invoice_kind"]
          status?: Database["public"]["Enums"]["invoice_status"]
          number?: string | null
          variable_symbol?: string | null
          client_id?: string | null
          booking_id?: string | null
          related_invoice_id?: string | null
          supplier?: Json | null
          customer_name?: string
          customer_ico?: string | null
          customer_dic?: string | null
          customer_street?: string | null
          customer_city?: string | null
          customer_zip?: string | null
          customer_country?: string
          customer_email?: string | null
          issue_date?: string | null
          taxable_supply_date?: string | null
          due_date?: string | null
          currency?: string
          vat_payer?: boolean
          total_net?: number
          total_vat?: number
          total_gross?: number
          vat_summary?: Json
          advance_paid?: number
          paid_amount?: number
          note?: string | null
          pdf_path?: string | null
          sent_at?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      location_booking_settings: {
        Row: {
          location_id: string
          salon_id: string
          slot_interval_min: number
          min_notice_min: number
          max_advance_days: number
          cancel_deadline_h: number
          confirmation_mode: Database["public"]["Enums"]["confirmation_mode"]
          hold_minutes: number
        }
        Insert: {
          location_id: string
          salon_id: string
          slot_interval_min?: number
          min_notice_min?: number
          max_advance_days?: number
          cancel_deadline_h?: number
          confirmation_mode?: Database["public"]["Enums"]["confirmation_mode"]
          hold_minutes?: number
        }
        Update: {
          location_id?: string
          salon_id?: string
          slot_interval_min?: number
          min_notice_min?: number
          max_advance_days?: number
          cancel_deadline_h?: number
          confirmation_mode?: Database["public"]["Enums"]["confirmation_mode"]
          hold_minutes?: number
        }
        Relationships: []
      }
      location_hours: {
        Row: {
          id: string
          salon_id: string
          location_id: string
          weekday: number
          opens: string
          closes: string
        }
        Insert: {
          id?: string
          salon_id: string
          location_id: string
          weekday: number
          opens: string
          closes: string
        }
        Update: {
          id?: string
          salon_id?: string
          location_id?: string
          weekday?: number
          opens?: string
          closes?: string
        }
        Relationships: []
      }
      locations: {
        Row: {
          id: string
          salon_id: string
          name: string
          slug: string
          address_street: string | null
          address_city: string | null
          address_zip: string | null
          lat: number | null
          lng: number | null
          phone: string | null
          email: string | null
          created_at: string
          updated_at: string
          archived_at: string | null
        }
        Insert: {
          id?: string
          salon_id: string
          name: string
          slug: string
          address_street?: string | null
          address_city?: string | null
          address_zip?: string | null
          lat?: number | null
          lng?: number | null
          phone?: string | null
          email?: string | null
          created_at?: string
          updated_at?: string
          archived_at?: string | null
        }
        Update: {
          id?: string
          salon_id?: string
          name?: string
          slug?: string
          address_street?: string | null
          address_city?: string | null
          address_zip?: string | null
          lat?: number | null
          lng?: number | null
          phone?: string | null
          email?: string | null
          created_at?: string
          updated_at?: string
          archived_at?: string | null
        }
        Relationships: []
      }
      loyalty_events: {
        Row: {
          id: string
          salon_id: string
          client_id: string
          program_id: string
          booking_id: string | null
          reward_id: string | null
          type: Database["public"]["Enums"]["loyalty_event_type"]
          delta: number
          reason: string | null
          reversed_at: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          salon_id: string
          client_id: string
          program_id: string
          booking_id?: string | null
          reward_id?: string | null
          type: Database["public"]["Enums"]["loyalty_event_type"]
          delta?: number
          reason?: string | null
          reversed_at?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          salon_id?: string
          client_id?: string
          program_id?: string
          booking_id?: string | null
          reward_id?: string | null
          type?: Database["public"]["Enums"]["loyalty_event_type"]
          delta?: number
          reason?: string | null
          reversed_at?: string | null
          created_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      loyalty_programs: {
        Row: {
          id: string
          salon_id: string
          name: string
          active: boolean
          threshold: number
          reward_type: Database["public"]["Enums"]["reward_type"]
          reward_service_id: string | null
          reward_value: number | null
          reward_scope_service_ids: string[] | null
          stamp_valid_months: number | null
          reward_valid_months: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          salon_id: string
          name?: string
          active?: boolean
          threshold: number
          reward_type: Database["public"]["Enums"]["reward_type"]
          reward_service_id?: string | null
          reward_value?: number | null
          reward_scope_service_ids?: string[] | null
          stamp_valid_months?: number | null
          reward_valid_months?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          salon_id?: string
          name?: string
          active?: boolean
          threshold?: number
          reward_type?: Database["public"]["Enums"]["reward_type"]
          reward_service_id?: string | null
          reward_value?: number | null
          reward_scope_service_ids?: string[] | null
          stamp_valid_months?: number | null
          reward_valid_months?: number | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      loyalty_rewards: {
        Row: {
          id: string
          salon_id: string
          client_id: string
          program_id: string
          status: Database["public"]["Enums"]["reward_status"]
          reward_type: Database["public"]["Enums"]["reward_type"]
          reward_service_id: string | null
          reward_value: number | null
          reward_scope_service_ids: string[] | null
          earned_at: string
          earned_booking_id: string | null
          expires_at: string | null
          redeemed_at: string | null
          redeemed_booking_id: string | null
        }
        Insert: {
          id?: string
          salon_id: string
          client_id: string
          program_id: string
          status?: Database["public"]["Enums"]["reward_status"]
          reward_type: Database["public"]["Enums"]["reward_type"]
          reward_service_id?: string | null
          reward_value?: number | null
          reward_scope_service_ids?: string[] | null
          earned_at?: string
          earned_booking_id?: string | null
          expires_at?: string | null
          redeemed_at?: string | null
          redeemed_booking_id?: string | null
        }
        Update: {
          id?: string
          salon_id?: string
          client_id?: string
          program_id?: string
          status?: Database["public"]["Enums"]["reward_status"]
          reward_type?: Database["public"]["Enums"]["reward_type"]
          reward_service_id?: string | null
          reward_value?: number | null
          reward_scope_service_ids?: string[] | null
          earned_at?: string
          earned_booking_id?: string | null
          expires_at?: string | null
          redeemed_at?: string | null
          redeemed_booking_id?: string | null
        }
        Relationships: []
      }
      memberships: {
        Row: {
          id: string
          salon_id: string
          user_id: string
          role: Database["public"]["Enums"]["salon_role"]
          created_at: string
        }
        Insert: {
          id?: string
          salon_id: string
          user_id: string
          role: Database["public"]["Enums"]["salon_role"]
          created_at?: string
        }
        Update: {
          id?: string
          salon_id?: string
          user_id?: string
          role?: Database["public"]["Enums"]["salon_role"]
          created_at?: string
        }
        Relationships: []
      }
      notification_templates: {
        Row: {
          id: string
          salon_id: string
          type: Database["public"]["Enums"]["automation_type"]
          channel: Database["public"]["Enums"]["notification_channel"]
          subject: string | null
          body: string
          updated_at: string
        }
        Insert: {
          id?: string
          salon_id: string
          type: Database["public"]["Enums"]["automation_type"]
          channel: Database["public"]["Enums"]["notification_channel"]
          subject?: string | null
          body: string
          updated_at?: string
        }
        Update: {
          id?: string
          salon_id?: string
          type?: Database["public"]["Enums"]["automation_type"]
          channel?: Database["public"]["Enums"]["notification_channel"]
          subject?: string | null
          body?: string
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          id: string
          salon_id: string
          client_id: string | null
          user_id: string | null
          booking_id: string | null
          campaign_id: string | null
          channel: Database["public"]["Enums"]["notification_channel"]
          type: string
          recipient: string | null
          payload: Json
          scheduled_for: string
          status: Database["public"]["Enums"]["notification_status"]
          attempts: number
          last_error: string | null
          claimed_at: string | null
          sent_at: string | null
          read_at: string | null
          provider_id: string | null
          dedupe_key: string
          created_at: string
        }
        Insert: {
          id?: string
          salon_id: string
          client_id?: string | null
          user_id?: string | null
          booking_id?: string | null
          campaign_id?: string | null
          channel: Database["public"]["Enums"]["notification_channel"]
          type: string
          recipient?: string | null
          payload?: Json
          scheduled_for?: string
          status?: Database["public"]["Enums"]["notification_status"]
          attempts?: number
          last_error?: string | null
          claimed_at?: string | null
          sent_at?: string | null
          read_at?: string | null
          provider_id?: string | null
          dedupe_key: string
          created_at?: string
        }
        Update: {
          id?: string
          salon_id?: string
          client_id?: string | null
          user_id?: string | null
          booking_id?: string | null
          campaign_id?: string | null
          channel?: Database["public"]["Enums"]["notification_channel"]
          type?: string
          recipient?: string | null
          payload?: Json
          scheduled_for?: string
          status?: Database["public"]["Enums"]["notification_status"]
          attempts?: number
          last_error?: string | null
          claimed_at?: string | null
          sent_at?: string | null
          read_at?: string | null
          provider_id?: string | null
          dedupe_key?: string
          created_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          id: string
          salon_id: string
          location_id: string | null
          booking_id: string | null
          client_id: string | null
          invoice_id: string | null
          voucher_id: string | null
          refund_of: string | null
          kind: Database["public"]["Enums"]["payment_kind"]
          method: Database["public"]["Enums"]["payment_method"]
          status: Database["public"]["Enums"]["payment_status"]
          amount: number
          currency: string
          stripe_payment_intent_id: string | null
          stripe_charge_id: string | null
          cash_session_id: string | null
          note: string | null
          paid_at: string
          recorded_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          salon_id: string
          location_id?: string | null
          booking_id?: string | null
          client_id?: string | null
          invoice_id?: string | null
          voucher_id?: string | null
          refund_of?: string | null
          kind?: Database["public"]["Enums"]["payment_kind"]
          method: Database["public"]["Enums"]["payment_method"]
          status?: Database["public"]["Enums"]["payment_status"]
          amount: number
          currency?: string
          stripe_payment_intent_id?: string | null
          stripe_charge_id?: string | null
          cash_session_id?: string | null
          note?: string | null
          paid_at?: string
          recorded_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          salon_id?: string
          location_id?: string | null
          booking_id?: string | null
          client_id?: string | null
          invoice_id?: string | null
          voucher_id?: string | null
          refund_of?: string | null
          kind?: Database["public"]["Enums"]["payment_kind"]
          method?: Database["public"]["Enums"]["payment_method"]
          status?: Database["public"]["Enums"]["payment_status"]
          amount?: number
          currency?: string
          stripe_payment_intent_id?: string | null
          stripe_charge_id?: string | null
          cash_session_id?: string | null
          note?: string | null
          paid_at?: string
          recorded_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      plans: {
        Row: {
          code: string
          name: string
          price_monthly: number
          limits: Json
          sort: number
        }
        Insert: {
          code: string
          name: string
          price_monthly?: number
          limits?: Json
          sort?: number
        }
        Update: {
          code?: string
          name?: string
          price_monthly?: number
          limits?: Json
          sort?: number
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          key: string
          value: Json
        }
        Insert: {
          key: string
          value: Json
        }
        Update: {
          key?: string
          value?: Json
        }
        Relationships: []
      }
      products: {
        Row: {
          id: string
          salon_id: string
          name: string
          sku: string | null
          barcode: string | null
          category: string | null
          unit: string
          purchase_price: number
          sale_price: number
          vat_rate: number
          stock: number
          min_stock: number
          sellable: boolean
          supplier_id: string | null
          created_at: string
          updated_at: string
          archived_at: string | null
        }
        Insert: {
          id?: string
          salon_id: string
          name: string
          sku?: string | null
          barcode?: string | null
          category?: string | null
          unit?: string
          purchase_price?: number
          sale_price?: number
          vat_rate?: number
          stock?: number
          min_stock?: number
          sellable?: boolean
          supplier_id?: string | null
          created_at?: string
          updated_at?: string
          archived_at?: string | null
        }
        Update: {
          id?: string
          salon_id?: string
          name?: string
          sku?: string | null
          barcode?: string | null
          category?: string | null
          unit?: string
          purchase_price?: number
          sale_price?: number
          vat_rate?: number
          stock?: number
          min_stock?: number
          sellable?: boolean
          supplier_id?: string | null
          created_at?: string
          updated_at?: string
          archived_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          user_id: string
          full_name: string | null
          phone: string | null
          avatar_path: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          full_name?: string | null
          phone?: string | null
          avatar_path?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          full_name?: string | null
          phone?: string | null
          avatar_path?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      promo_codes: {
        Row: {
          id: string
          salon_id: string
          code: string
          type: string
          value: number
          valid_from: string | null
          valid_to: string | null
          max_uses: number | null
          used_count: number
          service_ids: string[] | null
          active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          salon_id: string
          code: string
          type: string
          value: number
          valid_from?: string | null
          valid_to?: string | null
          max_uses?: number | null
          used_count?: number
          service_ids?: string[] | null
          active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          salon_id?: string
          code?: string
          type?: string
          value?: number
          valid_from?: string | null
          valid_to?: string | null
          max_uses?: number | null
          used_count?: number
          service_ids?: string[] | null
          active?: boolean
          created_at?: string
        }
        Relationships: []
      }
      purchase_order_items: {
        Row: {
          id: string
          salon_id: string
          purchase_order_id: string
          product_id: string
          quantity: number
          unit_cost: number
        }
        Insert: {
          id?: string
          salon_id: string
          purchase_order_id: string
          product_id: string
          quantity: number
          unit_cost: number
        }
        Update: {
          id?: string
          salon_id?: string
          purchase_order_id?: string
          product_id?: string
          quantity?: number
          unit_cost?: number
        }
        Relationships: []
      }
      purchase_orders: {
        Row: {
          id: string
          salon_id: string
          supplier_id: string | null
          status: string
          ordered_at: string | null
          received_at: string | null
          note: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          salon_id: string
          supplier_id?: string | null
          status?: string
          ordered_at?: string | null
          received_at?: string | null
          note?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          salon_id?: string
          supplier_id?: string | null
          status?: string
          ordered_at?: string | null
          received_at?: string | null
          note?: string | null
          created_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          id: string
          user_id: string
          endpoint: string
          p256dh: string
          auth: string
          user_agent: string | null
          created_at: string
          last_used_at: string | null
          disabled_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          endpoint: string
          p256dh: string
          auth: string
          user_agent?: string | null
          created_at?: string
          last_used_at?: string | null
          disabled_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          endpoint?: string
          p256dh?: string
          auth?: string
          user_agent?: string | null
          created_at?: string
          last_used_at?: string | null
          disabled_at?: string | null
        }
        Relationships: []
      }
      salon_billing_profiles: {
        Row: {
          salon_id: string
          legal_name: string | null
          ico: string | null
          dic: string | null
          vat_payer: boolean
          address_street: string | null
          address_city: string | null
          address_zip: string | null
          country: string
          iban: string | null
          bank_account: string | null
          swift: string | null
          invoice_note: string | null
          invoice_logo_path: string | null
          default_due_days: number
          created_at: string
          updated_at: string
        }
        Insert: {
          salon_id: string
          legal_name?: string | null
          ico?: string | null
          dic?: string | null
          vat_payer?: boolean
          address_street?: string | null
          address_city?: string | null
          address_zip?: string | null
          country?: string
          iban?: string | null
          bank_account?: string | null
          swift?: string | null
          invoice_note?: string | null
          invoice_logo_path?: string | null
          default_due_days?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          salon_id?: string
          legal_name?: string | null
          ico?: string | null
          dic?: string | null
          vat_payer?: boolean
          address_street?: string | null
          address_city?: string | null
          address_zip?: string | null
          country?: string
          iban?: string | null
          bank_account?: string | null
          swift?: string | null
          invoice_note?: string | null
          invoice_logo_path?: string | null
          default_due_days?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      salon_commission_settings: {
        Row: {
          salon_id: string
          mode: string
          base_mode: string
          include_tips: boolean
          updated_at: string
        }
        Insert: {
          salon_id: string
          mode?: string
          base_mode?: string
          include_tips?: boolean
          updated_at?: string
        }
        Update: {
          salon_id?: string
          mode?: string
          base_mode?: string
          include_tips?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      salon_invites: {
        Row: {
          id: string
          salon_id: string
          email: string
          role: Database["public"]["Enums"]["salon_role"]
          staff_id: string | null
          token_hash: string
          expires_at: string
          accepted_at: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          salon_id: string
          email: string
          role: Database["public"]["Enums"]["salon_role"]
          staff_id?: string | null
          token_hash: string
          expires_at?: string
          accepted_at?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          salon_id?: string
          email?: string
          role?: Database["public"]["Enums"]["salon_role"]
          staff_id?: string | null
          token_hash?: string
          expires_at?: string
          accepted_at?: string | null
          created_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      salon_photos: {
        Row: {
          id: string
          salon_id: string
          path: string
          caption: string | null
          sort: number
          created_at: string
        }
        Insert: {
          id?: string
          salon_id: string
          path: string
          caption?: string | null
          sort?: number
          created_at?: string
        }
        Update: {
          id?: string
          salon_id?: string
          path?: string
          caption?: string | null
          sort?: number
          created_at?: string
        }
        Relationships: []
      }
      salon_reviews: {
        Row: {
          id: string
          salon_id: string
          author: string
          rating: number
          body: string | null
          published: boolean
          created_at: string
        }
        Insert: {
          id?: string
          salon_id: string
          author: string
          rating: number
          body?: string | null
          published?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          salon_id?: string
          author?: string
          rating?: number
          body?: string | null
          published?: boolean
          created_at?: string
        }
        Relationships: []
      }
      salons: {
        Row: {
          id: string
          name: string
          slug: string
          timezone: string
          currency: string
          status: Database["public"]["Enums"]["salon_status"]
          plan_code: string
          verification_policy: Database["public"]["Enums"]["verification_policy"]
          description: string | null
          phone: string | null
          email: string | null
          website: string | null
          instagram: string | null
          address_street: string | null
          address_city: string | null
          address_zip: string | null
          logo_path: string | null
          cover_path: string | null
          brand_color: string
          google_review_url: string | null
          created_by: string | null
          created_at: string
          updated_at: string
          archived_at: string | null
        }
        Insert: {
          id?: string
          name: string
          slug: string
          timezone?: string
          currency?: string
          status?: Database["public"]["Enums"]["salon_status"]
          plan_code?: string
          verification_policy?: Database["public"]["Enums"]["verification_policy"]
          description?: string | null
          phone?: string | null
          email?: string | null
          website?: string | null
          instagram?: string | null
          address_street?: string | null
          address_city?: string | null
          address_zip?: string | null
          logo_path?: string | null
          cover_path?: string | null
          brand_color?: string
          google_review_url?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
          archived_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          timezone?: string
          currency?: string
          status?: Database["public"]["Enums"]["salon_status"]
          plan_code?: string
          verification_policy?: Database["public"]["Enums"]["verification_policy"]
          description?: string | null
          phone?: string | null
          email?: string | null
          website?: string | null
          instagram?: string | null
          address_street?: string | null
          address_city?: string | null
          address_zip?: string | null
          logo_path?: string | null
          cover_path?: string | null
          brand_color?: string
          google_review_url?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
          archived_at?: string | null
        }
        Relationships: []
      }
      service_categories: {
        Row: {
          id: string
          salon_id: string
          name: string
          sort: number
          created_at: string
          archived_at: string | null
        }
        Insert: {
          id?: string
          salon_id: string
          name: string
          sort?: number
          created_at?: string
          archived_at?: string | null
        }
        Update: {
          id?: string
          salon_id?: string
          name?: string
          sort?: number
          created_at?: string
          archived_at?: string | null
        }
        Relationships: []
      }
      services: {
        Row: {
          id: string
          salon_id: string
          category_id: string | null
          name: string
          description: string | null
          duration_min: number
          buffer_after_min: number
          price: number
          price_is_from: boolean
          vat_rate: number
          online_bookable: boolean
          counts_for_loyalty: boolean
          color: string | null
          sort: number
          processing_gap_start_min: number | null
          processing_gap_min: number | null
          created_at: string
          updated_at: string
          archived_at: string | null
        }
        Insert: {
          id?: string
          salon_id: string
          category_id?: string | null
          name: string
          description?: string | null
          duration_min: number
          buffer_after_min?: number
          price?: number
          price_is_from?: boolean
          vat_rate?: number
          online_bookable?: boolean
          counts_for_loyalty?: boolean
          color?: string | null
          sort?: number
          processing_gap_start_min?: number | null
          processing_gap_min?: number | null
          created_at?: string
          updated_at?: string
          archived_at?: string | null
        }
        Update: {
          id?: string
          salon_id?: string
          category_id?: string | null
          name?: string
          description?: string | null
          duration_min?: number
          buffer_after_min?: number
          price?: number
          price_is_from?: boolean
          vat_rate?: number
          online_bookable?: boolean
          counts_for_loyalty?: boolean
          color?: string | null
          sort?: number
          processing_gap_start_min?: number | null
          processing_gap_min?: number | null
          created_at?: string
          updated_at?: string
          archived_at?: string | null
        }
        Relationships: []
      }
      sms_credits_ledger: {
        Row: {
          id: string
          salon_id: string
          delta: number
          reason: string
          ref: string | null
          created_at: string
        }
        Insert: {
          id?: string
          salon_id: string
          delta: number
          reason: string
          ref?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          salon_id?: string
          delta?: number
          reason?: string
          ref?: string | null
          created_at?: string
        }
        Relationships: []
      }
      staff: {
        Row: {
          id: string
          salon_id: string
          user_id: string | null
          display_name: string
          title: string | null
          bio: string | null
          photo_path: string | null
          color: string
          bookable: boolean
          sort: number
          created_at: string
          updated_at: string
          archived_at: string | null
        }
        Insert: {
          id?: string
          salon_id: string
          user_id?: string | null
          display_name: string
          title?: string | null
          bio?: string | null
          photo_path?: string | null
          color?: string
          bookable?: boolean
          sort?: number
          created_at?: string
          updated_at?: string
          archived_at?: string | null
        }
        Update: {
          id?: string
          salon_id?: string
          user_id?: string | null
          display_name?: string
          title?: string | null
          bio?: string | null
          photo_path?: string | null
          color?: string
          bookable?: boolean
          sort?: number
          created_at?: string
          updated_at?: string
          archived_at?: string | null
        }
        Relationships: []
      }
      staff_attendance: {
        Row: {
          id: string
          salon_id: string
          staff_id: string
          location_id: string | null
          clock_in: string
          clock_out: string | null
          note: string | null
        }
        Insert: {
          id?: string
          salon_id: string
          staff_id: string
          location_id?: string | null
          clock_in?: string
          clock_out?: string | null
          note?: string | null
        }
        Update: {
          id?: string
          salon_id?: string
          staff_id?: string
          location_id?: string | null
          clock_in?: string
          clock_out?: string | null
          note?: string | null
        }
        Relationships: []
      }
      staff_busy_slots: {
        Row: {
          id: string
          salon_id: string
          staff_id: string
          during: string
          kind: Database["public"]["Enums"]["busy_kind"]
          booking_item_id: string | null
          time_off_id: string | null
        }
        Insert: {
          id?: string
          salon_id: string
          staff_id: string
          during: string
          kind: Database["public"]["Enums"]["busy_kind"]
          booking_item_id?: string | null
          time_off_id?: string | null
        }
        Update: {
          id?: string
          salon_id?: string
          staff_id?: string
          during?: string
          kind?: Database["public"]["Enums"]["busy_kind"]
          booking_item_id?: string | null
          time_off_id?: string | null
        }
        Relationships: []
      }
      staff_commission_rules: {
        Row: {
          id: string
          salon_id: string
          staff_id: string | null
          scope: Database["public"]["Enums"]["commission_scope"]
          service_id: string | null
          category_id: string | null
          product_id: string | null
          type: Database["public"]["Enums"]["commission_type"]
          percent: number | null
          fixed_amount: number | null
          tiers: Json | null
          priority: number
          active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          salon_id: string
          staff_id?: string | null
          scope?: Database["public"]["Enums"]["commission_scope"]
          service_id?: string | null
          category_id?: string | null
          product_id?: string | null
          type?: Database["public"]["Enums"]["commission_type"]
          percent?: number | null
          fixed_amount?: number | null
          tiers?: Json | null
          priority?: number
          active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          salon_id?: string
          staff_id?: string | null
          scope?: Database["public"]["Enums"]["commission_scope"]
          service_id?: string | null
          category_id?: string | null
          product_id?: string | null
          type?: Database["public"]["Enums"]["commission_type"]
          percent?: number | null
          fixed_amount?: number | null
          tiers?: Json | null
          priority?: number
          active?: boolean
          created_at?: string
        }
        Relationships: []
      }
      staff_locations: {
        Row: {
          staff_id: string
          location_id: string
          salon_id: string
        }
        Insert: {
          staff_id: string
          location_id: string
          salon_id: string
        }
        Update: {
          staff_id?: string
          location_id?: string
          salon_id?: string
        }
        Relationships: []
      }
      staff_schedule_overrides: {
        Row: {
          id: string
          salon_id: string
          staff_id: string
          location_id: string
          day: string
          kind: Database["public"]["Enums"]["override_kind"]
          starts: string | null
          ends: string | null
          note: string | null
        }
        Insert: {
          id?: string
          salon_id: string
          staff_id: string
          location_id: string
          day: string
          kind: Database["public"]["Enums"]["override_kind"]
          starts?: string | null
          ends?: string | null
          note?: string | null
        }
        Update: {
          id?: string
          salon_id?: string
          staff_id?: string
          location_id?: string
          day?: string
          kind?: Database["public"]["Enums"]["override_kind"]
          starts?: string | null
          ends?: string | null
          note?: string | null
        }
        Relationships: []
      }
      staff_schedules: {
        Row: {
          id: string
          salon_id: string
          staff_id: string
          location_id: string
          weekday: number
          starts: string
          ends: string
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          id?: string
          salon_id: string
          staff_id: string
          location_id: string
          weekday: number
          starts: string
          ends: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          id?: string
          salon_id?: string
          staff_id?: string
          location_id?: string
          weekday?: number
          starts?: string
          ends?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: []
      }
      staff_services: {
        Row: {
          staff_id: string
          service_id: string
          salon_id: string
          price_override: number | null
          duration_override: number | null
        }
        Insert: {
          staff_id: string
          service_id: string
          salon_id: string
          price_override?: number | null
          duration_override?: number | null
        }
        Update: {
          staff_id?: string
          service_id?: string
          salon_id?: string
          price_override?: number | null
          duration_override?: number | null
        }
        Relationships: []
      }
      staff_time_off: {
        Row: {
          id: string
          salon_id: string
          staff_id: string
          during: string
          kind: Database["public"]["Enums"]["time_off_kind"]
          note: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          salon_id: string
          staff_id: string
          during: string
          kind: Database["public"]["Enums"]["time_off_kind"]
          note?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          salon_id?: string
          staff_id?: string
          during?: string
          kind?: Database["public"]["Enums"]["time_off_kind"]
          note?: string | null
          created_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      stock_movements: {
        Row: {
          id: string
          salon_id: string
          product_id: string
          kind: Database["public"]["Enums"]["stock_movement_kind"]
          quantity: number
          unit_cost: number | null
          booking_id: string | null
          supplier_id: string | null
          purchase_order_id: string | null
          note: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          salon_id: string
          product_id: string
          kind: Database["public"]["Enums"]["stock_movement_kind"]
          quantity: number
          unit_cost?: number | null
          booking_id?: string | null
          supplier_id?: string | null
          purchase_order_id?: string | null
          note?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          salon_id?: string
          product_id?: string
          kind?: Database["public"]["Enums"]["stock_movement_kind"]
          quantity?: number
          unit_cost?: number | null
          booking_id?: string | null
          supplier_id?: string | null
          purchase_order_id?: string | null
          note?: string | null
          created_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      stripe_accounts: {
        Row: {
          salon_id: string
          stripe_account_id: string
          charges_enabled: boolean
          payouts_enabled: boolean
          details_submitted: boolean
          updated_at: string
        }
        Insert: {
          salon_id: string
          stripe_account_id: string
          charges_enabled?: boolean
          payouts_enabled?: boolean
          details_submitted?: boolean
          updated_at?: string
        }
        Update: {
          salon_id?: string
          stripe_account_id?: string
          charges_enabled?: boolean
          payouts_enabled?: boolean
          details_submitted?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          salon_id: string
          plan_code: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          status: string
          current_period_end: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          salon_id: string
          plan_code: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          status?: string
          current_period_end?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          salon_id?: string
          plan_code?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          status?: string
          current_period_end?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          id: string
          salon_id: string
          name: string
          email: string | null
          phone: string | null
          note: string | null
          created_at: string
          archived_at: string | null
        }
        Insert: {
          id?: string
          salon_id: string
          name: string
          email?: string | null
          phone?: string | null
          note?: string | null
          created_at?: string
          archived_at?: string | null
        }
        Update: {
          id?: string
          salon_id?: string
          name?: string
          email?: string | null
          phone?: string | null
          note?: string | null
          created_at?: string
          archived_at?: string | null
        }
        Relationships: []
      }
      voucher_transactions: {
        Row: {
          id: string
          salon_id: string
          voucher_id: string
          kind: string
          amount: number
          booking_id: string | null
          payment_id: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          salon_id: string
          voucher_id: string
          kind: string
          amount: number
          booking_id?: string | null
          payment_id?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          salon_id?: string
          voucher_id?: string
          kind?: string
          amount?: number
          booking_id?: string | null
          payment_id?: string | null
          created_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      vouchers: {
        Row: {
          id: string
          salon_id: string
          code: string
          initial_amount: number
          balance: number
          service_id: string | null
          buyer_client_id: string | null
          recipient_name: string | null
          recipient_email: string | null
          message: string | null
          source: string
          status: string
          expires_at: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          salon_id: string
          code: string
          initial_amount: number
          balance: number
          service_id?: string | null
          buyer_client_id?: string | null
          recipient_name?: string | null
          recipient_email?: string | null
          message?: string | null
          source?: string
          status?: string
          expires_at?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          salon_id?: string
          code?: string
          initial_amount?: number
          balance?: number
          service_id?: string | null
          buyer_client_id?: string | null
          recipient_name?: string | null
          recipient_email?: string | null
          message?: string | null
          source?: string
          status?: string
          expires_at?: string | null
          created_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      waitlist_entries: {
        Row: {
          id: string
          salon_id: string
          location_id: string
          client_id: string
          service_ids: string[]
          staff_id: string | null
          date_from: string
          date_to: string
          time_from: string | null
          time_to: string | null
          status: string
          offered_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          salon_id: string
          location_id: string
          client_id: string
          service_ids: string[]
          staff_id?: string | null
          date_from: string
          date_to: string
          time_from?: string | null
          time_to?: string | null
          status?: string
          offered_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          salon_id?: string
          location_id?: string
          client_id?: string
          service_ids?: string[]
          staff_id?: string | null
          date_from?: string
          date_to?: string
          time_from?: string | null
          time_to?: string | null
          status?: string
          offered_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invite: {
        Args: { p_token: string }
        Returns: string
      }
      add_booking_adjustment: {
        Args: { p_booking: string; p_kind: Database["public"]["Enums"]["adjustment_kind"]; p_label: string; p_amount: number; p_ref?: string }
        Returns: string
      }
      add_booking_product: {
        Args: { p_booking: string; p_product: string; p_quantity: number; p_staff?: string }
        Returns: string
      }
      adjust_loyalty_stamps: {
        Args: { p_client: string; p_delta: number; p_reason: string }
        Returns: undefined
      }
      adjust_stock: {
        Args: { p_product: string; p_quantity: number; p_kind: Database["public"]["Enums"]["stock_movement_kind"]; p_note?: string }
        Returns: undefined
      }
      admin_create_booking: {
        Args: { p_location: string; p_client: string; p_items: Json; p_starts_at: string; p_source?: Database["public"]["Enums"]["booking_source"]; p_client_note?: string; p_internal_note?: string; p_status?: Database["public"]["Enums"]["booking_status"] }
        Returns: string
      }
      anonymize_client: {
        Args: { p_client: string }
        Returns: undefined
      }
      booking_balance: {
        Args: { p_booking: string }
        Returns: number
      }
      booking_has_staff_user: {
        Args: { p_booking: string }
        Returns: boolean
      }
      booking_is_customers: {
        Args: { p_booking: string }
        Returns: boolean
      }
      booking_transition_allowed: {
        Args: { p_old: Database["public"]["Enums"]["booking_status"]; p_new: Database["public"]["Enums"]["booking_status"] }
        Returns: boolean
      }
      cancel_voucher: {
        Args: { p_voucher: string }
        Returns: undefined
      }
      claim_notifications: {
        Args: { p_limit?: number }
        Returns: Array<Database["public"]["Tables"]["notifications"]["Row"]>
      }
      clock_in: {
        Args: { p_staff: string; p_location?: string }
        Returns: string
      }
      clock_out: {
        Args: { p_staff: string }
        Returns: undefined
      }
      close_cash_session: {
        Args: { p_session: string; p_counted: number; p_note?: string }
        Returns: number
      }
      complete_notification: {
        Args: { p_id: string; p_provider_id?: string }
        Returns: undefined
      }
      confirm_verification: {
        Args: { p_account: string; p_channel: Database["public"]["Enums"]["verification_channel"]; p_target: string; p_code_hash: string }
        Returns: boolean
      }
      convert_proforma: {
        Args: { p_proforma: string }
        Returns: string
      }
      count_segment: {
        Args: { p_salon: string; p_segment: Json }
        Returns: number
      }
      create_commission_payout: {
        Args: { p_staff: string; p_from: string; p_to: string }
        Returns: string
      }
      create_credit_note: {
        Args: { p_invoice: string; p_reason: string; p_items?: Json }
        Returns: string
      }
      create_invite: {
        Args: { p_salon: string; p_email: string; p_role: Database["public"]["Enums"]["salon_role"]; p_staff?: string }
        Returns: string
      }
      create_invoice: {
        Args: { p_salon: string; p_kind: Database["public"]["Enums"]["invoice_kind"]; p_customer: Json; p_items: Json; p_client?: string; p_booking?: string; p_note?: string }
        Returns: string
      }
      create_invoice_from_booking: {
        Args: { p_booking: string; p_customer?: Json }
        Returns: string
      }
      create_purchase_order: {
        Args: { p_salon: string; p_supplier: string; p_items: Json; p_note?: string }
        Returns: string
      }
      create_salon: {
        Args: { p_name: string; p_slug: string; p_location_name?: string; p_template?: string; p_phone?: string; p_street?: string; p_city?: string; p_zip?: string }
        Returns: Json
      }
      current_customer_account_id: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      current_salon_ids: {
        Args: Record<PropertyKey, never>
        Returns: Array<string>
      }
      customer_booking_items: {
        Args: { p_booking: string }
        Returns: Array<{ service_id: string; staff_id: string; name: string }>
      }
      customer_bookings: {
        Args: Record<PropertyKey, never>
        Returns: Array<{ id: string; salon_id: string; salon_name: string; salon_slug: string; brand_color: string; timezone: string; location_id: string; location_name: string; location_address: string; starts_at: string; ends_at: string; status: Database["public"]["Enums"]["booking_status"]; services: string; staff: string; price_total: number; discount_total: number; products_total: number; deposit_amount: number; can_change: boolean }>
      }
      customer_cancel_waitlist: {
        Args: { p_id: string }
        Returns: undefined
      }
      customer_create_booking: {
        Args: { p_location: string; p_items: Json; p_starts_at: string; p_client_note?: string }
        Returns: string
      }
      customer_join_waitlist: {
        Args: { p_location: string; p_service_ids: string[]; p_staff: string; p_from: string; p_to: string; p_time_from?: string; p_time_to?: string }
        Returns: string
      }
      customer_loyalty_cards: {
        Args: Record<PropertyKey, never>
        Returns: Array<{ salon_id: string; salon_name: string; salon_slug: string; client_id: string; program_id: string; threshold: number; stamps: number; reward_type: Database["public"]["Enums"]["reward_type"]; reward_value: number; reward_service_name: string; available_rewards: number }>
      }
      customer_reschedule_booking: {
        Args: { p_booking: string; p_new_start: string }
        Returns: undefined
      }
      customer_salons: {
        Args: Record<PropertyKey, never>
        Returns: Array<{ salon_id: string; name: string; slug: string; city: string; brand_color: string; visits: number; last_visit_at: string; client_id: string }>
      }
      customer_waitlist: {
        Args: Record<PropertyKey, never>
        Returns: Array<{ id: string; salon_name: string; salon_slug: string; location_id: string; services: string; date_from: string; date_to: string; time_from: string; time_to: string; status: string; created_at: string }>
      }
      enqueue_birthdays: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      enqueue_return_reminders: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      expire_loyalty_rewards: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      expire_pending_bookings: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      expire_vouchers: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      export_invoices: {
        Args: { p_salon: string; p_from: string; p_to: string }
        Returns: Array<{ number: string; kind: Database["public"]["Enums"]["invoice_kind"]; status: Database["public"]["Enums"]["invoice_status"]; issue_date: string; taxable_supply_date: string; due_date: string; customer_name: string; customer_ico: string; customer_dic: string; total_net: number; total_vat: number; total_gross: number; paid_amount: number; vat_summary: Json; variable_symbol: string }>
      }
      fail_notification: {
        Args: { p_id: string; p_error: string; p_permanent?: boolean }
        Returns: undefined
      }
      get_availability: {
        Args: { p_location: string; p_service_ids: string[]; p_from: string; p_to: string; p_staff?: string }
        Returns: Array<{ staff_id: string; slot_start: string; slot_end: string }>
      }
      grant_consent: {
        Args: { p_client: string; p_type: Database["public"]["Enums"]["consent_type"]; p_source?: string }
        Returns: undefined
      }
      grant_sms_credits: {
        Args: { p_salon: string; p_amount: number; p_reason: string }
        Returns: undefined
      }
      has_consent: {
        Args: { p_client: string; p_type: Database["public"]["Enums"]["consent_type"] }
        Returns: boolean
      }
      has_salon_role: {
        Args: { p_salon: string; p_roles: Database["public"]["Enums"]["salon_role"][] }
        Returns: boolean
      }
      invoice_balance: {
        Args: { p_invoice: string }
        Returns: number
      }
      invoice_spayd: {
        Args: { p_invoice: string }
        Returns: string
      }
      issue_invoice: {
        Args: { p_invoice: string; p_issue_date?: string; p_duzp?: string }
        Returns: string
      }
      issue_paid_voucher: {
        Args: { p_salon: string; p_amount: number; p_payment_intent: string; p_service?: string; p_recipient_name?: string; p_recipient_email?: string; p_message?: string; p_buyer?: string }
        Returns: string
      }
      issue_verification: {
        Args: { p_account: string; p_channel: Database["public"]["Enums"]["verification_channel"]; p_target: string; p_code_hash: string; p_ip_hash?: string }
        Returns: string
      }
      issue_voucher: {
        Args: { p_salon: string; p_amount: number; p_service?: string; p_recipient_name?: string; p_recipient_email?: string; p_message?: string; p_expires?: string }
        Returns: string
      }
      launch_campaign: {
        Args: { p_campaign: string }
        Returns: number
      }
      lookup_voucher: {
        Args: { p_salon: string; p_code: string }
        Returns: Array<{ id: string; code: string; balance: number; status: string; expires_at: string; service_id: string }>
      }
      low_stock_products: {
        Args: { p_salon: string }
        Returns: Array<{ id: string; name: string; stock: number; min_stock: number; supplier_id: string }>
      }
      loyalty_stamp_count: {
        Args: { p_client: string; p_program: string }
        Returns: number
      }
      mark_notifications_read: {
        Args: { p_ids?: string[] }
        Returns: undefined
      }
      mark_payout_paid: {
        Args: { p_payout: string }
        Returns: undefined
      }
      match_bank_payment: {
        Args: { p_salon: string; p_variable_symbol: string; p_amount: number; p_date: string; p_ref: string }
        Returns: string
      }
      merge_clients: {
        Args: { p_keep: string; p_merge: string }
        Returns: undefined
      }
      move_booking: {
        Args: { p_booking: string; p_new_start: string; p_new_staff?: string }
        Returns: undefined
      }
      open_cash_session: {
        Args: { p_location: string; p_float?: number }
        Returns: string
      }
      overdue_invoices: {
        Args: { p_salon: string }
        Returns: Array<{ id: string; number: string; customer_name: string; due_date: string; balance: number; days_overdue: number }>
      }
      owner_snapshot: {
        Args: { p_salon: string; p_from: string; p_to: string; p_location?: string }
        Returns: Json
      }
      plan_has_feature: {
        Args: { p_salon: string; p_feature: string }
        Returns: boolean
      }
      plan_limit: {
        Args: { p_salon: string; p_key: string }
        Returns: number
      }
      public_salon: {
        Args: { p_slug: string }
        Returns: Json
      }
      receive_purchase_order: {
        Args: { p_order: string; p_create_expense?: boolean }
        Returns: undefined
      }
      recompute_invoice_draft: {
        Args: { p_invoice: string }
        Returns: undefined
      }
      record_invoice_payment: {
        Args: { p_invoice: string; p_amount: number; p_method: Database["public"]["Enums"]["payment_method"]; p_paid_on?: string; p_bank_ref?: string }
        Returns: string
      }
      record_payment: {
        Args: { p_booking: string; p_amount: number; p_method: Database["public"]["Enums"]["payment_method"]; p_tip?: number; p_note?: string }
        Returns: string
      }
      record_stripe_payment: {
        Args: { p_salon: string; p_booking: string; p_amount: number; p_payment_intent: string; p_kind?: Database["public"]["Enums"]["payment_kind"]; p_charge?: string }
        Returns: string
      }
      redeem_reward: {
        Args: { p_reward: string; p_booking: string }
        Returns: number
      }
      redeem_voucher: {
        Args: { p_salon: string; p_code: string; p_amount: number; p_booking?: string }
        Returns: string
      }
      refresh_client_stats: {
        Args: { p_client: string }
        Returns: undefined
      }
      refund_payment: {
        Args: { p_payment: string; p_amount: number; p_reason: string }
        Returns: string
      }
      remove_booking_product: {
        Args: { p_line: string }
        Returns: undefined
      }
      salon_sms_balance: {
        Args: { p_salon: string }
        Returns: number
      }
      salon_sms_enabled: {
        Args: { p_salon: string }
        Returns: boolean
      }
      segment_clients: {
        Args: { p_salon: string; p_segment: Json }
        Returns: Array<string>
      }
      set_booking_status: {
        Args: { p_booking: string; p_status: Database["public"]["Enums"]["booking_status"]; p_reason?: string }
        Returns: undefined
      }
      skip_notification: {
        Args: { p_id: string; p_reason: string }
        Returns: undefined
      }
      slug_available: {
        Args: { p_slug: string }
        Returns: boolean
      }
      staff_has_client: {
        Args: { p_client: string }
        Returns: boolean
      }
      unsubscribe_client: {
        Args: { p_client: string; p_type?: Database["public"]["Enums"]["consent_type"] }
        Returns: undefined
      }
      unsubscribe_client_marketing: {
        Args: { p_client: string }
        Returns: undefined
      }
      upcoming_bookings: {
        Args: { p_salon: string; p_limit?: number }
        Returns: Array<{ id: string; starts_at: string; client_name: string; services: string; staff: string; status: Database["public"]["Enums"]["booking_status"] }>
      }
      update_booking_notes: {
        Args: { p_booking: string; p_internal_note: string; p_client_note?: string }
        Returns: undefined
      }
      write_audit: {
        Args: { p_salon: string; p_action: string; p_entity: string; p_entity_id: string; p_before: Json; p_after: Json }
        Returns: undefined
      }
    }
    Enums: {
      adjustment_kind: "loyalty_reward" | "promo" | "voucher" | "manual"
      automation_type: "booking_confirmation" | "booking_received" | "booking_reminder" | "booking_cancellation" | "booking_rescheduled" | "return_reminder" | "followup" | "review_request" | "birthday" | "waitlist_offer"
      booking_source: "online" | "admin" | "walk_in" | "phone"
      booking_status: "pending" | "confirmed" | "completed" | "cancelled_by_client" | "cancelled_by_salon" | "no_show"
      busy_kind: "booking" | "time_off"
      commission_scope: "all" | "category" | "service" | "product"
      commission_type: "percent" | "fixed" | "none"
      confirmation_mode: "auto" | "manual"
      consent_type: "marketing_email" | "marketing_sms" | "marketing_push" | "terms"
      invoice_kind: "invoice" | "proforma" | "credit_note"
      invoice_status: "draft" | "issued" | "partially_paid" | "paid" | "cancelled"
      loyalty_event_type: "stamp_earned" | "reward_earned" | "reward_redeemed" | "stamp_expired" | "manual_adjustment"
      notification_channel: "email" | "push" | "sms" | "in_app"
      notification_status: "queued" | "sending" | "sent" | "failed" | "cancelled" | "skipped"
      override_kind: "extra" | "off"
      payment_kind: "payment" | "deposit" | "tip" | "refund"
      payment_method: "card" | "cash" | "qr" | "bank_transfer" | "online" | "voucher" | "other"
      payment_status: "pending" | "succeeded" | "failed"
      reward_status: "available" | "redeemed" | "expired" | "revoked"
      reward_type: "free_service" | "percent_discount" | "fixed_discount"
      salon_role: "owner" | "manager" | "reception" | "staff"
      salon_status: "trial" | "active" | "suspended"
      stock_movement_kind: "purchase" | "sale" | "adjustment" | "return" | "waste"
      time_off_kind: "vacation" | "sick" | "block"
      verification_channel: "email" | "sms"
      verification_policy: "email" | "email_phone"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"];
export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T];
