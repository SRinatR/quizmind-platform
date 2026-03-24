import { PrismaClient, SubscriptionStatus, SystemRole, WorkspaceRole } from '@prisma/client';

const prisma = new PrismaClient();
const demoPasswordHash = '$2b$12$PHJXSUJWEvesXLnQh90hv.tvljJ4FN/GTqhqHoVFNtmRzGvsaMzVi';

async function seed() {
  const freePlan = await prisma.plan.upsert({
    where: { code: 'free' },
    update: {
      name: 'Free',
      description: 'Starter tier for local development and onboarding flows.',
      isActive: true,
    },
    create: {
      code: 'free',
      name: 'Free',
      description: 'Starter tier for local development and onboarding flows.',
      isActive: true,
    },
  });

  const proPlan = await prisma.plan.upsert({
    where: { code: 'pro' },
    update: {
      name: 'Pro',
      description: 'Expanded quotas and control-plane capabilities for active workspaces.',
      isActive: true,
    },
    create: {
      code: 'pro',
      name: 'Pro',
      description: 'Expanded quotas and control-plane capabilities for active workspaces.',
      isActive: true,
    },
  });

  const businessPlan = await prisma.plan.upsert({
    where: { code: 'business' },
    update: {
      name: 'Business',
      description: 'Business tier with higher quotas, more seats, and priority billing support.',
      isActive: true,
    },
    create: {
      code: 'business',
      name: 'Business',
      description: 'Business tier with higher quotas, more seats, and priority billing support.',
      isActive: true,
    },
  });

  await prisma.planEntitlement.createMany({
    data: [
      { planId: freePlan.id, key: 'feature.text_answering', enabled: true },
      { planId: freePlan.id, key: 'limit.requests_per_day', enabled: true, limitValue: 25 },
      { planId: proPlan.id, key: 'feature.text_answering', enabled: true },
      { planId: proPlan.id, key: 'feature.screenshot_answering', enabled: true },
      { planId: proPlan.id, key: 'feature.remote_config', enabled: true },
      { planId: proPlan.id, key: 'limit.requests_per_day', enabled: true, limitValue: 500 },
      { planId: businessPlan.id, key: 'feature.text_answering', enabled: true },
      { planId: businessPlan.id, key: 'feature.screenshot_answering', enabled: true },
      { planId: businessPlan.id, key: 'feature.remote_config', enabled: true },
      { planId: businessPlan.id, key: 'feature.priority_support', enabled: true },
      { planId: businessPlan.id, key: 'limit.screenshots_per_day', enabled: true, limitValue: 200 },
      { planId: businessPlan.id, key: 'limit.seats', enabled: true, limitValue: 5 },
      { planId: businessPlan.id, key: 'limit.history_retention_days', enabled: true, limitValue: 365 },
    ],
    skipDuplicates: true,
  });

  const seededPlanPrices = [
    {
      planId: freePlan.id,
      intervalCode: 'monthly',
      currency: 'usd',
      amount: 0,
      isDefault: true,
      stripePriceId: null,
    },
    {
      planId: proPlan.id,
      intervalCode: 'monthly',
      currency: 'usd',
      amount: 900,
      isDefault: true,
      stripePriceId: 'price_pro_monthly',
    },
    {
      planId: proPlan.id,
      intervalCode: 'yearly',
      currency: 'usd',
      amount: 9000,
      isDefault: false,
      stripePriceId: 'price_pro_yearly',
    },
    {
      planId: businessPlan.id,
      intervalCode: 'monthly',
      currency: 'usd',
      amount: 2900,
      isDefault: true,
      stripePriceId: 'price_biz_monthly',
    },
    {
      planId: businessPlan.id,
      intervalCode: 'yearly',
      currency: 'usd',
      amount: 29000,
      isDefault: false,
      stripePriceId: 'price_biz_yearly',
    },
  ] as const;

  for (const price of seededPlanPrices) {
    await prisma.planPrice.upsert({
      where: {
        planId_intervalCode_currency: {
          planId: price.planId,
          intervalCode: price.intervalCode,
          currency: price.currency,
        },
      },
      update: {
        amount: price.amount,
        isDefault: price.isDefault,
        stripePriceId: price.stripePriceId,
      },
      create: {
        ...price,
      },
    });
  }

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

  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@quizmind.dev' },
    update: {
      displayName: 'QuizMind Admin',
      emailVerifiedAt: new Date(),
      passwordHash: demoPasswordHash,
    },
    create: {
      email: 'admin@quizmind.dev',
      displayName: 'QuizMind Admin',
      passwordHash: demoPasswordHash,
      emailVerifiedAt: new Date(),
    },
  });

  const supportUser = await prisma.user.upsert({
    where: { email: 'support@quizmind.dev' },
    update: {
      displayName: 'Mila Support',
      emailVerifiedAt: new Date(),
      passwordHash: demoPasswordHash,
    },
    create: {
      email: 'support@quizmind.dev',
      displayName: 'Mila Support',
      passwordHash: demoPasswordHash,
      emailVerifiedAt: new Date(),
    },
  });

  const viewerUser = await prisma.user.upsert({
    where: { email: 'viewer@quizmind.dev' },
    update: {
      displayName: 'Noah Viewer',
      emailVerifiedAt: new Date(),
      passwordHash: demoPasswordHash,
    },
    create: {
      email: 'viewer@quizmind.dev',
      displayName: 'Noah Viewer',
      passwordHash: demoPasswordHash,
      emailVerifiedAt: new Date(),
    },
  });

  const workspace = await prisma.workspace.upsert({
    where: { slug: 'demo-workspace' },
    update: {
      name: 'Demo Workspace',
      billingEmail: 'billing@quizmind.dev',
    },
    create: {
      slug: 'demo-workspace',
      name: 'Demo Workspace',
      billingEmail: 'billing@quizmind.dev',
    },
  });

  await prisma.workspaceMembership.upsert({
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
  });

  await prisma.workspaceMembership.upsert({
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
  });

  await prisma.workspaceMembership.upsert({
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
  });

  await prisma.userSystemRole.upsert({
    where: {
      userId_role: {
        userId: adminUser.id,
        role: SystemRole.platform_admin,
      },
    },
    update: {},
    create: {
      userId: adminUser.id,
      role: SystemRole.platform_admin,
    },
  });

  await prisma.userSystemRole.upsert({
    where: {
      userId_role: {
        userId: supportUser.id,
        role: SystemRole.support_admin,
      },
    },
    update: {},
    create: {
      userId: supportUser.id,
      role: SystemRole.support_admin,
    },
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

  await prisma.subscription.upsert({
    where: { externalId: 'seed:demo-workspace:free' },
    update: {
      planId: freePlan.id,
      status: SubscriptionStatus.trialing,
      billingInterval: 'monthly',
      seatCount: 1,
      trialStartAt: new Date(),
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      cancelAtPeriodEnd: false,
    },
    create: {
      workspaceId: workspace.id,
      planId: freePlan.id,
      externalId: 'seed:demo-workspace:free',
      status: SubscriptionStatus.trialing,
      billingInterval: 'monthly',
      seatCount: 1,
      trialStartAt: new Date(),
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      cancelAtPeriodEnd: false,
    },
  });

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
