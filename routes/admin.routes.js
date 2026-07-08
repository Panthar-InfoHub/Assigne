import { Router } from "express";
import { EmbedBuilder } from "discord.js";
import { sendNightlyReport } from "../services/report.service.js";
import { getTodayKeyIST } from "../services/dailyUpdate.service.js";

const router = Router();

/**
 * Shared auth check — all admin routes use the same Bearer key.
 */
function requireAuth(req, res) {
    const authHeader = req.headers["authorization"];
    const secretKey = process.env.REPORT_TRIGGER_KEY;

    if (!secretKey) {
        res.status(500).json({ error: "REPORT_TRIGGER_KEY is not set." });
        return false;
    }
    if (authHeader !== `Bearer ${secretKey}`) {
        res.status(401).json({ error: "Unauthorized" });
        return false;
    }
    return true;
}

// ─── Trigger Report (Cloud Scheduler) ─────────────────────────────────────
// Posts the nightly report for today's date.

router.post("/trigger-report", async (req, res) => {
    if (!requireAuth(req, res)) return;

    const client = req.app.get("discordClient");

    console.log("[trigger-report] HTTP trigger received from Cloud Scheduler.");
    try {
        const result = await sendNightlyReport(client);
        return res.status(200).json(result);
    } catch (err) {
        console.error("[trigger-report] Failed to generate report:", err);
        return res.status(500).json({ error: err.message });
    }
});

// ─── Generate Report for a Specific Date ──────────────────────────────────
// Manually generate a report for a past date (within 7 days).
// Body: { "dateKey": "2026-07-01" }

router.post("/generate-report", async (req, res) => {
    if (!requireAuth(req, res)) return;

    const client = req.app.get("discordClient");
    const { dateKey } = req.body;

    if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
        return res.status(400).json({ error: "dateKey is required in YYYY-MM-DD format." });
    }

    // Validate the date is within the past 7 days
    const todayKey = getTodayKeyIST();
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const sevenDaysAgo = new Date(now.getTime() + istOffset - 7 * 24 * 60 * 60 * 1000);
    const cutoffKey = sevenDaysAgo.toISOString().split("T")[0];

    if (dateKey > todayKey) {
        return res.status(400).json({ error: "Cannot generate report for a future date." });
    }
    if (dateKey < cutoffKey) {
        return res.status(400).json({
            error: `Date is older than 7 days. Only dates from ${cutoffKey} to ${todayKey} are available.`,
        });
    }

    console.log(`[generate-report] Manually generating report for ${dateKey}`);
    try {
        const result = await sendNightlyReport(client, dateKey);
        return res.status(200).json(result);
    } catch (err) {
        console.error("[generate-report] Failed:", err);
        return res.status(500).json({ error: err.message });
    }
});

// ─── Edit Past Update (Silent Message Edit) ──────────────────────────────
// Silently edit an already-posted report message to append/update a user's entry.
// Body: { "messageId": "...", "displayName": "...", "content": "...", "channelId"?: "..." }

router.post("/edit-past-update", async (req, res) => {
    if (!requireAuth(req, res)) return;

    const client = req.app.get("discordClient");
    const { messageId, displayName, content, channelId } = req.body;

    if (!messageId || !displayName || !content) {
        return res.status(400).json({
            error: "Missing required fields: messageId, displayName, content",
        });
    }

    const targetChannelId = channelId || process.env.DAILY_REPORT_CHANNEL_ID;
    if (!targetChannelId) {
        return res.status(500).json({ error: "No channelId provided and DAILY_REPORT_CHANNEL_ID not set." });
    }

    console.log(`[edit-past-update] Backfilling update for "${displayName}" on message ${messageId}`);

    try {
        const channel = await client.channels.fetch(targetChannelId);
        const message = await channel.messages.fetch({ message: messageId, force: true });

        if (!message) {
            return res.status(404).json({ error: `Message ${messageId} not found in channel.` });
        }

        // ── Reconstruct embeds (Discord returns raw data, we need EmbedBuilder) ─
        const existingEmbeds = message.embeds.map((e) => EmbedBuilder.from(e.toJSON()));

        // ── Color palette (same as report.service.js) ───────────────────────────
        const palette = [
            0x5865f2, 0x57f287, 0xfee75c, 0xeb459e,
            0xed4245, 0x00b0f4, 0xf47fff, 0x43b581,
        ];

        const EMBED_LIMIT = 10;

        // ── Find existing embed for this displayName (match by author name) ─────
        const userEmbedIndex = existingEmbeds.findIndex(
            (e) => e.data.author?.name?.toLowerCase() === displayName.toLowerCase()
        );

        if (userEmbedIndex !== -1) {
            // Append to existing embed's description
            const existing = existingEmbeds[userEmbedIndex];
            const oldDesc = existing.data.description || "";
            const newDesc = oldDesc + "\n\n" + content.trim();
            const safe = newDesc.length > 4000 ? newDesc.slice(0, 3997) + "..." : newDesc;
            existing.setDescription(safe);
        } else if (existingEmbeds.length < EMBED_LIMIT) {
            // Room for a new embed — add it
            const colorIndex = existingEmbeds.length - 1;
            const newEmbed = new EmbedBuilder()
                .setColor(palette[colorIndex % palette.length])
                .setAuthor({ name: displayName })
                .setDescription(content.trim().length > 4000 ? content.trim().slice(0, 3997) + "..." : content.trim());

            existingEmbeds.push(newEmbed);
        } else {
            // Already at 10 embeds — merge into the last embed
            const lastEmbed = existingEmbeds[EMBED_LIMIT - 1];
            const oldDesc = lastEmbed.data.description || "";
            const separator = `\n\n──────────────────\n**${displayName}**\n`;
            const newDesc = oldDesc + separator + content.trim();
            const safe = newDesc.length > 4000 ? newDesc.slice(0, 3997) + "..." : newDesc;
            lastEmbed.setDescription(safe);
        }

        // ── Update header embed stats (first embed = header) ────────────────────
        const headerEmbed = existingEmbeds[0];
        if (headerEmbed?.data?.title?.includes("Daily Standup")) {
            const memberCount = existingEmbeds.length - 1;
            let totalUpdates = 0;
            for (let i = 1; i < existingEmbeds.length; i++) {
                const desc = existingEmbeds[i].data.description || "";
                totalUpdates += (desc.split("\n\n").length);
            }
            headerEmbed.setDescription(
                `**${memberCount}** member${memberCount !== 1 ? "s" : ""} · **${totalUpdates}** update${totalUpdates !== 1 ? "s" : ""}`
            );
        }

        // ── Silent edit — no notification, no ping ──────────────────────────────
        await message.edit({ embeds: existingEmbeds });

        console.log(`[edit-past-update] Successfully updated message ${messageId}`);
        return res.status(200).json({
            success: true,
            messageId,
            displayName,
            embedCount: existingEmbeds.length,
        });

    } catch (err) {
        console.error("[edit-past-update] Error:", err);
        return res.status(500).json({ error: err.message });
    }
});

export default router;
