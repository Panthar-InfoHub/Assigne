import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getProjects, getProjectTasks } from "../services/project.service.js";

export default {
  data: new SlashCommandBuilder()
    .setName("project-tasks")
    .setDescription("View active tasks inside a project")
    .addStringOption(option =>
      option.setName("project")
        .setDescription("The project name or partial name")
        .setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply();
    const projectNameInput = interaction.options.getString("project");

    try {
      const search = await getProjects(""); // utilizes local cache, 0ms!
      const matches = search.filter(p => p.name.toLowerCase().includes(projectNameInput.toLowerCase()));

      let projectId = null;
      let projectName = "Project";

      if (matches.length > 1) {
        const titles = matches.map(p => `**${p.name}**`).join(", ");
        return interaction.editReply({
          content: `⚠️ **Ambiguous Project choice.** Your typing fit multiple projects: ${titles}.\nPlease be more specific!`
        });
      } else if (matches.length === 1) {
        projectId = matches[0].id;
        projectName = matches[0].name;
      } else {
        return interaction.editReply({
          content: `❌ **No projects found matching \`${projectNameInput}\`.**`
        });
      }

      const tasks = await getProjectTasks(projectId);

      if (tasks.length === 0) {
        return interaction.editReply({
          content: `🗂️ **No tasks found for \`${projectName}\`** in the workspace.`
        });
      }

      let taskListText = tasks
        .map(t => `- [${t.status}] **${t.name}**`)
        .join("\n");

      // Discord limit check (Max string length 4096 in descriptions)
      if (taskListText.length > 4000) {
        taskListText = taskListText.slice(0, 4000) + "\n... *List truncated due to size limit*";
      }

      const embed = new EmbedBuilder()
        .setTitle(`📁 Tasks inside: ${projectName}`)
        .setDescription(taskListText)
        .setColor("#5865F2")
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error("Error running project-tasks:", err);
      await interaction.editReply({ content: `❌ **Failed to fetch task lists.**\n*Error: ${err.message}*` });
    }
  }
};
