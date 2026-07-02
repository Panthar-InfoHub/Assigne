import { EmbedBuilder } from "discord.js";
import { getDailyUpdates, getTodayKeyIST, clearDailyUpdates } from "./dailyUpdate.service.js";

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

        // ── Empty day ──────────────────────────────────────────────────────────
        if (updates.length === 0) {
            await channel.send({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0x2b2d31)
                        .setTitle("📋  Daily Standup  ·  No Updates")
                        .setDescription(
                            `*No standup updates were submitted on **${dateKey}**.*\n` +
                            `Remind the team to run \`/standup\` throughout the day!`
                        )
                        .setTimestamp()
                        .setFooter({ text: "Assigne · Daily Standup" }),
                ],
            });
            return { success: true, memberCount: 0, updateCount: 0 };
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

        const memberEmbeds = userList.map((user, idx) => {
            // Join multiple submissions with a blank line, paste raw
            const body = user.messages.join("\n\n");
            const safe = body.length > 4000 ? body.slice(0, 3997) + "..." : body;

            return new EmbedBuilder()
                .setColor(palette[idx % palette.length])
                .setAuthor({ name: user.displayName })
                .setDescription(safe);
        });

        // ── Single message (Discord allows up to 10 embeds per message) ───────
        const allEmbeds = [headerEmbed, ...memberEmbeds];
        const LIMIT = 10;
        for (let i = 0; i < allEmbeds.length; i += LIMIT) {
            await channel.send({ embeds: allEmbeds.slice(i, i + LIMIT) });
        }

        // ── Cleanup MongoDB ────────────────────────────────────────────────────
        const deleted = await clearDailyUpdates(dateKey);
        console.log(
            `[daily-report] Report sent for ${dateKey}: ` +
            `${memberCount} members, ${updateCount} updates, ${deleted} records cleaned.`
        );

        return { success: true, memberCount, updateCount };

    } catch (err) {
        console.error("[daily-report] Failed to send report:", err);
        return { success: false, reason: err.message };
    }
}
