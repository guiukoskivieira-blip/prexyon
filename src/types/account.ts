export type AccountType = 'organization' | 'company' | 'subscriber';

export interface Organization {
  id: string;
  name: string;
  slug?: string;
  tradeName?: string;
  document?: string; // CNPJ / CPF
  segment?: string;
  logoUrl?: string;
  status?: 'active' | 'suspended' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export interface AccountMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  avatarUrl?: string;
  initials: string;
  role: 'owner' | 'admin' | 'member' | 'guest';
  status: 'active' | 'invited' | 'suspended';
  assignedProducts: string[]; // ['orcagraf', 'arteflow', 'artecheck']
  createdAt: string;
}
