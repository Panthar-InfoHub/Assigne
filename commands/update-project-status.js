import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getProjects, updateProjectStatus } from "../services/project.service.js";
import { requireRoles } from "../services/permissions.service.js";

export default {
  data: new SlashCommandBuilder()
    .setName("update-project-status")
    .setDescription("Update the status of a project")
    .addStringOption(option =>
      option.setName("project")
        .setDescription("Select a project")
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption(option =>
      option.setName("status")
        .setDescription("Select the new status")
        .setRequired(true)
        .addChoices(
          { name: "Not started", value: "Not started" },
          { name: "Started", value: "Started" },
          { name: "In progress", value: "In progress" },
          { name: "On hold", value: "On hold" },
          { name: "Maintenance", value: "Maintenance" },
          { name: "Completed", value: "Completed" }
        )
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
    // await interaction.deferReply();

    try {
      const allowedRoleIds = process.env.PROJECT_CREATE_ROLE_IDS;
      const canUpdateProject = await requireRoles(interaction, allowedRoleIds, "any");

      if (!canUpdateProject) {
        return;
      }

      const projectInput = interaction.options.getString("project");
      const newStatus = interaction.options.getString("status");

      const search = await getProjects(""); // utilizes local cache, 0ms!
      let selectedProject = search.find((project) => project.id === projectInput);

      if (!selectedProject) {
        const matches = search.filter((project) =>
          project.name.toLowerCase().includes(projectInput.toLowerCase())
        );

        if (matches.length > 1) {
          const titles = matches.map((project) => `**${project.name}**`).join(", ");
          return interaction.editReply({
            content: `**Ambiguous project input.** Matches: ${titles}`,
          });
        }

        if (matches.length === 0) {
          return interaction.editReply({
            content: `**No project found matching:** ${projectInput}`,
          });
        }

        selectedProject = matches[0];
      }

      const project = await updateProjectStatus(selectedProject.id, newStatus);

      const embed = new EmbedBuilder()
        .setTitle("Project Status Updated")
        .setColor("#3209ad")
        .addFields(
          { name: "Project", value: project.name, inline: true },
          { name: "New Status", value: `\`${project.status}\``, inline: true }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error("Error updating project status:", err);
      await interaction.editReply({ content: `**Failed to update project status.**\n*Error: ${err.message}*` });
    }
  }
};
