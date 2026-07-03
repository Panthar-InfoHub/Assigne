import { EmbedBuilder } from "discord.js";
import { getDailyUpdates, getTodayKeyIST, clearOldDailyUpdates } from "./dailyUpdate.service.js";

/**
 * Builds and sends the daily standup report to DAILY_REPORT_CHANNEL_ID.
 * Cleans up MongoDB records after a successful post.
 *
 * @param {import("discord.js").Client} client
 * @returns {{ success: boolean, memberCount?: number, updateCount?: number, reason?: string }}
 */
export async function sendNightlyReport(client, targetDateKey = null) {
    const reportChannelId = process.env.DAILY_REPORT_CHANNEL_ID;
    if (!reportChannelId) {
        console.warn("[daily-report] DAILY_REPORT_CHANNEL_ID not set in .env — skipping.");
        return { success: false, reason: "DAILY_REPORT_CHANNEL_ID not configured." };
    }

    const dateKey = targetDateKey || getTodayKeyIST();

    try {
        const updates = await getDailyUpdates(dateKey);
        const channel = await client.channels.fetch(reportChannelId);

        // ── Empty day (Sundays, holidays) — skip silently ───────────────────────
        if (updates.length === 0) {
            console.log(`[daily-report] No updates for ${dateKey} — skipping.`);
            await clearOldDailyUpdates();
            return { success: true, memberCount: 0, updateCount: 0, skipped: true };
        }

        // ── Group by user ──────────────────────────────────────────────────────
        const byUser = new Map();
        for (const u of updates) {
            if (!byUser.has(u.discordId)) {
                byUser.set(u.discordId, {
                    displayName: u.displayName || u.username,
                    discordId:   u.discordId,
                    messages:    [],
                });
            }
            byUser.get(u.discordId).messages.push(u.content);
        }

        const memberCount = byUser.size;
        const updateCount = updates.length;
        const userList    = [...byUser.values()];

        // ── Minimal header embed ───────────────────────────────────────────────
        const headerEmbed = new EmbedBuilder()
            .setColor(0x23272a)
            .setTitle("📋  Daily Standup — " + dateKey)
            .setDescription(
                `**${memberCount}** member${memberCount !== 1 ? "s" : ""} · **${updateCount}** update${updateCount !== 1 ? "s" : ""}`
            )
            .setTimestamp()
            .setFooter({ text: "Assigne · Daily Standup" });

        // ── One embed per member — raw text, no numbering ──────────────────────
        const palette = [
            0x5865f2, 0x57f287, 0xfee75c, 0xeb459e,
            0xed4245, 0x00b0f4, 0xf47fff, 0x43b581,
        ];

        const MAX_MEMBER_EMBEDS = 9; // 1 header + 9 members = 10 embeds max

        // If more than 9 members, first 8 get their own embeds, rest merge into the 9th
        const soloUsers = userList.slice(0, Math.min(userList.length, MAX_MEMBER_EMBEDS));
        const overflowUsers = userList.slice(MAX_MEMBER_EMBEDS);

        const memberEmbeds = soloUsers.map((user, idx) => {
            const body = user.messages.join("\n\n");
            const safe = body.length > 4000 ? body.slice(0, 3997) + "..." : body;

            return new EmbedBuilder()
                .setColor(palette[idx % palette.length])
                .setAuthor({ name: user.displayName })
                .setDescription(safe);
        });

        // Merge overflow users into the last embed
        if (overflowUsers.length > 0 && memberEmbeds.length > 0) {
            const lastEmbed = memberEmbeds[memberEmbeds.length - 1];
            let combined = lastEmbed.data.description || "";
            for (const user of overflowUsers) {
                const body = user.messages.join("\n\n");
                combined += `\n\n──────────────────\n**${user.displayName}**\n${body}`;
            }
            const safe = combined.length > 4000 ? combined.slice(0, 3997) + "..." : combined;
            lastEmbed.setDescription(safe);
        }

        // ── Single message (capped at 10 embeds) ─────────────────────────────
        const allEmbeds = [headerEmbed, ...memberEmbeds];
        await channel.send({ embeds: allEmbeds });

        // ── Cleanup old updates (>7 days) — keep recent data as safety buffer ──
        await clearOldDailyUpdates();
        console.log(
            `[daily-report] Report sent for ${dateKey}: ` +
            `${memberCount} members, ${updateCount} updates.`
        );

        return { success: true, memberCount, updateCount };

    } catch (err) {
        console.error("[daily-report] Failed to send report:", err);
        return { success: false, reason: err.message };
    }
}
