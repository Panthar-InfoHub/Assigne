import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getTeamMembers, getTasksAssignedTo } from "../services/notion.js";

export default {
  data: new SlashCommandBuilder()
    .setName("my-tasks")
    .setDescription("View tasks currently assigned to you"),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const members = await getTeamMembers(); // uses cache, 0ms!
      const userMatch = members.find(m => m.discordId === interaction.user.id);

      if (!userMatch) {
        return interaction.editReply({
          content: `❌ **Your Discord Account is not linked to any Team Member in Notion.**\nPlease ensure your Discord ID is pasted into the "Discord ID" column in the Team Members table!`
        });
      }

      const tasks = await getTasksAssignedTo(userMatch.id);

      if (tasks.length === 0) {
        return interaction.editReply({
          content: `🗂️ **You have no open tasks assigned in Notion, ${userMatch.name}!** 🎉`
        });
      }

      const taskListText = tasks
        .map(t => `- [${t.status}] **${t.name}**`)
        .join("\n");

      const embed = new EmbedBuilder()
        .setTitle(`🛠️ Your Tasks: ${userMatch.name}`)
        .setDescription(taskListText)
        .setColor("#5865F2")
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error("Error running my-tasks:", err);
      await interaction.editReply({ content: `❌ **Failed to fetch your tasks.**\n*Error: ${err.message}*` });
    }
  }
};
