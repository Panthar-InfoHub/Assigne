import {
    SlashCommandBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    EmbedBuilder,
    MessageFlags,
} from "discord.js";
import { saveDailyUpdate, getDailyUpdates, getTodayKeyIST } from "../services/dailyUpdate.service.js";

export const STANDUP_MODAL_ID  = "standup_modal";
export const STANDUP_INPUT_ID  = "standup_input";

export default {
    data: new SlashCommandBuilder()
        .setName("submit-daily-report")
        .setDescription("Submit your daily standup update"),

    // ── Step 1: Show the modal popup ─────────────────────────────────────────
    async execute(interaction) {
        const modal = new ModalBuilder()
            .setCustomId(STANDUP_MODAL_ID)
            .setTitle("Daily Standup");

        const input = new TextInputBuilder()
            .setCustomId(STANDUP_INPUT_ID)
            .setLabel("What did you work on today?")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(4000);

        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await interaction.showModal(modal);
    },

    // ── Step 2: Handle modal submission ──────────────────────────────────────
    async handleModal(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const content          = interaction.fields.getTextInputValue(STANDUP_INPUT_ID);
            const { user, member } = interaction;
            const displayName      = member?.displayName || user.globalName || user.username;

            await saveDailyUpdate({ discordId: user.id, username: user.username, displayName, content });

            const todayUpdates = await getDailyUpdates();
            const myCount      = todayUpdates.filter((u) => u.discordId === user.id).length;

            const embed = new EmbedBuilder()
                .setColor(0x23272a)
                .setTitle("Standup saved")
                .setDescription(content.length > 1800 ? content.slice(0, 1797) + "..." : content)
                .setFooter({ text: `${getTodayKeyIST()} · update ${myCount} today` });

            await interaction.editReply({ embeds: [embed] });

        } catch (err) {
            console.error("[standup] Modal submit error:", err);
            await interaction.editReply({
                content: `Failed to save your update: ${err.message}`,
            });
        }
    },
};
