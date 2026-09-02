export type AccountType = 'organization' | 'company' | 'subscriber';

export type UserRole = 'owner' | 'admin' | 'member' | 'guest';

export interface Organization {
  id: string;
  name: string;
  slug?: string;
  tradeName?: string;
  document?: string; // CNPJ / CPF
  segment?: string;
  logoUrl?: string;
  status?: 'active' | 'suspended' | 'archived';
  userRole?: UserRole;
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
