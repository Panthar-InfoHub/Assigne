import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getProjects } from "../services/notion.js";

export default {
  data: new SlashCommandBuilder()
    .setName("projects-list")
    .setDescription("List all projects currently in Notion"),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const projects = await getProjects(""); // utilizes local cache, 0ms!

      if (projects.length === 0) {
        return interaction.editReply({ content: "🗂️ **No projects found in Notion.**" });
      }

      const listText = projects
        .map(p => `- [\`${p.status}\`] **${p.name}**`)
        .join("\n");

      const embed = new EmbedBuilder()
        .setTitle(`📁 Projects List`)
        .setDescription(listText)
        .setColor("#5865F2")
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error("Error running projects-list:", err);
      await interaction.editReply({ content: `❌ **Failed to fetch projects.**\n*Error: ${err.message}*` });
    }
  }
};
