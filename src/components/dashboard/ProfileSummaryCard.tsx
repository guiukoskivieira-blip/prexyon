import React from 'react';
import { User, Building2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../ui/Button';

interface ProfileSummaryCardProps {
  onViewProfile: () => void;
  onViewOrganization: () => void;
}

export const ProfileSummaryCard: React.FC<ProfileSummaryCardProps> = ({
  onViewProfile,
  onViewOrganization
}) => {
  const { user, organization } = useAuth();

  return (
    <div className="bg-white rounded-2xl border border-[#e2e8f0] shadow-[0_2px_8px_rgba(0,0,0,0.04)] p-6 flex flex-col justify-between h-full transition-all duration-200 hover:shadow-[0_8px_20px_rgba(0,0,0,0.05)]">
      {/* Header Section */}
      <div className="flex items-center space-x-2.5 pb-5 border-b border-slate-100">
        <div className="p-1.5 rounded-lg bg-slate-100 text-slate-700">
          <User className="w-4 h-4" />
        </div>
        <h3 className="text-base font-bold text-slate-900 tracking-tight">
          Perfil e organização
        </h3>
      </div>

      {/* Main Content Grid */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 py-5">
        {/* Avatar + Info */}
        <div className="flex items-center space-x-4">
          <div className="w-14 h-14 rounded-full bg-slate-100 border border-slate-200 text-slate-800 font-bold text-base flex items-center justify-center shrink-0 shadow-2xs">
            {user?.initials || 'GS'}
          </div>

          <div>
            <h4 className="text-base font-bold text-slate-900 tracking-tight">
              {user?.name || 'Usuário'}
            </h4>
            <p className="text-xs text-slate-500 mt-0.5">
              {user?.email || ''}
            </p>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-600 font-medium">
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              <span>{organization.name}</span>
            </div>
          </div>
        </div>

        {/* Action Buttons Column */}
        <div className="flex flex-col space-y-2.5 w-full sm:w-auto shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={onViewProfile}
            leftIcon={<User className="w-3.5 h-3.5 text-[#0066ff]" />}
            className="w-full sm:w-44 text-xs font-semibold text-[#0066ff] border-slate-300 hover:border-[#0066ff] hover:bg-blue-50/50 justify-center"
          >
            Meu perfil
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={onViewOrganization}
            leftIcon={<Building2 className="w-3.5 h-3.5 text-slate-600" />}
            className="w-full sm:w-44 text-xs font-semibold text-slate-700 border-slate-300 hover:border-slate-400 hover:bg-slate-50 justify-center"
          >
            Dados da empresa
          </Button>
        </div>
      </div>
    </div>
  );
};
