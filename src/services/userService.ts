import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { AuthUser } from '../types/auth';
import { mockUser } from '../data/mockAccount';

const isDev = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV;

export const userService = {
  async getProfile(userId: string, emailFallback?: string): Promise<Partial<AuthUser>> {
    if (!isSupabaseConfigured()) {
      return isDev ? mockUser : {
        id: userId,
        name: emailFallback?.split('@')[0] || 'Usuário',
        firstName: emailFallback?.split('@')[0] || 'Usuário',
        lastName: '',
        initials: (emailFallback || 'US').substring(0, 2).toUpperCase(),
      };
    }

    try {
      const { data, error } = await (supabase.from('profiles') as any)
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error || !data) {
        const defaultName = emailFallback?.split('@')[0] || 'Usuário';
        return {
          id: userId,
          name: defaultName,
          firstName: defaultName,
          lastName: '',
          initials: (emailFallback || 'US').substring(0, 2).toUpperCase(),
        };
      }

      const fullName = data.full_name || emailFallback?.split('@')[0] || 'Usuário';
      const initials = fullName
        .split(' ')
        .map((n: string) => n[0])
        .join('')
        .substring(0, 2)
        .toUpperCase();

      return {
        id: data.id,
        name: fullName,
        firstName: fullName.split(' ')[0] || 'Usuário',
        lastName: fullName.split(' ').slice(1).join(' ') || '',
        avatarUrl: data.avatar_url || undefined,
        initials: initials || 'US',
      };
    } catch {
      const defaultName = emailFallback?.split('@')[0] || 'Usuário';
      return {
        id: userId,
        name: defaultName,
        firstName: defaultName,
        lastName: '',
        initials: (emailFallback || 'US').substring(0, 2).toUpperCase(),
      };
    }
  },

  async updateProfile(userId: string, fullName: string): Promise<{ success: boolean; error?: string }> {
    if (!isSupabaseConfigured()) {
      return { success: true };
    }

    try {
      const { error } = await (supabase.from('profiles') as any)
        .upsert({
          id: userId,
          full_name: fullName,
          updated_at: new Date().toISOString(),
        });

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
