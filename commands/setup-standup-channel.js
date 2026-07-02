import {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionFlagsBits,
} from "discord.js";

// This customId is what bot.js listens for to open the modal
export const STANDUP_BUTTON_ID = "standup_open_modal_btn";

export default {
    data: new SlashCommandBuilder()
        .setName("setup-standup-channel")
        .setDescription("Post the Daily Standup prompt in this channel")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const button = new ButtonBuilder()
            .setCustomId(STANDUP_BUTTON_ID)
            .setLabel("Submit Daily Update")
            .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder().addComponents(button);

        await interaction.channel.send({
            content: "**Daily Updates**\nSubmit your daily work update using the button below.\n\n" +
                "- You can submit multiple updates throughout the day, either one at a time or all at once.\n" +
                "- A compiled daily report is generated automatically at the end of each day in <#1522209022411804702>.\n" +
                "- Updates not submitted on the same day will not be included in the report.\n" +
                "- You cannot add updates for a previous day retroactively.",
            components: [row],
        });

        await interaction.reply({ content: "Done. Pin the message above.", ephemeral: true });
    },
};
