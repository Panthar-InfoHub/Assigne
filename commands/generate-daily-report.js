import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { sendNightlyReport } from "../services/report.service.js";

export default {
    data: new SlashCommandBuilder()
        .setName("generate-daily-report")
        .setDescription("Manually trigger the daily standup report (admin/test use)"),

    async execute(interaction) {
        await interaction.deferReply({ flags: 64 }); // Ephemeral flag (MessageFlags.Ephemeral = 64)

        try {
            const result = await sendNightlyReport(interaction.client);

            if (!result.success) {
                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xed4245)
                            .setTitle("Report Failed")
                            .setDescription(`\`\`\`${result.reason}\`\`\``)
                            .setTimestamp(),
                    ],
                });
            }

            await interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0x57f287)
                        .setTitle("Report Sent")
                        .setDescription(
                            result.memberCount === 0
                                ? "No updates were found — an empty report was posted."
                                : `Report dispatched successfully.\n\n` +
                                  `**${result.memberCount}** member${result.memberCount !== 1 ? "s" : ""} · ` +
                                  `**${result.updateCount}** update${result.updateCount !== 1 ? "s" : ""}\n\n` +
                                  `MongoDB records have been cleaned up.`
                        )
                        .setTimestamp()
                        .setFooter({ text: "Assigne · Daily Standup" }),
                ],
            });
        } catch (err) {
            console.error("Error in /generate-daily-report:", err);
            await interaction.editReply({
                content: `Unexpected error: ${err.message}`,
            });
        }
    },
};
