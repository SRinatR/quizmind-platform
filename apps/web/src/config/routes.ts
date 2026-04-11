import { dashboardNavigation, publicNavigation } from '@quizmind/ui';
import { allAdminNavGroups } from '../features/admin/sections';

export const routeGroups = {
  public: publicNavigation,
  dashboard: dashboardNavigation,
  // Flat list of all admin hrefs for middleware / route-matching use
  admin: allAdminNavGroups.flatMap((g) => g.items),
} as const;
