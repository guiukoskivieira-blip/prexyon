import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { ProductId } from '../types/product';

export interface CreateInviteParams {
  organizationId: string;
  email: string;
  invitedByUserId: string;
  assignedProducts: ProductId[];
  role?: 'admin' | 'member' | 'guest';
}

export interface InviteRecord {
  id: string;
  organizationId: string;
  email: string;
  assignedProducts: ProductId[];
  role: 'admin' | 'member' | 'guest';
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  expiresAt: string;
  createdAt: string;
}

export const invitesService = {
  async createInvite(params: CreateInviteParams): Promise<{ success: boolean; invite?: InviteRecord; error?: string }> {
    if (!params.email || !params.email.includes('@')) {
      return { success: false, error: 'E-mail inválido para convite.' };
    }

    const tokenHash = `inv_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

    if (!isSupabaseConfigured()) {
      const mockInvite: InviteRecord = {
        id: `inv_${Date.now()}`,
        organizationId: params.organizationId,
        email: params.email,
        assignedProducts: params.assignedProducts,
        role: params.role || 'member',
        status: 'pending',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString(),
      };
      return { success: true, invite: mockInvite };
    }

    try {
      const { data, error } = await (supabase.from('prexyon_organization_invites') as any)
        .insert({
          organization_id: params.organizationId,
          email: params.email,
          invited_by: params.invitedByUserId,
          assigned_products: params.assignedProducts,
          membership_role: params.role || 'member',
          token_hash: tokenHash,
          status: 'pending',
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .select()
        .single();

      if (error) return { success: false, error: error.message };

      return {
        success: true,
        invite: {
          id: data.id,
          organizationId: data.organization_id,
          email: data.email,
          assignedProducts: data.assigned_products || [],
          role: data.membership_role,
          status: data.status,
          expiresAt: data.expires_at,
          createdAt: data.created_at,
        }
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async listPendingInvites(orgId: string): Promise<InviteRecord[]> {
    if (!isSupabaseConfigured()) {
      return [];
    }

    try {
      const { data, error } = await (supabase.from('prexyon_organization_invites') as any)
        .select('*')
        .eq('organization_id', orgId)
        .eq('status', 'pending');

      if (error || !data) return [];

      return (data as any[]).map((d) => ({
        id: d.id,
        organizationId: d.organization_id,
        email: d.email,
        assignedProducts: d.assigned_products || [],
        role: d.membership_role,
        status: d.status,
        expiresAt: d.expires_at,
        createdAt: d.created_at,
      }));
    } catch {
      return [];
    }
  }
};
