import os from "os";
import mongoose from "mongoose";
import User from "../models/users.js";
import Notification from "../models/Notification.js";
import PhotographerApplication from "../models/PhotographerApplication.js";
import AdminLog from "../models/AdminLog.js";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import Payment from "../models/Payment.js";
import Withdrawal from "../models/Withdrawal.js";
import Refund from "../models/Refund.js";
import Media from "../models/media.js";
import Album from "../models/album.js";
import ShareToken from "../models/ShareToken.js";
import WalletTransaction from "../models/WalletTransaction.js";
import SystemConfig from "../models/SystemConfig.js";
import MpesaLog from "../models/MpesaLog.js";
import { getConnectedUsers } from "../services/socketService.js";

function startOfDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return startOfDay(date);
}

function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function formatDayLabel(date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function safeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function makeDailySeries({ days = 7, labelFormatter = formatDayLabel }) {
  const base = daysAgo(days - 1);
  return Array.from({ length: days }, (_, index) => {
    const date = addDays(base, index);
    return {
      key: date.toISOString().slice(0, 10),
      label: labelFormatter(date),
      start: date,
      end: addDays(date, 1),
      value: 0,
    };
  });
}

function groupCountsByDay(items, getDateValue, days = 7) {
  const series = makeDailySeries({ days });
  const index = new Map(series.map((entry) => [entry.key, entry]));

  items.forEach((item) => {
    const raw = getDateValue(item);
    if (!raw) return;
    const key = new Date(raw).toISOString().slice(0, 10);
    const bucket = index.get(key);
    if (bucket) bucket.value += 1;
  });

  return series.map(({ key, label, value }) => ({ key, label, value }));
}

function groupSumByDay(items, getDateValue, getAmount, days = 7) {
  const series = makeDailySeries({ days });
  const index = new Map(series.map((entry) => [entry.key, entry]));

  items.forEach((item) => {
    const raw = getDateValue(item);
    if (!raw) return;
    const key = new Date(raw).toISOString().slice(0, 10);
    const bucket = index.get(key);
    if (bucket) bucket.value += safeNumber(getAmount(item));
  });

  return series.map(({ key, label, value }) => ({ key, label, value }));
}

async function getDatabaseStats() {
  try {
    if (!mongoose.connection?.db) {
      return null;
    }
    return await mongoose.connection.db.stats();
  } catch {
    return null;
  }
}

async function getStorageUsage() {
  const [dbStats, mediaTotals] = await Promise.all([
    getDatabaseStats(),
    Media.aggregate([
      {
        $group: {
          _id: null,
          totalViews: { $sum: { $ifNull: ["$views", "$viewCount", 0] } },
          totalDownloads: { $sum: { $ifNull: ["$downloads", 0] } },
          totalLikes: { $sum: { $ifNull: ["$likes", 0] } },
        },
      },
    ]),
  ]);

  return {
    dbStats,
    mediaTotals: mediaTotals[0] || { totalViews: 0, totalDownloads: 0, totalLikes: 0 },
  };
}

function mapActivity(log) {
  return {
    id: String(log._id),
    action: log.action,
    actor: log.adminName,
    entityType: log.entityType,
    entityId: log.entityId,
    createdAt: log.createdAt,
    details: log.details || {},
  };
}

async function buildSecretaryDashboard(userId) {
  const weekStart = daysAgo(6);
  const today = startOfDay();
  const now = new Date();

  const [
    applications,
    notifications,
    recentLogs,
    allConversations,
    recentMessages,
    totalUsers,
    totalMedia,
    totalAlbums,
    pendingWithdrawals,
  ] = await Promise.all([
    PhotographerApplication.find({})
      .select("status createdAt reviewedAt updatedAt")
      .sort({ createdAt: -1 })
      .lean(),
    Notification.find({})
      .select("type isRead createdAt readAt title priority recipient sender")
      .sort({ createdAt: -1 })
      .limit(300)
      .lean(),
    AdminLog.find({})
      .sort({ createdAt: -1 })
      .limit(30)
      .lean(),
    Conversation.find({})
      .select("participants archivedBy lastMessageAt unreadCounts createdAt")
      .lean(),
    Message.find({})
      .select("createdAt isRead readBy type sender conversation")
      .sort({ createdAt: -1 })
      .limit(500)
      .lean(),
    User.countDocuments(),
    Media.countDocuments(),
    Album.countDocuments(),
    Withdrawal.find({ status: { $in: ["pending", "processing"] } }).select("amount createdAt status").lean(),
  ]);

  const pendingApplications = applications.filter((app) => app.status === "pending");
  const approvedApplications = applications.filter((app) => app.status === "approved");
  const rejectedApplications = applications.filter((app) => app.status === "rejected");

  const adminAnnouncements = notifications.filter((item) => item.type === "admin" || item.type === "system");
  const activeAnnouncements = adminAnnouncements.filter((item) => item.createdAt >= weekStart);
  const expiredAnnouncements = adminAnnouncements.filter((item) => item.createdAt < weekStart);
  const readAnnouncements = adminAnnouncements.filter((item) => item.isRead);

  const unreadCounts = allConversations.reduce((sum, conversation) => {
    const counts = conversation.unreadCounts || {};
    if (counts instanceof Map) {
      for (const value of counts.values()) sum += safeNumber(value);
      return sum;
    }
    return sum + Object.values(counts).reduce((acc, value) => acc + safeNumber(value), 0);
  }, 0);

  const openTickets = allConversations.filter((item) => !item.archivedBy?.length).length;
  const closedTickets = allConversations.filter((item) => item.archivedBy?.length).length;
  const pendingTickets = allConversations.filter((item) => item.lastMessageAt && item.lastMessageAt >= weekStart).length;
  const escalatedTickets = recentLogs.filter((log) => /escalat|ban|reject|delete/i.test(log.action || "")).length;
  const highPriorityNotifications = notifications.filter((item) => item.priority === "high").length;
  const resolutionMinutes = applications
    .filter((app) => app.reviewedAt)
    .map((app) => (new Date(app.reviewedAt).getTime() - new Date(app.createdAt).getTime()) / 60000);
  const averageResolutionHours = resolutionMinutes.length
    ? Number((resolutionMinutes.reduce((sum, value) => sum + value, 0) / resolutionMinutes.length / 60).toFixed(1))
    : 0;

  const messages24h = recentMessages.filter((message) => message.createdAt >= new Date(Date.now() - 24 * 60 * 60 * 1000)).length;
  const internalMessages = recentMessages.filter((message) => message.type === "system").length;
  const readReceipts = recentMessages.filter((message) => message.isRead || (message.readBy || []).length > 0).length;

  const operationsBacklog = pendingApplications.length
    + pendingWithdrawals.length
    + notifications.filter((item) => !item.isRead).length;
  const completedOperations = approvedApplications.length + rejectedApplications.length;
  const overdueOperations = pendingApplications.filter((item) => item.createdAt < daysAgo(2)).length
    + pendingWithdrawals.filter((item) => item.createdAt < daysAgo(2)).length;

  const recentUserLogs = await AdminLog.find({ admin: userId }).sort({ createdAt: -1 }).limit(12).lean();
  const currentUser = await User.findById(userId).select("username email role staffPermissions createdAt").lean();
  const responsibilities = Object.entries(currentUser?.staffPermissions || {})
    .filter(([, enabled]) => Boolean(enabled))
    .map(([permission]) => permission);

  return {
    overview: {
      totalTickets: allConversations.length,
      openTickets,
      closedTickets,
      pendingTickets,
      escalatedTickets,
      pendingApplications: pendingApplications.length,
      unreadAnnouncements: adminAnnouncements.length - readAnnouncements.length,
      operationsBacklog,
    },
    tickets: {
      total: allConversations.length,
      open: openTickets,
      closed: closedTickets,
      pending: pendingTickets,
      escalated: escalatedTickets,
      priorityDistribution: {
        high: highPriorityNotifications,
        normal: notifications.filter((item) => item.priority === "normal").length,
        low: notifications.filter((item) => item.priority === "low").length,
      },
      resolutionTimeHours: averageResolutionHours,
      recentActivity: recentLogs.slice(0, 8).map(mapActivity),
    },
    schedule: {
      upcomingMeetings: 0,
      upcomingEvents: await Album.countDocuments({ eventDate: { $gte: today } }),
      roomBookings: 0,
      deadlines: overdueOperations,
      notes: "No dedicated scheduling model exists yet. Event and deadline counts are sourced from real operational records only.",
    },
    announcements: {
      active: activeAnnouncements.length,
      scheduled: 0,
      expired: expiredAnnouncements.length,
      read: readAnnouncements.length,
      unread: adminAnnouncements.length - readAnnouncements.length,
      engagementRate: adminAnnouncements.length
        ? Number(((readAnnouncements.length / adminAnnouncements.length) * 100).toFixed(1))
        : 0,
      recent: adminAnnouncements.slice(0, 6),
    },
    reports: {
      generated: recentLogs.filter((log) => /report|export/i.test(log.action || "")).length,
      pending: 0,
      approvalStatus: {
        approved: approvedApplications.length,
        pending: pendingApplications.length,
        rejected: rejectedApplications.length,
      },
      submissionHistory: groupCountsByDay(applications, (item) => item.createdAt),
      exportAnalytics: recentLogs.filter((log) => /export/i.test(log.action || "")).slice(0, 5).map(mapActivity),
    },
    applications: {
      total: applications.length,
      new: applications.filter((item) => item.createdAt >= weekStart).length,
      approved: approvedApplications.length,
      rejected: rejectedApplications.length,
      pending: pendingApplications.length,
      processingTimelineHours: averageResolutionHours,
      trend: groupCountsByDay(applications, (item) => item.createdAt),
      queue: pendingApplications.slice(0, 6),
    },
    communications: {
      internalMessages,
      externalMessages: recentMessages.length - internalMessages,
      messages24h,
      unreadMessageCount: unreadCounts,
      readReceiptRate: recentMessages.length
        ? Number(((readReceipts / recentMessages.length) * 100).toFixed(1))
        : 0,
      analytics: groupCountsByDay(recentMessages, (item) => item.createdAt),
    },
    records: {
      totalRecords: totalUsers + totalMedia + totalAlbums + applications.length,
      recentlyUpdated: recentLogs.length,
      archivedRecords: closedTickets,
      accessLogs: recentLogs.length,
      modificationHistory: recentLogs.slice(0, 10).map(mapActivity),
      searchAnalytics: {
        searchableRecords: totalUsers + totalMedia + totalAlbums,
        activeCollections: 4,
      },
    },
    tasks: {
      assigned: operationsBacklog,
      completed: completedOperations,
      overdue: overdueOperations,
      upcoming: pendingApplications.filter((item) => item.createdAt >= today).length + pendingWithdrawals.length,
      productivityScore: completedOperations + operationsBacklog > 0
        ? Number(((completedOperations / (completedOperations + operationsBacklog)) * 100).toFixed(1))
        : 100,
      completionTrend: groupCountsByDay(
        applications.filter((item) => item.reviewedAt),
        (item) => item.reviewedAt
      ),
    },
    profile: {
      account: currentUser,
      performanceMetrics: {
        actionsLogged: recentUserLogs.length,
        responsibilitiesCount: responsibilities.length,
        unreadNotifications: notifications.filter((item) => !item.isRead && String(item.recipient) === String(userId)).length,
      },
      activityHistory: recentUserLogs.map(mapActivity),
      attendanceRecords: [],
      assignedResponsibilities: responsibilities,
    },
    analytics: {
      dailyOperationalWorkload: groupCountsByDay(recentLogs, (item) => item.createdAt),
      ticketProcessingTrends: groupCountsByDay(allConversations, (item) => item.lastMessageAt || item.createdAt),
      communicationPerformance: groupCountsByDay(recentMessages, (item) => item.createdAt),
      staffEngagement: {
        connectedUsers: getConnectedUsers().length,
        activeStaffActions: recentLogs.filter((item) => item.createdAt >= weekStart).length,
      },
    },
    activityFeed: recentLogs.slice(0, 12).map(mapActivity),
    live: {
      connectedUsers: getConnectedUsers().length,
      onlineStaff: await User.countDocuments({ _id: { $in: getConnectedUsers() }, role: { $in: ["admin", "reviewer", "support", "secretary", "engineer", "marketing"] } }),
      updatedAt: now,
    },
  };
}

async function buildEngineerDashboard(userId) {
  const weekStart = daysAgo(6);
  const now = new Date();
  const dbStatsPromise = getStorageUsage();

  const [
    recentLogs,
    recentMpesaLogs,
    recentPayments,
    recentWithdrawals,
    refunds,
    configDocs,
    totalUsers,
    totalMedia,
    totalAlbums,
    recentUserLogs,
    users,
    applicationCount,
    dbStorage,
  ] = await Promise.all([
    AdminLog.find({}).sort({ createdAt: -1 }).limit(80).lean(),
    MpesaLog.find({}).sort({ createdAt: -1 }).limit(50).lean().catch(() => []),
    Payment.find({ createdAt: { $gte: weekStart } }).select("status amount createdAt paymentMethod walletTopup").lean(),
    Withdrawal.find({ createdAt: { $gte: weekStart } }).select("status amount createdAt processedAt").lean(),
    Refund.find({ createdAt: { $gte: weekStart } }).select("status createdAt refundAmount").lean(),
    SystemConfig.find({}).select("key value updatedAt").lean(),
    User.countDocuments(),
    Media.countDocuments(),
    Album.countDocuments(),
    AdminLog.find({ admin: userId }).sort({ createdAt: -1 }).limit(20).lean(),
    User.find({}).select("isBanned kycStatus createdAt").lean(),
    PhotographerApplication.countDocuments({ status: "pending" }),
    dbStatsPromise,
  ]);

  const maintenanceMode = configDocs.find((item) => item.key === "maintenance_mode")?.value === true;
  const failedPayments = recentPayments.filter((item) => item.status === "failed");
  const failedWithdrawals = recentWithdrawals.filter((item) => item.status === "failed");
  const criticalLogs = recentLogs.filter((item) => /delete|ban|reject|fail|error/i.test(item.action || ""));
  const connectedUsers = getConnectedUsers();
  const loadAvg = os.loadavg();
  const freeMem = os.freemem();
  const totalMem = os.totalmem();
  const memUsedPct = Number((((totalMem - freeMem) / totalMem) * 100).toFixed(1));
  const dbState = mongoose.connection.readyState;
  const dbStatus = dbState === 1 ? "online" : dbState === 2 ? "connecting" : "offline";
  const dbStats = dbStorage?.dbStats;
  const mediaTotals = dbStorage?.mediaTotals || { totalViews: 0, totalDownloads: 0, totalLikes: 0 };

  const securityAlerts = users.filter((user) => user.isBanned).length + failedPayments.length + failedWithdrawals.length;
  const onlineServices = [
    { name: "API", status: "online", detail: "Express server responding" },
    { name: "Database", status: dbStatus, detail: dbState === 1 ? "MongoDB connected" : "Database connection not ready" },
    { name: "Realtime", status: "online", detail: `${connectedUsers.length} connected sockets` },
    { name: "Uploads", status: "online", detail: `${totalMedia} media assets tracked` },
  ];

  return {
    overview: {
      uptimeHours: Number((process.uptime() / 3600).toFixed(1)),
      onlineServices: onlineServices.filter((item) => item.status === "online").length,
      offlineServices: onlineServices.filter((item) => item.status !== "online").length,
      activeIncidents: criticalLogs.length + failedPayments.length + failedWithdrawals.length,
      maintenanceMode,
      connectedUsers: connectedUsers.length,
    },
    systemStatus: {
      serviceUptimeHours: Number((process.uptime() / 3600).toFixed(1)),
      services: onlineServices,
      infrastructureHealth: Math.max(0, 100 - memUsedPct * 0.4 - loadAvg[0] * 5),
      activeIncidents: criticalLogs.slice(0, 10).map(mapActivity),
      availability: {
        api: 100,
        database: dbState === 1 ? 100 : 0,
        sockets: 100,
      },
    },
    logs: {
      applicationLogs: recentLogs.slice(0, 12).map(mapActivity),
      serverLogs: recentLogs.filter((item) => /config|maintenance|deploy|cache/i.test(item.action || "")).slice(0, 8).map(mapActivity),
      apiLogs: recentLogs.filter((item) => /user|wallet|album|media|payment/i.test(item.action || "")).slice(0, 8).map(mapActivity),
      authenticationLogs: recentLogs.filter((item) => /staff|role|verify|ban/i.test(item.action || "")).slice(0, 8).map(mapActivity),
      errorLogs: criticalLogs.slice(0, 8).map(mapActivity),
      mpesaLogs: recentMpesaLogs.slice(0, 8),
    },
    errors: {
      active: failedPayments.length + failedWithdrawals.length + refunds.filter((item) => item.status === "rejected").length,
      critical: criticalLogs.length,
      frequencyTrend: groupCountsByDay(
        [...failedPayments, ...failedWithdrawals, ...refunds.filter((item) => item.status === "rejected")],
        (item) => item.createdAt
      ),
      rootCauseSignals: {
        failedPayments: failedPayments.length,
        failedWithdrawals: failedWithdrawals.length,
        refundRejections: refunds.filter((item) => item.status === "rejected").length,
      },
      resolutionHistory: refunds.filter((item) => item.status === "processed").slice(0, 5),
    },
    database: {
      health: dbStatus,
      activeConnections: connectedUsers.length,
      queryPerformance: {
        recentWrites: recentLogs.length,
        slowQueryReports: 0,
      },
      storageUtilization: {
        collections: dbStats?.collections || 0,
        dataSize: dbStats?.dataSize || 0,
        storageSize: dbStats?.storageSize || 0,
        indexes: dbStats?.indexes || 0,
      },
      replicationStatus: "single-node",
    },
    backups: {
      history: [],
      successful: 0,
      failed: 0,
      restorePoints: 0,
      notes: "No dedicated backup history model exists yet in the current codebase.",
    },
    deployments: {
      history: recentLogs.filter((item) => /deploy|config|maintenance|cache/i.test(item.action || "")).slice(0, 8).map(mapActivity),
      currentReleaseVersion: process.env.RENDER_GIT_COMMIT?.slice(0, 7) || process.env.npm_package_version || "unknown",
      failed: 0,
      successful: recentLogs.filter((item) => /config|maintenance/i.test(item.action || "")).length,
      rollbackStatus: "not-tracked",
    },
    security: {
      loginAttemptsTracked: recentLogs.filter((item) => /role|verify|ban/i.test(item.action || "")).length,
      failedAuthentications: 0,
      suspiciousActivities: securityAlerts,
      vulnerabilityReports: 0,
      accessControlMonitoring: {
        bannedUsers: users.filter((user) => user.isBanned).length,
        pendingApplications: applicationCount,
      },
      alerts: criticalLogs.slice(0, 6).map(mapActivity),
    },
    performance: {
      cpuLoad1m: Number(loadAvg[0].toFixed(2)),
      memoryUsagePct: memUsedPct,
      diskUsageHint: dbStats?.storageSize || 0,
      networkTrafficHint: recentPayments.length + recentLogs.length + recentMpesaLogs.length,
      apiResponseHealthScore: Math.max(0, 100 - failedPayments.length * 5 - failedWithdrawals.length * 8),
      resourceTrend: [
        { label: "Users", value: totalUsers },
        { label: "Media", value: totalMedia },
        { label: "Albums", value: totalAlbums },
        { label: "Sockets", value: connectedUsers.length },
      ],
    },
    cdn: {
      cacheHitRate: 0,
      cacheMisses: 0,
      bandwidthUsageHint: mediaTotals.totalDownloads,
      geographicTraffic: [],
      assetDelivery: {
        mediaCount: totalMedia,
        albumCount: totalAlbums,
        totalViews: mediaTotals.totalViews,
        totalDownloads: mediaTotals.totalDownloads,
        totalLikes: mediaTotals.totalLikes,
      },
    },
    profile: {
      activityLogs: recentUserLogs.map(mapActivity),
      assignedSystems: ["API", "Database", "Realtime"],
      incidentResponseMetrics: {
        actionsLogged: recentUserLogs.length,
        criticalEventsReviewed: recentUserLogs.filter((item) => /delete|ban|reject|config/i.test(item.action || "")).length,
      },
    },
    analytics: {
      infrastructureTrends: groupCountsByDay(recentLogs, (item) => item.createdAt),
      errorTrends: groupCountsByDay([...failedPayments, ...failedWithdrawals], (item) => item.createdAt),
      systemHealthScore: Math.max(0, Number((100 - memUsedPct * 0.35 - loadAvg[0] * 4).toFixed(1))),
      performanceScore: Math.max(0, Number((100 - memUsedPct * 0.45).toFixed(1))),
      securityScore: Math.max(0, 100 - securityAlerts * 3),
      reliabilityScore: Math.max(0, 100 - (criticalLogs.length + failedPayments.length + failedWithdrawals.length) * 2),
    },
    activityFeed: recentLogs.slice(0, 14).map(mapActivity),
    live: {
      connectedUsers: connectedUsers.length,
      updatedAt: now,
    },
  };
}

async function buildMarketingDashboard(userId) {
  const weekStart = daysAgo(6);
  const monthStart = daysAgo(29);
  const now = new Date();

  const [
    broadcasts,
    payments,
    users,
    media,
    shares,
    recentUserLogs,
    referralStats,
  ] = await Promise.all([
    Notification.find({ type: { $in: ["admin", "system"] } })
      .select("title message isRead createdAt readAt")
      .sort({ createdAt: -1 })
      .limit(300)
      .lean(),
    Payment.find({ createdAt: { $gte: monthStart } })
      .select("status amount createdAt buyer photographer album media adminShare paymentMethod")
      .lean(),
    User.find({})
      .select("role createdAt location referredBy referralCode referralEarnings totalDownloads totalUploads")
      .lean(),
    Media.find({})
      .select("title views viewCount likes downloads price createdAt photographer category")
      .sort({ createdAt: -1 })
      .limit(400)
      .lean(),
    ShareToken.find({})
      .select("createdAt accessCount downloadCount sentTo isActive")
      .sort({ createdAt: -1 })
      .limit(200)
      .lean(),
    AdminLog.find({ admin: userId }).sort({ createdAt: -1 }).limit(20).lean(),
    User.find({ referredBy: { $ne: null } }).select("referredBy createdAt").lean(),
  ]);

  const completedPayments = payments.filter((item) => item.status === "completed");
  const totalRevenue = completedPayments.reduce((sum, item) => sum + safeNumber(item.amount), 0);
  const totalAdminRevenue = completedPayments.reduce((sum, item) => sum + safeNumber(item.adminShare), 0);
  const activeBroadcasts = broadcasts.filter((item) => item.createdAt >= weekStart);
  const readBroadcasts = broadcasts.filter((item) => item.isRead);
  const topContent = [...media]
    .sort((a, b) => (safeNumber(b.views ?? b.viewCount) + safeNumber(b.downloads) * 3 + safeNumber(b.likes) * 2) - (safeNumber(a.views ?? a.viewCount) + safeNumber(a.downloads) * 3 + safeNumber(a.likes) * 2))
    .slice(0, 6);

  const locationCounts = users.reduce((acc, user) => {
    const key = user.location?.trim() || "Unknown";
    acc.set(key, (acc.get(key) || 0) + 1);
    return acc;
  }, new Map());

  const userRoleBreakdown = users.reduce((acc, user) => {
    acc[user.role || "unknown"] = (acc[user.role || "unknown"] || 0) + 1;
    return acc;
  }, {});

  const referredUsersCount = referralStats.length;
  const topReferrers = await User.find({ referralCode: { $exists: true, $ne: "" } })
    .select("username referralCode referralEarnings")
    .sort({ referralEarnings: -1, createdAt: -1 })
    .limit(5)
    .lean();

  return {
    overview: {
      activeCampaigns: activeBroadcasts.length,
      totalRevenue,
      liveConversions: completedPayments.filter((item) => item.createdAt >= weekStart).length,
      referredUsers: referredUsersCount,
      totalUsers: users.length,
      totalMedia: media.length,
    },
    campaigns: {
      active: activeBroadcasts.length,
      scheduled: 0,
      completed: broadcasts.filter((item) => item.createdAt < weekStart).length,
      performance: {
        readRate: broadcasts.length ? Number(((readBroadcasts.length / broadcasts.length) * 100).toFixed(1)) : 0,
        recentBroadcasts: activeBroadcasts.slice(0, 6),
      },
      roi: totalRevenue,
      conversionTracking: completedPayments.length,
    },
    analytics: {
      websiteTrafficProxy: media.reduce((sum, item) => sum + safeNumber(item.views ?? item.viewCount), 0),
      userEngagement: media.reduce((sum, item) => sum + safeNumber(item.likes) + safeNumber(item.downloads), 0),
      sessionDuration: 0,
      bounceRate: 0,
      acquisitionChannels: {
        referrals: referredUsersCount,
        directSignups: users.length - referredUsersCount,
      },
      audience: userRoleBreakdown,
      signupsTrend: groupCountsByDay(users, (item) => item.createdAt),
    },
    pushNotifications: {
      sent: broadcasts.length,
      delivered: broadcasts.length,
      openRate: broadcasts.length ? Number(((readBroadcasts.length / broadcasts.length) * 100).toFixed(1)) : 0,
      clickThroughRate: 0,
      campaignPerformance: groupCountsByDay(broadcasts, (item) => item.createdAt),
      deviceAnalytics: [],
    },
    advertising: {
      activeAds: 0,
      adSpend: 0,
      cpc: 0,
      cpm: 0,
      ctr: 0,
      conversionRate: 0,
      roas: 0,
      notes: "No ad-spend model exists yet in the current backend.",
    },
    referrals: {
      sources: referredUsersCount,
      topReferrers,
      conversions: referredUsersCount,
      revenue: topReferrers.reduce((sum, item) => sum + safeNumber(item.referralEarnings), 0),
      leaderboard: topReferrers,
      trend: groupCountsByDay(referralStats, (item) => item.createdAt),
    },
    revenue: {
      daily: groupSumByDay(completedPayments, (item) => item.createdAt, (item) => item.amount),
      weekly: totalRevenue,
      monthly: totalRevenue,
      growth: completedPayments.filter((item) => item.createdAt >= weekStart).reduce((sum, item) => sum + safeNumber(item.amount), 0),
      lifetimeValueProxy: users.length ? Number((totalRevenue / users.length).toFixed(2)) : 0,
      forecast: Math.round((totalRevenue / 30) * 35),
      adminRevenue: totalAdminRevenue,
    },
    customerInsights: {
      demographics: userRoleBreakdown,
      geographicDistribution: Array.from(locationCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([location, count]) => ({ location, count })),
      retentionProxy: completedPayments.filter((item) => item.createdAt >= weekStart).length,
      churnProxy: 0,
      cohortTrend: groupCountsByDay(users, (item) => item.createdAt),
    },
    trends: {
      growth: groupCountsByDay(users, (item) => item.createdAt),
      revenue: groupSumByDay(completedPayments, (item) => item.createdAt, (item) => item.amount),
      product: groupCountsByDay(media, (item) => item.createdAt),
      opportunities: [
        { label: "Unread broadcasts", value: broadcasts.length - readBroadcasts.length },
        { label: "Recent referrals", value: referralStats.filter((item) => item.createdAt >= weekStart).length },
        { label: "Top content shares", value: shares.reduce((sum, item) => sum + safeNumber(item.accessCount), 0) },
      ],
    },
    contentPerformance: {
      topContent: topContent.map((item) => ({
        id: String(item._id),
        title: item.title,
        views: safeNumber(item.views ?? item.viewCount),
        likes: safeNumber(item.likes),
        downloads: safeNumber(item.downloads),
        engagement: safeNumber(item.likes) + safeNumber(item.downloads),
        roi: safeNumber(item.price) * safeNumber(item.downloads),
        category: item.category || "general",
      })),
    },
    profile: {
      campaignOwnership: activeBroadcasts.length,
      teamContributions: recentUserLogs.length,
      activityHistory: recentUserLogs.map(mapActivity),
      goalsAndKpis: {
        weeklyRevenue: completedPayments.filter((item) => item.createdAt >= weekStart).reduce((sum, item) => sum + safeNumber(item.amount), 0),
        weeklyReferrals: referralStats.filter((item) => item.createdAt >= weekStart).length,
      },
    },
    marketingAnalytics: {
      realtimeTrafficProxy: media.reduce((sum, item) => sum + safeNumber(item.views ?? item.viewCount), 0),
      liveConversions: completedPayments.filter((item) => item.createdAt >= weekStart).length,
      revenueAttribution: totalAdminRevenue,
      funnel: {
        signups: users.length,
        referred: referredUsersCount,
        paid: completedPayments.length,
      },
      journeyMapping: [
        { stage: "Signup", count: users.length },
        { stage: "Referral", count: referredUsersCount },
        { stage: "Purchase", count: completedPayments.length },
      ],
      aiInsights: [
        totalRevenue > 0
          ? "Revenue-generating activity is present; consider doubling down on the highest-engagement content categories."
          : "No completed revenue yet in the sampled period; focus on activation and conversion campaigns.",
        referredUsersCount > 0
          ? "Referral traffic exists in the current dataset; a stronger referral campaign could compound growth."
          : "Referral activity is currently quiet; this is a clear opportunity area.",
      ],
    },
    activityFeed: activeBroadcasts.slice(0, 12),
    live: {
      connectedUsers: getConnectedUsers().length,
      updatedAt: now,
    },
  };
}

export async function getSecretaryDashboard(req, res) {
  try {
    const userId = req.user?.userId || req.user?.id || req.user?._id;
    const data = await buildSecretaryDashboard(userId);
    res.json({ success: true, role: "secretary", data, generatedAt: new Date().toISOString() });
  } catch (error) {
    console.error("[getSecretaryDashboard] Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

export async function getEngineerDashboard(req, res) {
  try {
    const userId = req.user?.userId || req.user?.id || req.user?._id;
    const data = await buildEngineerDashboard(userId);
    res.json({ success: true, role: "engineer", data, generatedAt: new Date().toISOString() });
  } catch (error) {
    console.error("[getEngineerDashboard] Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

export async function getMarketingDashboard(req, res) {
  try {
    const userId = req.user?.userId || req.user?.id || req.user?._id;
    const data = await buildMarketingDashboard(userId);
    res.json({ success: true, role: "marketing", data, generatedAt: new Date().toISOString() });
  } catch (error) {
    console.error("[getMarketingDashboard] Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}
