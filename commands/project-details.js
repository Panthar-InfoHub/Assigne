import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getProjects, getProjectDetails } from "../services/project.service.js";

export default {
  data: new SlashCommandBuilder()
    .setName("project-details")
    .setDescription("View details about a project from our database")
    .addStringOption(option =>
      option.setName("project")
        .setDescription("Select a project")
        .setRequired(true)
        .setAutocomplete(true)
    ),

  async autocomplete(interaction) {
    const focusedOption = interaction.options.getFocused(true);
    const value = focusedOption.value;

    if (focusedOption.name === "project") {
      const projects = await getProjects("");
      const choices = projects
        .filter((project) => project.name.toLowerCase().includes(value.toLowerCase()))
        .map((project) => ({ name: project.name, value: project.id }))
        .slice(0, 25);

      return interaction.respond(choices);
    }
  },

  async execute(interaction) {
    await interaction.deferReply();
    const projectInput = interaction.options.getString("project");

    try {
      const search = await getProjects(""); // utilizes local cache, 0ms!
      let selectedProject = search.find((project) => project.id === projectInput);

      if (!selectedProject) {
        const matches = search.filter((project) =>
          project.name.toLowerCase().includes(projectInput.toLowerCase())
        );

        if (matches.length > 1) {
          const titles = matches.map((project) => `**${project.name}**`).join(", ");
          return interaction.editReply({
            content: `Ambiguous project input. Matches: ${titles}`,
          });
        }

        if (matches.length === 0) {
          return interaction.editReply({
            content: `No project found matching: ${projectInput}`,
          });
        }

        selectedProject = matches[0];
      }

      const project = await getProjectDetails(selectedProject.id);

      let timelineText = "Not set";
      if (project.timeline) {
        const start = project.timeline.start ? new Date(project.timeline.start).toLocaleDateString() : "Start not set";
         const end = project.timeline.end ? new Date(project.timeline.end).toLocaleDateString() : "Present";
        timelineText = `${start} → ${end}`;
      }

      const embed = new EmbedBuilder()
        .setTitle(project.name)
        .setDescription("Project Overview")
        .addFields(
          { name: "Status", value: project.status ? `\`${project.status}\`` : "`Not set`", inline: true },
          { name: "Manager", value: project.manager ? `${project.manager}` : "Not set", inline: true },
          { name: "Budget", value: project.budget ? `${project.budget}` : "Not set", inline: true },
          { name: "Timeline", value: timelineText, inline: false }
        )
        .setColor("#0022ff")
        .setFooter({ text: "Assigne Workspace" })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error("Error running project-details:", err);
      await interaction.editReply({ content: `Failed to fetch project details.\nError: ${err.message}` });
    }
  }
};
