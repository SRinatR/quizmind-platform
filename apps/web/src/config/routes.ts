import { adminNavigation, dashboardNavigation, publicNavigation } from '@quizmind/ui';

export const routeGroups = {
  public: publicNavigation,
  dashboard: dashboardNavigation,
  admin: adminNavigation,
} as const;
