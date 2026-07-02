import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getProjects, getProjectTasks } from "../services/project.service.js";

const STATUS_COLORS = {
  "Not started": "#6e37edff",
  "In progress": "#8E86C9",
  "On hold": "#dbb46cff",
  "Done": "#8FA997",
  "Cancelled": "#B08585",
};
const DEFAULT_STATUS_COLOR = "#5B6472";
const STATUS_ORDER = ["Not started", "In progress", "On hold", "Done", "Cancelled"];

export default {
  data: new SlashCommandBuilder()
    .setName("project-tasks")
    .setDescription("View active tasks inside a project")
    .addStringOption(option =>
      option.setName("project")
        .setDescription("The project name or partial name")
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
    const projectNameInput = interaction.options.getString("project");

    try {
      const search = await getProjects(""); // utilizes local cache, 0ms!

      let projectId = null;
      let projectName = "Project";

      const direct = search.find(p => p.id === projectNameInput);
      if (direct) {
        projectId = direct.id;
        projectName = direct.name;
      } else {
        const matches = search.filter(p => p.name.toLowerCase().includes(projectNameInput.toLowerCase()));

        if (matches.length > 1) {
          const titles = matches.map(p => `**${p.name}**`).join(", ");
          return interaction.editReply({
            content: `**Ambiguous Project choice.** Your typing fit multiple projects: ${titles}.\nPlease be more specific!`
          });
        } else if (matches.length === 1) {
          projectId = matches[0].id;
          projectName = matches[0].name;
        } else {
          return interaction.editReply({
            content: `**No projects found matching \`${projectNameInput}\`.**`
          });
        }
      }

      const tasks = await getProjectTasks(projectId);

      if (tasks.length === 0) {
        return interaction.editReply({
          content: `**No tasks found for \`${projectName}\`** in the workspace.`
        });
      }

      const groups = new Map();
      for (const t of tasks) {
        if (!groups.has(t.status)) groups.set(t.status, []);
        groups.get(t.status).push(t.name);
      }

      const orderedStatuses = [
        ...STATUS_ORDER.filter((s) => groups.has(s)),
        ...[...groups.keys()].filter((s) => !STATUS_ORDER.includes(s)),
      ];

      const headerEmbed = new EmbedBuilder()
        .setTitle(`Tasks inside: ${projectName}`)
        .setColor(DEFAULT_STATUS_COLOR)
        .setFooter({ text: `${tasks.length} total` })
        .setTimestamp();

      const statusEmbeds = orderedStatuses.slice(0, 9).map((status) => {
        let listText = groups.get(status).map((name) => `• ${name}`).join("\n");

        // Discord limit check (Max string length 4096 in descriptions)
        if (listText.length > 4000) {
          listText = listText.slice(0, 4000) + "\n... *List truncated due to size limit*";
        }

        return new EmbedBuilder()
          .setTitle(`${status.toUpperCase()} · ${groups.get(status).length}`)
          .setDescription(listText)
          .setColor(STATUS_COLORS[status] || DEFAULT_STATUS_COLOR);
      });

      await interaction.editReply({ embeds: [headerEmbed, ...statusEmbeds] });

    } catch (err) {
      console.error("Error running project-tasks:", err);
      await interaction.editReply({ content: `**Failed to fetch task lists.**\n*Error: ${err.message}*` });
    }
  }
};
