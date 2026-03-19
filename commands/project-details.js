import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getProjects, getProjectDetails } from "../services/notion.js";

export default {
  data: new SlashCommandBuilder()
    .setName("project-details")
    .setDescription("View details about a project (Timeline, Budget, Status, Manager)")
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

      if (matches.length > 1) {
        const titles = matches.map(p => `**${p.name}**`).join(", ");
        return interaction.editReply({
          content: `⚠️ **Ambiguous Project choice.** Your typing fit multiple projects: ${titles}.\nPlease be more specific!`
        });
      } else if (matches.length === 0) {
        return interaction.editReply({
          content: `❌ **No projects found matching \`${projectNameInput}\`.**`
        });
      }

      const projectId = matches[0].id;
      const project = await getProjectDetails(projectId);

      let timelineText = "No Timeline";
      if (project.timeline) {
         const start = project.timeline.start ? new Date(project.timeline.start).toLocaleDateString() : "No Start";
         const end = project.timeline.end ? new Date(project.timeline.end).toLocaleDateString() : "Present";
         timelineText = `📅 \`${start}\` to \`${end}\``;
      }

      const embed = new EmbedBuilder()
        .setTitle(`📁 Project: ${project.name}`)
        .addFields(
          { name: "🚦 Status", value: `\`${project.status}\``, inline: true },
          { name: "👤 Manager", value: `\`${project.manager}\``, inline: true },
          { name: "💰 Budget", value: `\`${project.budget}\``, inline: true },
          { name: "📅 Timeline", value: timelineText, inline: false }
        )
        .setColor("#5865F2")
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error("Error running project-details:", err);
      await interaction.editReply({ content: `❌ **Failed to fetch project details.**\n*Error: ${err.message}*` });
    }
  }
};
