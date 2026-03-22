import { type AccessRequirement } from '@quizmind/contracts';

export interface AdminSection {
  id: string;
  title: string;
  href: string;
  description: string;
  requirement: AccessRequirement;
}

export const adminSections: AdminSection[] = [
  {
    id: 'users',
    title: 'Users',
    href: '/admin/users',
    description: 'User directory, role assignments, and support access.',
    requirement: {
      permission: 'users:read',
    },
  },
  {
    id: 'plans',
    title: 'Plans',
    href: '/admin/plans',
    description: 'Plans, prices, entitlements, and overrides.',
    requirement: {
      permission: 'plans:manage',
    },
  },
  {
    id: 'feature-flags',
    title: 'Feature Flags',
    href: '/admin/feature-flags',
    description: 'Rollouts, targeting, and beta controls.',
    requirement: {
      permission: 'feature_flags:read',
    },
  },
  {
    id: 'remote-config',
    title: 'Remote Config',
    href: '/admin/remote-config',
    description: 'Draft, preview, and publish extension config versions.',
    requirement: {
      permission: 'remote_config:publish',
    },
  },
];
