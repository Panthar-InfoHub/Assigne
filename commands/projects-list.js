import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getProjects } from "../services/project.service.js";

const STATUS_COLORS = {
  "Not started": "#6B7280",
  "Started": "#7C93A6",
  "In progress": "#8E86C9",
  "On hold": "#C2A878",
  "Maintenance": "#C08552",
  "Completed": "#8FA997",
};
const DEFAULT_STATUS_COLOR = "#5B6472";

export default {
  data: new SlashCommandBuilder()
    .setName("projects-list")
    .setDescription("List all projects currently in the workspace"),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const projects = await getProjects(""); // utilizes local cache, 0ms!

      if (projects.length === 0) {
        return interaction.editReply({ content: "No projects found in the workspace." });
      }

      const statusOrder = ["Not started", "Started", "In progress", "On hold", "Maintenance", "Completed"];
      const groups = new Map();

      for (const p of projects) {
        if (!groups.has(p.status)) groups.set(p.status, []);
        groups.get(p.status).push(p.name);
      }

      const orderedStatuses = [
        ...statusOrder.filter((s) => groups.has(s)),
        ...[...groups.keys()].filter((s) => !statusOrder.includes(s)),
      ];

      const headerEmbed = new EmbedBuilder()
        .setTitle("Projects")
        .setColor('#4204b4')
        .setFooter({ text: `${projects.length} total` })
        .setTimestamp();

      const statusEmbeds = orderedStatuses.slice(0, 9).map((status) =>
        new EmbedBuilder()
          .setTitle(`${status.toUpperCase()} · ${groups.get(status).length}`)
          .setDescription(groups.get(status).map((name) => `• ${name}`).join("\n"))
          .setColor(STATUS_COLORS[status] || DEFAULT_STATUS_COLOR)
      );

      await interaction.editReply({ embeds: [headerEmbed, ...statusEmbeds] });

    } catch (err) {
      console.error("Error running projects-list:", err);
      await interaction.editReply({ content: `**Failed to fetch projects.**\n*Error: ${err.message}*` });
    }
  }
};
