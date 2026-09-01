import { ProductId } from './product';

export interface PermissionItem {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
}

export interface PermissionModuleGroup {
  moduleId: string;
  moduleName: string;
  description: string;
  permissions: PermissionItem[];
}

export interface ProductPermissionSchema {
  productId: ProductId;
  productName: string;
  modules: PermissionModuleGroup[];
}

export interface UserCustomPermissions {
  userId: string;
  permissionsByProduct: Record<ProductId, string[]>; // mapping of productId to enabled permission IDs
}
