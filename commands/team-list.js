import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getTeamMembers } from "../services/notion.js";

export default {
  data: new SlashCommandBuilder()
    .setName("team-list")
    .setDescription("View current team members (Availability and Timezones)"),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const members = await getTeamMembers(); // uses cache, 0ms!

      if (members.length === 0) {
        return interaction.editReply({ content: "🗂️ **No team members found in Notion.**" });
      }

      const listText = members
        .map(m => `👤 **${m.name}**\n   🚦 **Availability:** \`${m.availability}\` | 🌐 **TZ:** \`${m.timezone}\``)
        .join("\n\n");

      const embed = new EmbedBuilder()
        .setTitle(`👥 Team Status Board`)
        .setDescription(listText)
        .setColor("#5865F2")
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error("Error running team-list:", err);
      await interaction.editReply({ content: `❌ **Failed to fetch team list.**\n*Error: ${err.message}*` });
    }
  }
};
