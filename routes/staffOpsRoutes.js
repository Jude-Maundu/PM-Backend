import express from "express";
import mongoose from "mongoose";
import { authenticate } from "../middlewares/auth.js";
import { requireStaff } from "../middlewares/staff.js";
import SupportTicket from "../models/SupportTicket.js";
import StaffTask from "../models/StaffTask.js";
import EngineerIncident from "../models/EngineerIncident.js";
import BackupRun from "../models/BackupRun.js";
import DeploymentRecord from "../models/DeploymentRecord.js";
import MarketingCampaign from "../models/MarketingCampaign.js";
import MarketingAd from "../models/MarketingAd.js";
import ContentCalendarEntry from "../models/ContentCalendarEntry.js";

const router = express.Router();

const ADMIN_ROLE = "admin";
const RESOURCES = {
  "secretary/tickets": {
    model: SupportTicket,
    roles: ["secretary"],
    populate: ["assignedTo", "username email role", "createdBy", "username email", "updatedBy", "username email"],
    defaultSort: { createdAt: -1 },
  },
  "secretary/tasks": {
    model: StaffTask,
    roles: ["secretary"],
    populate: ["assignedTo", "username email role", "createdBy", "username email", "updatedBy", "username email"],
    defaultSort: { createdAt: -1 },
  },
  "engineer/incidents": {
    model: EngineerIncident,
    roles: ["engineer"],
    populate: ["owner", "username email role", "createdBy", "username email", "updatedBy", "username email"],
    defaultSort: { createdAt: -1 },
  },
  "engineer/backups": {
    model: BackupRun,
    roles: ["engineer"],
    populate: ["createdBy", "username email", "updatedBy", "username email"],
    defaultSort: { createdAt: -1 },
  },
  "engineer/deployments": {
    model: DeploymentRecord,
    roles: ["engineer"],
    populate: ["createdBy", "username email", "updatedBy", "username email"],
    defaultSort: { createdAt: -1 },
  },
  "marketing/campaigns": {
    model: MarketingCampaign,
    roles: ["marketing"],
    populate: ["createdBy", "username email", "updatedBy", "username email"],
    defaultSort: { createdAt: -1 },
  },
  "marketing/ads": {
    model: MarketingAd,
    roles: ["marketing"],
    populate: ["createdBy", "username email", "updatedBy", "username email"],
    defaultSort: { createdAt: -1 },
  },
  "marketing/content-calendar": {
    model: ContentCalendarEntry,
    roles: ["marketing"],
    populate: ["owner", "username email role", "createdBy", "username email", "updatedBy", "username email"],
    defaultSort: { createdAt: -1 },
  },
};

router.use(authenticate, requireStaff);

function getActor(req) {
  return req.user?.userId || req.user?.id || req.user?._id;
}

function ensureAccess(req, res, next) {
  const resourceKey = `${req.params.group}/${req.params.resource}`;
  const config = RESOURCES[resourceKey];
  if (!config) return res.status(404).json({ message: "Resource not found" });

  const role = req.user?.role;
  if (role !== ADMIN_ROLE && !config.roles.includes(role)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  req.resourceConfig = config;
  req.resourceKey = resourceKey;
  next();
}

function buildSearchQuery(search) {
  if (!search || !search.trim()) return {};
  return { $text: { $search: search.trim() } };
}

function parsePopulate(query, populateConfig) {
  let nextQuery = query;
  for (let i = 0; i < populateConfig.length; i += 2) {
    nextQuery = nextQuery.populate(populateConfig[i], populateConfig[i + 1]);
  }
  return nextQuery;
}

router.get("/:group/:resource", ensureAccess, async (req, res) => {
  try {
    const { model, populate, defaultSort } = req.resourceConfig;
    const { search = "", status, limit = 100 } = req.query;
    const query = buildSearchQuery(search);
    if (status) query.status = status;

    let dbQuery = model.find(query).sort(defaultSort).limit(Number(limit));
    if (populate?.length) {
      dbQuery = parsePopulate(dbQuery, populate);
    }
    const items = await dbQuery.lean();
    res.json({ success: true, data: items });
  } catch (error) {
    console.error(`[staffOps:list] ${req.resourceKey}`, error);
    res.status(500).json({ message: error.message });
  }
});

router.post("/:group/:resource", ensureAccess, async (req, res) => {
  try {
    const { model } = req.resourceConfig;
    const actorId = getActor(req);
    const doc = await model.create({
      ...req.body,
      createdBy: actorId,
      updatedBy: actorId,
    });
    res.status(201).json({ success: true, data: doc });
  } catch (error) {
    console.error(`[staffOps:create] ${req.resourceKey}`, error);
    res.status(500).json({ message: error.message });
  }
});

router.patch("/:group/:resource/:id", ensureAccess, async (req, res) => {
  try {
    const { model } = req.resourceConfig;
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid record id" });
    }

    const updated = await model.findByIdAndUpdate(
      id,
      { ...req.body, updatedBy: getActor(req) },
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ message: "Record not found" });
    res.json({ success: true, data: updated });
  } catch (error) {
    console.error(`[staffOps:update] ${req.resourceKey}`, error);
    res.status(500).json({ message: error.message });
  }
});

router.delete("/:group/:resource/:id", ensureAccess, async (req, res) => {
  try {
    const { model } = req.resourceConfig;
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid record id" });
    }

    const deleted = await model.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ message: "Record not found" });
    res.json({ success: true, message: "Record deleted" });
  } catch (error) {
    console.error(`[staffOps:delete] ${req.resourceKey}`, error);
    res.status(500).json({ message: error.message });
  }
});

export default router;
