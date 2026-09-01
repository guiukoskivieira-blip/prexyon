import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { AuthUser } from '../types/auth';
import { mockUser } from '../data/mockAccount';

export const userService = {
  async getProfile(userId: string): Promise<Partial<AuthUser>> {
    if (!isSupabaseConfigured()) {
      return mockUser;
    }

    try {
      const { data, error } = await (supabase.from('profiles') as any)
        .select('*')
        .eq('id', userId)
        .single();

      if (error || !data) return mockUser;

      const initials = data.full_name
        ? data.full_name
            .split(' ')
            .map((n: string) => n[0])
            .join('')
            .substring(0, 2)
            .toUpperCase()
        : 'US';

      return {
        id: data.id,
        name: data.full_name || 'Usuário',
        firstName: data.full_name ? data.full_name.split(' ')[0] : 'Usuário',
        lastName: data.full_name ? data.full_name.split(' ').slice(1).join(' ') : '',
        avatarUrl: data.avatar_url || undefined,
        initials,
      };
    } catch {
      return mockUser;
    }
  },

  async updateProfile(userId: string, fullName: string): Promise<{ success: boolean; error?: string }> {
    if (!isSupabaseConfigured()) {
      return { success: true };
    }

    try {
      const { error } = await (supabase.from('profiles') as any)
        .update({
          full_name: fullName,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async setUserProductAccess(
    orgId: string,
    userId: string,
    productCode: 'orcagraf' | 'arteflow' | 'artecheck',
    enabled: boolean
  ): Promise<{ success: boolean; error?: string }> {
    if (!isSupabaseConfigured()) {
      return { success: true };
    }

    try {
      const { error } = await (supabase.from('prexyon_user_product_access') as any)
        .upsert(
          {
            organization_id: orgId,
            user_id: userId,
            product_code: productCode,
            enabled,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'organization_id,user_id,product_code' }
        );

      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async setUserPermissionOverride(
    orgId: string,
    userId: string,
    permissionDefinitionId: string,
    effect: 'allow' | 'deny'
  ): Promise<{ success: boolean; error?: string }> {
    if (!isSupabaseConfigured()) {
      return { success: true };
    }

    try {
      const { error } = await (supabase.from('prexyon_user_permission_overrides') as any)
        .upsert(
          {
            organization_id: orgId,
            user_id: userId,
            permission_definition_id: permissionDefinitionId,
            effect,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'organization_id,user_id,permission_definition_id' }
        );

      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
};
