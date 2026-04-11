import { type AccessContext, type AccessRequirement } from '@quizmind/contracts';
import { evaluateAccess } from '@quizmind/permissions';
import { type AdminNavGroup } from '@quizmind/ui';

import {
  adminSections,
  buildAdminNavGroups,
  type AdminSection,
} from '../admin/sections';
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

/**
 * Returns admin nav groups filtered to sections the current user can actually
 * access, based on their permissions.
 */
export function buildVisibleAdminNavGroups(
  context: AccessContext,
): AdminNavGroup[] {
  const visibleSections = getVisibleAdminSections(context);
  return buildAdminNavGroups(visibleSections);
}
