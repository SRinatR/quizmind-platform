import { type AccessContext, type AccessRequirement } from '@quizmind/contracts';
import { evaluateAccess } from '@quizmind/permissions';

import { adminSections, type AdminSection } from '../admin/sections';
import { dashboardSections, type DashboardSection } from '../dashboard/sections';

function isRequirementAllowed(context: AccessContext, workspaceId: string | undefined, requirement?: AccessRequirement): boolean {
  if (!requirement) {
    return true;
  }

  return evaluateAccess(context, {
    ...requirement,
    workspaceId: requirement.workspaceId ?? workspaceId,
  }).allowed;
}

export function getVisibleDashboardSections(
  context: AccessContext,
  workspaceId?: string,
): DashboardSection[] {
  return dashboardSections.filter((section) => isRequirementAllowed(context, workspaceId, section.requirement));
}

export function getVisibleAdminSections(
  context: AccessContext,
  workspaceId?: string,
): AdminSection[] {
  return adminSections.filter((section) => isRequirementAllowed(context, workspaceId, section.requirement));
}
