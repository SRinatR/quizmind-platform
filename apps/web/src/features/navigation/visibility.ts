import { type AccessContext, type AccessRequirement } from '@quizmind/contracts';
// workspaceId is intentionally omitted — dashboard sections are now account-scoped
import { evaluateAccess } from '@quizmind/permissions';
import { type AdminNavGroup, adminNavigationGroups } from '@quizmind/ui';

import { adminSections, type AdminSection } from '../admin/sections';
import { dashboardSections, type DashboardSection } from '../dashboard/sections';

function isRequirementAllowed(context: AccessContext, requirement?: AccessRequirement): boolean {
  if (!requirement) {
    return true;
  }

  return evaluateAccess(context, requirement).allowed;
}

export function getVisibleDashboardSections(
  context: AccessContext,
): DashboardSection[] {
  return dashboardSections.filter((section) => isRequirementAllowed(context, section.requirement));
}

export function getVisibleAdminSections(
  context: AccessContext,
): AdminSection[] {
  return adminSections.filter((section) => isRequirementAllowed(context, section.requirement));
}

/** Returns admin nav groups filtered to sections the user can actually access. */
export function buildVisibleAdminNavGroups(
  context: AccessContext,
): AdminNavGroup[] {
  const visibleSections = getVisibleAdminSections(context);
  const visibleHrefs = new Set(visibleSections.map((s) => s.href));

  return adminNavigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => visibleHrefs.has(item.href)),
    }))
    .filter((group) => group.items.length > 0);
}
