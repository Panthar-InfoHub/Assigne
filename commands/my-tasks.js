import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getTeamMembers } from "../services/team.service.js";
import { getTasksAssignedTo } from "../services/task.service.js";

export default {
  data: new SlashCommandBuilder()
    .setName("my-tasks")
    .setDescription("View tasks currently assigned to you"),

  async execute(interaction) {
    // await interaction.deferReply();

    try {
      const members = await getTeamMembers(); // uses cache, 0ms!
      const userMatch = members.find(m => m.discordId === interaction.user.id);

      if (!userMatch) {
        return interaction.editReply({
          content: `Your Discord account is not linked to a team member profile yet.\nPlease save your Discord ID in your team member record.`
        });
      }

      const tasks = await getTasksAssignedTo(userMatch.id);

      if (tasks.length === 0) {
        return interaction.editReply({
          content: `No open tasks are currently assigned to ${userMatch.name}.`
        });
      }

      const taskListText = tasks
        .map((t) => `• ${t.name}  |  ${t.status}`)
        .join("\n");

      const embed = new EmbedBuilder()
        .setTitle(`My Tasks · ${userMatch.name}`)
        .setDescription(taskListText)
        .setColor("#3209ad")
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error("Error running my-tasks:", err);
      await interaction.editReply({ content: `Failed to fetch your tasks.\nError: ${err.message}` });
    }
  }
};
