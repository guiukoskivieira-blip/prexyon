export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name: string;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      organizations: {
        Row: {
          id: string;
          trade_name: string;
          corporate_name: string | null;
          slug: string | null;
          owner_user_id: string | null;
          document: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          trade_name: string;
          corporate_name?: string | null;
          slug?: string | null;
          owner_user_id?: string | null;
          document?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          trade_name?: string;
          corporate_name?: string | null;
          slug?: string | null;
          owner_user_id?: string | null;
          document?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
      };
      organization_members: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          role: 'owner' | 'admin' | 'manager' | 'seller' | 'reception' | 'viewer';
          base_profile: string;
          permissions_json: Json;
          is_active: boolean;
          is_locked: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id: string;
          role?: 'owner' | 'admin' | 'manager' | 'seller' | 'reception' | 'viewer';
          base_profile?: string;
          permissions_json?: Json;
          is_active?: boolean;
          is_locked?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          user_id?: string;
          role?: 'owner' | 'admin' | 'manager' | 'seller' | 'reception' | 'viewer';
          base_profile?: string;
          permissions_json?: Json;
          is_active?: boolean;
          is_locked?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      product_subscriptions: {
        Row: {
          id: string;
          organization_id: string;
          product_code: 'orcagraf' | 'arteflow' | 'artecheck';
          status: 'pending_configuration' | 'trial' | 'active' | 'past_due' | 'canceled' | 'unsubscribed';
          current_period_end: string | null;
          metadata_json: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          product_code: 'orcagraf' | 'arteflow' | 'artecheck';
          status?: 'pending_configuration' | 'trial' | 'active' | 'past_due' | 'canceled' | 'unsubscribed';
          current_period_end?: string | null;
          metadata_json?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          product_code?: 'orcagraf' | 'arteflow' | 'artecheck';
          status?: 'pending_configuration' | 'trial' | 'active' | 'past_due' | 'canceled' | 'unsubscribed';
          current_period_end?: string | null;
          metadata_json?: Json;
          created_at?: string;
          updated_at?: string;
        };
      };
      prexyon_products: {
        Row: {
          id: string;
          code: 'orcagraf' | 'arteflow' | 'artecheck';
          name: string;
          description: string | null;
          status: 'active' | 'coming_soon' | 'maintenance' | 'deprecated';
          created_at: string;
        };
        Insert: {
          id?: string;
          code: 'orcagraf' | 'arteflow' | 'artecheck';
          name: string;
          description?: string | null;
          status?: 'active' | 'coming_soon' | 'maintenance' | 'deprecated';
          created_at?: string;
        };
        Update: {
          id?: string;
          code?: 'orcagraf' | 'arteflow' | 'artecheck';
          name?: string;
          description?: string | null;
          status?: 'active' | 'coming_soon' | 'maintenance' | 'deprecated';
          created_at?: string;
        };
      };
      prexyon_user_product_access: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          product_code: 'orcagraf' | 'arteflow' | 'artecheck';
          enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id: string;
          product_code: 'orcagraf' | 'arteflow' | 'artecheck';
          enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          user_id?: string;
          product_code?: 'orcagraf' | 'arteflow' | 'artecheck';
          enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      prexyon_permission_definitions: {
        Row: {
          id: string;
          product_code: string;
          module_key: string;
          permission_key: string;
          label: string;
          description: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          product_code: string;
          module_key: string;
          permission_key: string;
          label: string;
          description?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          product_code?: string;
          module_key?: string;
          permission_key?: string;
          label?: string;
          description?: string | null;
          created_at?: string;
        };
      };
      prexyon_roles: {
        Row: {
          id: string;
          organization_id: string | null;
          product_code: string;
          name: string;
          description: string | null;
          is_system: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id?: string | null;
          product_code: string;
          name: string;
          description?: string | null;
          is_system?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string | null;
          product_code?: string;
          name?: string;
          description?: string | null;
          is_system?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      prexyon_role_permissions: {
        Row: {
          id: string;
          role_id: string;
          permission_definition_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          role_id: string;
          permission_definition_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          role_id?: string;
          permission_definition_id?: string;
          created_at?: string;
        };
      };
      prexyon_user_product_roles: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          product_code: string;
          role_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id: string;
          product_code: string;
          role_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          user_id?: string;
          product_code?: string;
          role_id?: string;
          created_at?: string;
        };
      };
      prexyon_user_permission_overrides: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          permission_definition_id: string;
          effect: 'allow' | 'deny';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id: string;
          permission_definition_id: string;
          effect: 'allow' | 'deny';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          user_id?: string;
          permission_definition_id?: string;
          effect?: 'allow' | 'deny';
          created_at?: string;
          updated_at?: string;
        };
      };
      prexyon_organization_invites: {
        Row: {
          id: string;
          organization_id: string;
          email: string;
          invited_by: string;
          assigned_products: Json;
          membership_role: 'admin' | 'member' | 'guest';
          token_hash: string;
          status: 'pending' | 'accepted' | 'expired' | 'revoked';
          expires_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          email: string;
          invited_by: string;
          assigned_products?: Json;
          membership_role?: 'admin' | 'member' | 'guest';
          token_hash: string;
          status?: 'pending' | 'accepted' | 'expired' | 'revoked';
          expires_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          email?: string;
          invited_by?: string;
          assigned_products?: Json;
          membership_role?: 'admin' | 'member' | 'guest';
          token_hash?: string;
          status?: 'pending' | 'accepted' | 'expired' | 'revoked';
          expires_at?: string;
          created_at?: string;
        };
      };
    };
  };
}
