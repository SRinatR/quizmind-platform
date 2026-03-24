import { EventSeverity, PrismaClient, SubscriptionStatus, SystemRole, WorkspaceRole } from '@prisma/client';

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
