import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Organization, AccountMember } from '../types/account';
import { mockOrganization, mockMembers } from '../data/mockAccount';

const isDev = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV;

export const organizationService = {
  /**
   * Busca a organização real associada ao usuário autenticado
   */
  async getUserOrganization(userId: string): Promise<Organization | null> {
    if (!isSupabaseConfigured()) {
      return isDev ? mockOrganization : null;
    }

    try {
      // 1. Busca vínculo na tabela organization_members
      const { data: memberData, error: memberError } = await (supabase.from('organization_members') as any)
        .select(`
          organization_id,
          role,
          organizations:organization_id (
            id,
            trade_name,
            corporate_name,
            document,
            is_active,
            created_at,
            updated_at
          )
        `)
        .eq('user_id', userId)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (memberError || !memberData || !memberData.organizations) {
        // Se o usuário não tem vínculo direto em organization_members, tenta a primeira org disponível
        const { data: orgData, error: orgError } = await (supabase.from('organizations') as any)
          .select('*')
          .limit(1)
          .maybeSingle();

        if (orgError || !orgData) {
          return isDev ? mockOrganization : null;
        }

        return {
          id: orgData.id,
          name: orgData.trade_name || orgData.corporate_name || 'Organização',
          tradeName: orgData.trade_name || 'Organização',
          slug: orgData.slug || undefined,
          document: orgData.document || undefined,
          status: orgData.is_active ? 'active' : 'suspended',
          createdAt: orgData.created_at,
          updatedAt: orgData.updated_at,
        };
      }

      const org = memberData.organizations;
      return {
        id: org.id,
        name: org.trade_name || org.corporate_name || 'Organização',
        tradeName: org.trade_name || 'Organização',
        slug: org.slug || undefined,
        document: org.document || undefined,
        status: org.is_active ? 'active' : 'suspended',
        createdAt: org.created_at,
        updatedAt: org.updated_at,
      };
    } catch {
      return isDev ? mockOrganization : null;
    }
  },

  async getOrganization(orgId?: string): Promise<Organization> {
    if (!isSupabaseConfigured()) {
      return mockOrganization;
    }

    try {
      const query = orgId
        ? (supabase.from('organizations') as any).select('*').eq('id', orgId).single()
        : (supabase.from('organizations') as any).select('*').limit(1).single();

      const { data, error } = await query;
      if (error || !data) {
        return isDev ? mockOrganization : {
          id: '',
          name: 'Organização não encontrada',
          tradeName: 'Organização não encontrada',
          status: 'suspended',
          createdAt: '',
          updatedAt: '',
        };
      }

      return {
        id: data.id,
        name: data.trade_name || data.corporate_name || 'Organização',
        tradeName: data.trade_name || 'Organização',
        slug: data.slug || undefined,
        document: data.document || undefined,
        status: data.is_active ? 'active' : 'suspended',
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    } catch {
      return isDev ? mockOrganization : {
        id: '',
        name: 'Organização não encontrada',
        tradeName: 'Organização não encontrada',
        status: 'suspended',
        createdAt: '',
        updatedAt: '',
      };
    }
  },

  async updateOrganization(orgId: string, updates: Partial<Organization>): Promise<{ success: boolean; error?: string }> {
    if (!isSupabaseConfigured()) {
      return { success: true };
    }

    try {
      const { error } = await (supabase.from('organizations') as any)
        .update({
          trade_name: updates.name,
          updated_at: new Date().toISOString(),
        })
        .eq('id', orgId);

      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async getMembers(orgId: string): Promise<AccountMember[]> {
    if (!isSupabaseConfigured()) {
      return isDev ? mockMembers : [];
    }

    try {
      const { data, error } = await (supabase.from('organization_members') as any)
        .select(`
          id,
          user_id,
          role,
          is_active,
          is_locked,
          created_at,
          profiles:user_id (
            email,
            full_name,
            avatar_url
          )
        `)
        .eq('organization_id', orgId);

      if (error || !data || data.length === 0) {
        return [];
      }

      return (data as any[]).map((m) => {
        const fullName = m.profiles?.full_name || 'Usuário';
        const initials = fullName
          .split(' ')
          .map((n: string) => n[0])
          .join('')
          .substring(0, 2)
          .toUpperCase();

        const status = m.is_locked ? 'suspended' : m.is_active ? 'active' : 'suspended';
        const role = m.role === 'owner' ? 'owner' : m.role === 'admin' ? 'admin' : 'member';

        return {
          id: m.id,
          userId: m.user_id,
          name: fullName,
          email: m.profiles?.email || 'usuario@prexyon.com',
          initials,
          role,
          status,
          assignedProducts: ['orcagraf'],
          createdAt: m.created_at,
        };
      });
    } catch {
      return [];
    }
  },

  async updateMemberStatus(
    orgId: string,
    memberId: string,
    status: 'active' | 'suspended',
    currentMembers: AccountMember[]
  ): Promise<{ success: boolean; error?: string }> {
    // Regra de segurança: Não permitir suspender o único owner
    const targetMember = currentMembers.find((m) => m.id === memberId);
    if (targetMember?.role === 'owner' && status === 'suspended') {
      const activeOwners = currentMembers.filter((m) => m.role === 'owner' && m.status === 'active');
      if (activeOwners.length <= 1) {
        return {
          success: false,
          error: 'Operação negada: Não é permitido suspender o único Proprietário (Owner) da conta.'
        };
      }
    }

    if (!isSupabaseConfigured()) {
      return { success: true };
    }

    try {
      const { error } = await (supabase.from('organization_members') as any)
        .update({
          is_active: status === 'active',
          is_locked: status === 'suspended',
          updated_at: new Date().toISOString(),
        })
        .eq('id', memberId)
        .eq('organization_id', orgId);

      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
};
