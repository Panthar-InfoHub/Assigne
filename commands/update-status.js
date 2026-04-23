import { SlashCommandBuilder } from "discord.js";
import { getTasks, updateTaskStatus } from "../services/task.service.js";

export default {
  data: new SlashCommandBuilder()
    .setName("update-status")
    .setDescription("Update the Status of a task")
    .addStringOption(option =>
      option.setName("task")
        .setDescription("The task name or partial name")
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName("status")
        .setDescription("Select the new status")
        .setRequired(true)
        .addChoices(
          { name: "Not started", value: "Not started" },
          { name: "In progress", value: "In progress" },
          { name: "On hold", value: "On hold" },
          { name: "Done", value: "Done" },
          { name: "Cancelled", value: "Cancelled" }
        )
    ),

  async execute(interaction) {
    // await interaction.deferReply();
    const taskInput = interaction.options.getString("task");
    const newStatus = interaction.options.getString("status");

    try {
      const search = await getTasks(taskInput);

      if (search.length > 1) {
        const list = search.map(t => `**${t.name}** (\`${t.status}\`)`).join(", ");
        return interaction.editReply({
          content: `⚠️ **Multiple tasks found matching \`${taskInput}\`:** ${list}.\nPlease use a more specific task name!`
        });
      } else if (search.length === 0) {
        return interaction.editReply({
          content: `❌ **No tasks found matching \`${taskInput}\`** inside your recent items.`
        });
      }

      const task = search[0];

      await updateTaskStatus(task.id, newStatus);

      await interaction.editReply({
        content: `✅ Status updated successfully!\n📝 **Task:** ${task.name}\n🚦 **New Status:** \`${newStatus}\``
      });

    } catch (err) {
      console.error("Error updating status:", err);
      await interaction.editReply({ content: `❌ **Failed to update status.**\n*Error: ${err.message}*` });
    }
  }
};
