/**
 * ==============================================================================
 * PREXYON — MEMBER MANAGEMENT SERVICE (ETAPA 6)
 * Comunicação real com as RPCs transacionais de gestão de membros e permissões
 * ==============================================================================
 */

import { supabase } from '../lib/supabase';
import { ProductId } from '../types/product';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export type OrganizationRole = 'owner' | 'admin' | 'member';

export interface MemberDetail {
  id: string;
  userId: string;
  email: string;
  fullName: string;
  role: OrganizationRole;
  isActive: boolean;
  isLocked: boolean;
  createdAt: string;
  products: ProductId[];
  permissions: Record<string, Record<string, boolean>>;
}

export interface InviteUserPayload {
  organizationId: string;
  email: string;
  role: 'admin' | 'member';
  productAccess: ProductId[];
  permissions?: Record<string, string[]>;
}

export const memberManagementService = {
  /**
   * Listar todos os membros com perfil, produtos autorizados e permissões
   */
  async getMembers(organizationId: string): Promise<{ success: boolean; data: MemberDetail[]; error?: string }> {
    try {
      const { data, error } = await db.rpc('prexyon_get_organization_members_full', {
        p_organization_id: organizationId,
      });

      if (error) {
        console.error('Erro ao listar membros da organização:', error);
        return { success: false, data: [], error: error.message };
      }

      return { success: true, data: (data as MemberDetail[]) || [] };
    } catch (err: any) {
      return { success: false, data: [], error: err.message || 'Erro inesperado ao listar membros' };
    }
  },

  /**
   * Convidar novo usuário
   */
  async inviteUser(payload: InviteUserPayload): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const { data, error } = await db.rpc('prexyon_invite_user', {
        p_organization_id: payload.organizationId,
        p_email: payload.email,
        p_role: payload.role,
        p_product_access: payload.productAccess,
        p_permissions: payload.permissions || {},
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Erro inesperado ao convidar usuário' };
    }
  },

  /**
   * Atualizar papel organizacional do membro
   */
  async updateRole(
    organizationId: string,
    targetUserId: string,
    newRole: OrganizationRole
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await db.rpc('prexyon_update_member_role', {
        p_organization_id: organizationId,
        p_target_user_id: targetUserId,
        p_new_role: newRole,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Erro ao alterar papel do membro' };
    }
  },

  /**
   * Ativar ou desativar membro
   */
  async updateStatus(
    organizationId: string,
    targetUserId: string,
    isActive: boolean
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await db.rpc('prexyon_update_member_status', {
        p_organization_id: organizationId,
        p_target_user_id: targetUserId,
        p_is_active: isActive,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Erro ao alterar status do membro' };
    }
  },

  /**
   * Atualizar acessos a produtos e matriz de permissões granulares
   */
  async updateAccessAndPermissions(
    organizationId: string,
    targetUserId: string,
    products: ProductId[],
    permissions: Record<string, Record<string, boolean>>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await db.rpc('prexyon_update_member_access_and_permissions', {
        p_organization_id: organizationId,
        p_target_user_id: targetUserId,
        p_products: products,
        p_permissions: permissions,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Erro ao salvar permissões do membro' };
    }
  },
};
