import {
  EventSeverity,
  PrismaClient,
  SystemRole,
  WorkspaceRole,
  createPrismaClientOptions,
} from '../src';

const prisma = new PrismaClient(createPrismaClientOptions(process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/quizmind'));
const demoPasswordHash = '$2b$12$PHJXSUJWEvesXLnQh90hv.tvljJ4FN/GTqhqHoVFNtmRzGvsaMzVi';

async function seed() {
  await prisma.featureFlag.upsert({
    where: { key: 'beta.remote-config-v2' },
    update: {
      description: 'Enable the second-generation remote config payload.',
      status: 'active',
      enabled: true,
      rolloutPercentage: 100,
      minimumExtensionVersion: '1.5.0',
    },
    create: {
      key: 'beta.remote-config-v2',
      description: 'Enable the second-generation remote config payload.',
      status: 'active',
      enabled: true,
      rolloutPercentage: 100,
      minimumExtensionVersion: '1.5.0',
    },
  });

  await prisma.featureFlag.upsert({
    where: { key: 'ops.force-upgrade-banner' },
    update: {
      description: 'Show banner when a client is below the recommended version.',
      status: 'active',
      enabled: true,
    },
    create: {
      key: 'ops.force-upgrade-banner',
      description: 'Show banner when a client is below the recommended version.',
      status: 'active',
      enabled: true,
    },
  });

  async function upsertDemoUser(input: {
    email: string;
    displayName: string;
  }) {
    return prisma.user.upsert({
      where: { email: input.email },
      update: {
        displayName: input.displayName,
        emailVerifiedAt: new Date(),
        passwordHash: demoPasswordHash,
      },
      create: {
        email: input.email,
        displayName: input.displayName,
        passwordHash: demoPasswordHash,
        emailVerifiedAt: new Date(),
      },
    });
  }

  async function ensureSystemRole(input: { userId: string; role: SystemRole }) {
    await prisma.userSystemRole.upsert({
      where: {
        userId_role: {
          userId: input.userId,
          role: input.role,
        },
      },
      update: {},
      create: {
        userId: input.userId,
        role: input.role,
      },
    });
  }

  const adminUser = await upsertDemoUser({
    email: 'admin@quizmind.dev',
    displayName: 'QuizMind Admin',
  });
  const platformUser = await upsertDemoUser({
    email: 'platform@quizmind.dev',
    displayName: 'Pavel Platform',
  });
  const supportUser = await upsertDemoUser({
    email: 'support@quizmind.dev',
    displayName: 'Mila Support',
  });
  const billingUser = await upsertDemoUser({
    email: 'billing@quizmind.dev',
    displayName: 'Bianca Billing',
  });
  const securityUser = await upsertDemoUser({
    email: 'security@quizmind.dev',
    displayName: 'Sam Security',
  });
  const opsUser = await upsertDemoUser({
    email: 'ops@quizmind.dev',
    displayName: 'Oscar Ops',
  });
  const contentUser = await upsertDemoUser({
    email: 'content@quizmind.dev',
    displayName: 'Casey Content',
  });
  const ownerUser = await upsertDemoUser({
    email: 'owner@quizmind.dev',
    displayName: 'Olivia Owner',
  });
  const workspaceAdminUser = await upsertDemoUser({
    email: 'workspace-admin@quizmind.dev',
    displayName: 'Avery Workspace Admin',
  });
  const billingManagerUser = await upsertDemoUser({
    email: 'billing-manager@quizmind.dev',
    displayName: 'Bailey Billing Manager',
  });
  const securityManagerUser = await upsertDemoUser({
    email: 'security-manager@quizmind.dev',
    displayName: 'Sydney Security Manager',
  });
  const managerUser = await upsertDemoUser({
    email: 'manager@quizmind.dev',
    displayName: 'Morgan Manager',
  });
  const analystUser = await upsertDemoUser({
    email: 'analyst@quizmind.dev',
    displayName: 'Aria Analyst',
  });
  const memberUser = await upsertDemoUser({
    email: 'member@quizmind.dev',
    displayName: 'Mason Member',
  });
  const viewerUser = await upsertDemoUser({
    email: 'viewer@quizmind.dev',
    displayName: 'Noah Viewer',
  });

  const workspace = await prisma.workspace.upsert({
    where: { slug: 'demo-workspace' },
    update: {
      name: 'Demo Workspace',
    },
    create: {
      slug: 'demo-workspace',
      name: 'Demo Workspace',
    },
  });

  await Promise.all([
    prisma.workspaceMembership.upsert({
      where: {
        userId_workspaceId: {
          userId: adminUser.id,
          workspaceId: workspace.id,
        },
      },
      update: {
        role: WorkspaceRole.workspace_owner,
      },
      create: {
        userId: adminUser.id,
        workspaceId: workspace.id,
        role: WorkspaceRole.workspace_owner,
      },
    }),
    prisma.workspaceMembership.upsert({
      where: {
        userId_workspaceId: {
          userId: platformUser.id,
          workspaceId: workspace.id,
        },
      },
      update: {
        role: WorkspaceRole.workspace_admin,
      },
      create: {
        userId: platformUser.id,
        workspaceId: workspace.id,
        role: WorkspaceRole.workspace_admin,
      },
    }),
    prisma.workspaceMembership.upsert({
      where: {
        userId_workspaceId: {
          userId: supportUser.id,
          workspaceId: workspace.id,
        },
      },
      update: {
        role: WorkspaceRole.workspace_viewer,
      },
      create: {
        userId: supportUser.id,
        workspaceId: workspace.id,
        role: WorkspaceRole.workspace_viewer,
      },
    }),
    prisma.workspaceMembership.upsert({
      where: {
        userId_workspaceId: {
          userId: billingUser.id,
          workspaceId: workspace.id,
        },
      },
      update: {
        role: WorkspaceRole.workspace_billing_manager,
      },
      create: {
        userId: billingUser.id,
        workspaceId: workspace.id,
        role: WorkspaceRole.workspace_billing_manager,
      },
    }),
    prisma.workspaceMembership.upsert({
      where: {
        userId_workspaceId: {
          userId: securityUser.id,
          workspaceId: workspace.id,
        },
      },
      update: {
        role: WorkspaceRole.workspace_security_manager,
      },
      create: {
        userId: securityUser.id,
        workspaceId: workspace.id,
        role: WorkspaceRole.workspace_security_manager,
      },
    }),
    prisma.workspaceMembership.upsert({
      where: {
        userId_workspaceId: {
          userId: opsUser.id,
          workspaceId: workspace.id,
        },
      },
      update: {
        role: WorkspaceRole.workspace_manager,
      },
      create: {
        userId: opsUser.id,
        workspaceId: workspace.id,
        role: WorkspaceRole.workspace_manager,
      },
    }),
    prisma.workspaceMembership.upsert({
      where: {
        userId_workspaceId: {
          userId: contentUser.id,
          workspaceId: workspace.id,
        },
      },
      update: {
        role: WorkspaceRole.workspace_member,
      },
      create: {
        userId: contentUser.id,
        workspaceId: workspace.id,
        role: WorkspaceRole.workspace_member,
      },
    }),
    prisma.workspaceMembership.upsert({
      where: {
        userId_workspaceId: {
          userId: ownerUser.id,
          workspaceId: workspace.id,
        },
      },
      update: {
        role: WorkspaceRole.workspace_owner,
      },
      create: {
        userId: ownerUser.id,
        workspaceId: workspace.id,
        role: WorkspaceRole.workspace_owner,
      },
    }),
    prisma.workspaceMembership.upsert({
      where: {
        userId_workspaceId: {
          userId: workspaceAdminUser.id,
          workspaceId: workspace.id,
        },
      },
      update: {
        role: WorkspaceRole.workspace_admin,
      },
      create: {
        userId: workspaceAdminUser.id,
        workspaceId: workspace.id,
        role: WorkspaceRole.workspace_admin,
      },
    }),
    prisma.workspaceMembership.upsert({
      where: {
        userId_workspaceId: {
          userId: billingManagerUser.id,
          workspaceId: workspace.id,
        },
      },
      update: {
        role: WorkspaceRole.workspace_billing_manager,
      },
      create: {
        userId: billingManagerUser.id,
        workspaceId: workspace.id,
        role: WorkspaceRole.workspace_billing_manager,
      },
    }),
    prisma.workspaceMembership.upsert({
      where: {
        userId_workspaceId: {
          userId: securityManagerUser.id,
          workspaceId: workspace.id,
        },
      },
      update: {
        role: WorkspaceRole.workspace_security_manager,
      },
      create: {
        userId: securityManagerUser.id,
        workspaceId: workspace.id,
        role: WorkspaceRole.workspace_security_manager,
      },
    }),
    prisma.workspaceMembership.upsert({
      where: {
        userId_workspaceId: {
          userId: managerUser.id,
          workspaceId: workspace.id,
        },
      },
      update: {
        role: WorkspaceRole.workspace_manager,
      },
      create: {
        userId: managerUser.id,
        workspaceId: workspace.id,
        role: WorkspaceRole.workspace_manager,
      },
    }),
    prisma.workspaceMembership.upsert({
      where: {
        userId_workspaceId: {
          userId: analystUser.id,
          workspaceId: workspace.id,
        },
      },
      update: {
        role: WorkspaceRole.workspace_analyst,
      },
      create: {
        userId: analystUser.id,
        workspaceId: workspace.id,
        role: WorkspaceRole.workspace_analyst,
      },
    }),
    prisma.workspaceMembership.upsert({
      where: {
        userId_workspaceId: {
          userId: memberUser.id,
          workspaceId: workspace.id,
        },
      },
      update: {
        role: WorkspaceRole.workspace_member,
      },
      create: {
        userId: memberUser.id,
        workspaceId: workspace.id,
        role: WorkspaceRole.workspace_member,
      },
    }),
    prisma.workspaceMembership.upsert({
      where: {
        userId_workspaceId: {
          userId: viewerUser.id,
          workspaceId: workspace.id,
        },
      },
      update: {
        role: WorkspaceRole.workspace_viewer,
      },
      create: {
        userId: viewerUser.id,
        workspaceId: workspace.id,
        role: WorkspaceRole.workspace_viewer,
      },
    }),
  ]);

  const allSystemRolesForAdmin: SystemRole[] = [
    SystemRole.super_admin,
    SystemRole.platform_admin,
    SystemRole.billing_admin,
    SystemRole.support_admin,
    SystemRole.security_admin,
    SystemRole.ops_admin,
    SystemRole.content_admin,
  ];

  for (const role of allSystemRolesForAdmin) {
    await ensureSystemRole({
      userId: adminUser.id,
      role,
    });
  }

  await ensureSystemRole({
    userId: platformUser.id,
    role: SystemRole.platform_admin,
  });
  await ensureSystemRole({
    userId: supportUser.id,
    role: SystemRole.support_admin,
  });
  await ensureSystemRole({
    userId: billingUser.id,
    role: SystemRole.billing_admin,
  });
  await ensureSystemRole({
    userId: securityUser.id,
    role: SystemRole.security_admin,
  });
  await ensureSystemRole({
    userId: opsUser.id,
    role: SystemRole.ops_admin,
  });
  await ensureSystemRole({
    userId: contentUser.id,
    role: SystemRole.content_admin,
  });

  await prisma.supportTicketPresetFavorite.upsert({
    where: {
      userId_presetKey: {
        userId: supportUser.id,
        presetKey: 'active_queue',
      },
    },
    update: {},
    create: {
      userId: supportUser.id,
      presetKey: 'active_queue',
    },
  });

  await prisma.supportTicketPresetFavorite.upsert({
    where: {
      userId_presetKey: {
        userId: supportUser.id,
        presetKey: 'shared_queue',
      },
    },
    update: {},
    create: {
      userId: supportUser.id,
      presetKey: 'shared_queue',
    },
  });

  const existingViewerBillingTicket = await prisma.supportTicket.findFirst({
    where: {
      requesterId: viewerUser.id,
      workspaceId: workspace.id,
      subject: 'Viewer cannot access billing settings',
    },
  });

  if (existingViewerBillingTicket) {
    await prisma.supportTicket.update({
      where: {
        id: existingViewerBillingTicket.id,
      },
      data: {
        body: 'The viewer can open the workspace but hits a denial state on the billing settings route.',
        status: 'open',
        assignedToId: null,
        handoffNote: null,
      },
    });
  } else {
    await prisma.supportTicket.create({
      data: {
        requesterId: viewerUser.id,
        workspaceId: workspace.id,
        subject: 'Viewer cannot access billing settings',
        body: 'The viewer can open the workspace but hits a denial state on the billing settings route.',
        status: 'open',
      },
    });
  }

  const existingUpgradeTicket = await prisma.supportTicket.findFirst({
    where: {
      requesterId: adminUser.id,
      workspaceId: workspace.id,
      subject: 'Need help planning a workspace upgrade',
    },
  });

  if (existingUpgradeTicket) {
    await prisma.supportTicket.update({
      where: {
        id: existingUpgradeTicket.id,
      },
      data: {
        body: 'The admin wants support to verify which users will be affected before upgrading the workspace plan.',
        status: 'in_progress',
        assignedToId: supportUser.id,
        handoffNote: 'Support is comparing free and pro entitlements before replying to the workspace owner.',
      },
    });
  } else {
    await prisma.supportTicket.create({
      data: {
        requesterId: adminUser.id,
        workspaceId: workspace.id,
        subject: 'Need help planning a workspace upgrade',
        body: 'The admin wants support to verify which users will be affected before upgrading the workspace plan.',
        status: 'in_progress',
        assignedToId: supportUser.id,
        handoffNote: 'Support is comparing free and pro entitlements before replying to the workspace owner.',
      },
    });
  }

  const chromeInstallation = await prisma.extensionInstallation.upsert({
    where: { installationId: 'inst_local_browser' },
    update: {
      userId: adminUser.id,
      workspaceId: workspace.id,
      browser: 'chrome',
      extensionVersion: '1.7.0',
      schemaVersion: '2',
      capabilitiesJson: ['quiz-capture', 'history-sync', 'remote-sync'],
      lastSeenAt: new Date(),
    },
    create: {
      userId: adminUser.id,
      workspaceId: workspace.id,
      installationId: 'inst_local_browser',
      browser: 'chrome',
      extensionVersion: '1.7.0',
      schemaVersion: '2',
      capabilitiesJson: ['quiz-capture', 'history-sync', 'remote-sync'],
      lastSeenAt: new Date(),
    },
  });

  const edgeInstallation = await prisma.extensionInstallation.upsert({
    where: { installationId: 'inst_demo_edge' },
    update: {
      userId: viewerUser.id,
      workspaceId: workspace.id,
      browser: 'edge',
      extensionVersion: '1.6.4',
      schemaVersion: '2',
      capabilitiesJson: ['quiz-capture', 'history-sync'],
      lastSeenAt: new Date(Date.now() - 75 * 60 * 1000),
    },
    create: {
      userId: viewerUser.id,
      workspaceId: workspace.id,
      installationId: 'inst_demo_edge',
      browser: 'edge',
      extensionVersion: '1.6.4',
      schemaVersion: '2',
      capabilitiesJson: ['quiz-capture', 'history-sync'],
      lastSeenAt: new Date(Date.now() - 75 * 60 * 1000),
    },
  });

  const quotaPeriodStart = new Date();
  quotaPeriodStart.setUTCHours(0, 0, 0, 0);
  const quotaPeriodEnd = new Date(quotaPeriodStart);
  quotaPeriodEnd.setUTCDate(quotaPeriodEnd.getUTCDate() + 1);

  await prisma.quotaCounter.upsert({
    where: {
      workspaceId_key_periodStart_periodEnd: {
        workspaceId: workspace.id,
        key: 'limit.requests_per_day',
        periodStart: quotaPeriodStart,
        periodEnd: quotaPeriodEnd,
      },
    },
    update: {
      consumed: 41,
    },
    create: {
      workspaceId: workspace.id,
      key: 'limit.requests_per_day',
      consumed: 41,
      periodStart: quotaPeriodStart,
      periodEnd: quotaPeriodEnd,
    },
  });

  const seededTelemetryCount = await prisma.extensionTelemetry.count({
    where: {
      extensionInstallationId: {
        in: [chromeInstallation.id, edgeInstallation.id],
      },
    },
  });

  if (seededTelemetryCount === 0) {
    await prisma.extensionTelemetry.createMany({
      data: [
        {
          extensionInstallationId: chromeInstallation.id,
          eventType: 'extension.quiz_answer_requested',
          severity: EventSeverity.info,
          payloadJson: {
            questionType: 'multiple_choice',
            surface: 'content_script',
          },
          createdAt: new Date(Date.now() - 15 * 60 * 1000),
        },
        {
          extensionInstallationId: edgeInstallation.id,
          eventType: 'extension.screenshot_answer_requested',
          severity: EventSeverity.warn,
          payloadJson: {
            questionType: 'image',
            surface: 'overlay',
          },
          createdAt: new Date(Date.now() - 95 * 60 * 1000),
        },
      ],
    });
  }

  const existingUsageActivityCount = await prisma.activityLog.count({
    where: {
      workspaceId: workspace.id,
      eventType: {
        in: ['usage.dashboard_opened', 'usage.extension.quiz_answer_requested'],
      },
    },
  });

  if (existingUsageActivityCount === 0) {
    await prisma.activityLog.createMany({
      data: [
        {
          workspaceId: workspace.id,
          actorId: adminUser.id,
          eventType: 'usage.dashboard_opened',
          metadataJson: {
            route: '/app/usage',
            source: 'seed',
          },
          createdAt: new Date(Date.now() - 12 * 60 * 1000),
        },
        {
          workspaceId: workspace.id,
          actorId: adminUser.id,
          eventType: 'usage.extension.quiz_answer_requested',
          metadataJson: {
            installationId: chromeInstallation.installationId,
            accepted: true,
            quotaKey: 'limit.requests_per_day',
            questionType: 'multiple_choice',
          },
          createdAt: new Date(Date.now() - 14 * 60 * 1000),
        },
      ],
    });
  }

  const activeGlobalRemoteConfigVersion = await prisma.remoteConfigVersion.findFirst({
    where: {
      workspaceId: null,
      isActive: true,
    },
  });

  if (!activeGlobalRemoteConfigVersion) {
    const existingSeedGlobalRemoteConfigVersion = await prisma.remoteConfigVersion.findFirst({
      where: {
        workspaceId: null,
        versionLabel: 'seed-global-default-v1',
      },
    });

    if (existingSeedGlobalRemoteConfigVersion) {
      await prisma.remoteConfigVersion.update({
        where: {
          id: existingSeedGlobalRemoteConfigVersion.id,
        },
        data: {
          isActive: true,
          publishedById: adminUser.id,
        },
      });

      await prisma.remoteConfigLayer.deleteMany({
        where: {
          remoteConfigVersionId: existingSeedGlobalRemoteConfigVersion.id,
        },
      });

      await prisma.remoteConfigLayer.createMany({
        data: [
          {
            remoteConfigVersionId: existingSeedGlobalRemoteConfigVersion.id,
            scope: 'global',
            priority: 5,
            valuesJson: {
              bootstrapTheme: 'seeded',
              showConfidence: true,
            },
          },
          {
            remoteConfigVersionId: existingSeedGlobalRemoteConfigVersion.id,
            scope: 'plan',
            priority: 10,
            conditionsJson: {
              planCode: 'pro',
            },
            valuesJson: {
              answerStyle: 'detailed',
            },
          },
        ],
      });
    } else {
      await prisma.remoteConfigVersion.create({
        data: {
          versionLabel: 'seed-global-default-v1',
          isActive: true,
          publishedById: adminUser.id,
          layers: {
            create: [
              {
                scope: 'global',
                priority: 5,
                valuesJson: {
                  bootstrapTheme: 'seeded',
                  showConfidence: true,
                },
              },
              {
                scope: 'plan',
                priority: 10,
                conditionsJson: {
                  planCode: 'pro',
                },
                valuesJson: {
                  answerStyle: 'detailed',
                },
              },
            ],
          },
        },
      });
    }
  }

  const existingCompatibilityRule = await prisma.extensionCompatibilityRule.findFirst({
    orderBy: [{ createdAt: 'desc' }],
  });

  if (!existingCompatibilityRule) {
    await prisma.extensionCompatibilityRule.create({
      data: {
        minimumVersion: '1.4.0',
        recommendedVersion: '1.6.0',
        supportedSchemaVersions: ['2'],
        requiredCapabilities: ['quiz-capture'],
        resultStatus: 'supported',
        reason: 'Seeded baseline compatibility policy for connected local runtime.',
      },
    });
  }
}

seed()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
