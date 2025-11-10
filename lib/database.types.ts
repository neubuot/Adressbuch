export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      contacts: {
        Row: {
          id: string
          created_at: string
          updated_at: string
          first_name: string
          last_name: string
          email: string | null
          phone: string | null
          mobile: string | null
          street: string | null
          city: string | null
          postal_code: string | null
          country: string | null
          company: string | null
          position: string | null
          notes: string | null
          user_id: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          updated_at?: string
          first_name: string
          last_name: string
          email?: string | null
          phone?: string | null
          mobile?: string | null
          street?: string | null
          city?: string | null
          postal_code?: string | null
          country?: string | null
          company?: string | null
          position?: string | null
          notes?: string | null
          user_id?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string
          first_name?: string
          last_name?: string
          email?: string | null
          phone?: string | null
          mobile?: string | null
          street?: string | null
          city?: string | null
          postal_code?: string | null
          country?: string | null
          company?: string | null
          position?: string | null
          notes?: string | null
          user_id?: string | null
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      search_contacts: {
        Args: {
          search_query: string
          user_uuid: string
        }
        Returns: {
          id: string
          first_name: string
          last_name: string
          email: string
          phone: string
          mobile: string
          company: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
}
