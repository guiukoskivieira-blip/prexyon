import { AuthUser } from '../types/auth';
import { Organization, AccountMember } from '../types/account';

export const mockUser: AuthUser = {
  id: 'usr_01j8k9m2p4',
  name: 'Guilherme Vieira',
  firstName: 'Guilherme',
  lastName: 'Vieira',
  email: 'gui@exemplo.com',
  initials: 'GS',
  role: 'owner',
  accountId: 'org_prexyon_alfa_01'
};

export const mockOrganization: Organization = {
  id: 'org_prexyon_alfa_01',
  name: 'Gráfica Alfa',
  tradeName: 'Alfa Soluções Gráficas & Comunicação',
  document: '12.345.678/0001-90',
  segment: 'Indústria Gráfica & Comunicação Visual',
  createdAt: '2025-01-15T00:00:00Z',
  updatedAt: '2026-08-31T00:00:00Z'
};

export const mockMembers: AccountMember[] = [
  {
    id: 'mem_01',
    userId: 'usr_01j8k9m2p4',
    name: 'Guilherme Vieira',
    email: 'gui@exemplo.com',
    initials: 'GS',
    role: 'owner',
    status: 'active',
    assignedProducts: ['orcagraf', 'arteflow', 'artecheck'],
    createdAt: '2025-01-15T00:00:00Z'
  },
  {
    id: 'mem_02',
    userId: 'usr_02k9l1n3q5',
    name: 'Ana Carolina Silva',
    email: 'ana.comercial@exemplo.com',
    initials: 'AC',
    role: 'member',
    status: 'active',
    assignedProducts: ['orcagraf'],
    createdAt: '2025-03-10T00:00:00Z'
  },
  {
    id: 'mem_03',
    userId: 'usr_03m0o2p4r6',
    name: 'Roberto Souza',
    email: 'roberto.producao@exemplo.com',
    initials: 'RS',
    role: 'member',
    status: 'active',
    assignedProducts: ['arteflow'],
    createdAt: '2025-05-22T00:00:00Z'
  },
  {
    id: 'mem_04',
    userId: 'usr_04p1r3s5t7',
    name: 'Mariana Lima',
    email: 'mariana.arte@exemplo.com',
    initials: 'ML',
    role: 'member',
    status: 'invited',
    assignedProducts: ['artecheck'],
    createdAt: '2026-08-01T00:00:00Z'
  }
];
