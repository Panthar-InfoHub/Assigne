import { connectMongo } from "./mongo.js";
import { DailyUpdate } from "../models/dailyUpdate.model.js";
import crypto from "crypto";

/**
 * Returns "YYYY-MM-DD" for today in IST (UTC+5:30).
 */
export function getTodayKeyIST() {
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const ist = new Date(now.getTime() + istOffset);
    return ist.toISOString().split("T")[0];
}

/**
 * Saves a standup update submitted via the /standup command.
 */
export async function saveDailyUpdate({ discordId, username, displayName, content }) {
    await connectMongo();
    if (!content?.trim()) return;

    const dateKey = getTodayKeyIST();
    const messageId = crypto.randomUUID();

    await DailyUpdate.create({
        discordId,
        username,
        displayName,
        content: content.trim(),
        dateKey,
        messageId,
    });
}

/**
 * Returns all updates for a given dateKey (default: today IST).
 */
export async function getDailyUpdates(dateKey = null) {
    await connectMongo();
    const key = dateKey || getTodayKeyIST();
    return DailyUpdate.find({ dateKey: key }).sort({ createdAt: 1 }).lean();
}

/**
 * Deletes all updates older than 7 days (by dateKey).
 * Keeps the past week's data intact as a safety buffer.
 */
export async function clearOldDailyUpdates() {
    await connectMongo();
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const cutoff = new Date(now.getTime() + istOffset - 7 * 24 * 60 * 60 * 1000);
    const cutoffKey = cutoff.toISOString().split("T")[0];
    const result = await DailyUpdate.deleteMany({ dateKey: { $lt: cutoffKey } });
    if (result.deletedCount > 0) {
        console.log(`[daily-updates] Cleaned ${result.deletedCount} records older than ${cutoffKey}`);
    }
    return result.deletedCount;
}
