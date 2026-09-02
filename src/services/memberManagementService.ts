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
   * Convidar novo usuário com disparo transacional de e-mail via Edge Function
   */
  async inviteUser(payload: InviteUserPayload): Promise<{
    success: boolean;
    invitationCreated?: boolean;
    emailSent?: boolean;
    emailError?: string | null;
    rawToken?: string;
    inviteUrl?: string;
    data?: any;
    error?: string;
  }> {
    try {
      // 1. Tenta invocar a Edge Function com envio transacional de e-mail
      const { data: funcData, error: funcError } = await db.functions.invoke('prexyon-send-invitation', {
        body: {
          organization_id: payload.organizationId,
          email: payload.email,
          role: payload.role,
          product_access: payload.productAccess,
          permissions: payload.permissions || {},
        },
      });

      if (funcError) {
        return {
          success: false,
          error: funcData?.error || funcError.message || 'Serviço de envio de convites indisponível. Nenhum convite foi criado.',
        };
      }

      if (!funcData || !funcData.success) {
        return {
          success: false,
          error: funcData?.error || 'Erro ao processar convite.',
        };
      }

      return {
        success: true,
        invitationCreated: funcData.invitation_created ?? true,
        emailSent: funcData.email_sent ?? false,
        emailError: funcData.email_error ?? null,
        rawToken: funcData.raw_token,
        inviteUrl: funcData.invite_url,
        data: funcData,
      };
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

  /**
   * Consultar dados essenciais do convite para validação e preview de aceite
   */
  async getInvitationPreview(token: string): Promise<{
    success: boolean;
    data?: {
      id: string;
      organization_id: string;
      organization_name: string;
      email: string;
      role: OrganizationRole;
      product_access: ProductId[];
      permissions: Record<string, string[]>;
      expires_at: string;
    };
    error?: string;
    invitation_email?: string;
    caller_email?: string;
  }> {
    try {
      const { data, error } = await db.rpc('prexyon_get_invitation_preview', {
        p_token: token,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      if (!data || !data.success) {
        return {
          success: false,
          error: data?.error || 'Convite inválido ou expirado.',
          invitation_email: data?.invitation_email,
          caller_email: data?.caller_email,
        };
      }

      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Erro inesperado ao consultar convite' };
    }
  },

  /**
   * Aceitar convite atomicamente via RPC autoritativa
   */
  async acceptInvitation(token: string): Promise<{
    success: boolean;
    data?: any;
    error?: string;
  }> {
    try {
      const { data, error } = await db.rpc('prexyon_accept_invitation', {
        p_token_hash: token,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      if (!data || !data.success) {
        return { success: false, error: data?.error || 'Erro ao aceitar convite.' };
      }

      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: err.message || 'Erro ao processar aceite do convite' };
    }
  },
};

