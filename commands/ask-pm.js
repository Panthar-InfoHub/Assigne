import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getProjects, getProjectDetails, getProjectTasks } from "../services/project.service.js";
import { askAI } from "../services/ai.js";

export default {
  data: new SlashCommandBuilder()
    .setName("ask-pm")
    .setDescription("Ask the AI Project Manager questions about a specific project")
    .addStringOption(option =>
      option.setName("project")
        .setDescription("The project name or partial name")
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption(option =>
      option.setName("query")
        .setDescription("What do you want to ask about this project?")
        .setRequired(true)
    ),

  async autocomplete(interaction) {
    const focusedOption = interaction.options.getFocused(true);
    if (focusedOption.name === "project") {
      const projects = await getProjects(""); // Uses local cache static list
      const choices = projects.map(p => ({ name: p.name, value: p.id }));
      return interaction.respond(choices.slice(0, 25));
    }
  },

  async execute(interaction) {
    await interaction.deferReply();

    const projectIdInput = interaction.options.getString("project");
    const userQuery = interaction.options.getString("query");

    try {
      let projectId = projectIdInput;
      let projectName = "Project";

      // 1. Resolve Project ID if they typed manually instead of selecting choice
      const isUuid = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i.test(projectIdInput);

      if (!isUuid) {
        const search = await getProjects("");
        const matches = search.filter(p => p.name.toLowerCase().includes(projectIdInput.toLowerCase()));

        if (matches.length > 1) {
          const titles = matches.map(p => `**${p.name}**`).join(", ");
          return interaction.editReply({ content: `⚠️ Ambiguous project. Matches: ${titles}.\nPlease be more specific!` });
        } else if (matches.length === 1) {
          projectId = matches[0].id;
        } else {
          return interaction.editReply({ content: `❌ No project found matching \`${projectIdInput}\`.` });
        }
      }

      // 2. Fetch Project & Tasks metadata
      const details = await getProjectDetails(projectId);
      projectName = details.name;
      const tasks = await getProjectTasks(projectId);

      const taskListString = tasks.map(t => `- [${t.status}] ${t.name}`).join("\n") || "No tasks currently listed.";

      // 3. Construct AI Context & Query
      const prompt = 
        `You are a professional AI Project Manager. Answer the user's question about the project "${projectName}" based STRICTLY on the data provided below.\n\n` +
        `📁 **Project Overview:**\n` +
        `- Status: ${details.status}\n` +
        `- Manager: ${details.manager}\n` +
        `- Budget: ${details.budget}\n` +
        `- Timeline: ${details.timeline ? `${details.timeline.start} to ${details.timeline.end || "Ongoing"}` : "None"}\n\n` +
        `📝 **Active Tasks:**\n${taskListString}\n\n` +
        `❓ **User Query:** "${userQuery}"`;

      const aiResponse = await askAI(prompt);

      const embed = new EmbedBuilder()
        .setTitle(`🤖 AI Project Manager: ${projectName}`)
        .setDescription(aiResponse)
        .addFields({ name: "❓ Asked", value: userQuery })
        .setColor("#9b59b6")
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error("Error executing ask-pm:", err);
      await interaction.editReply({ content: `❌ **Failed to generate answer from AI.**\n*Error: ${err.message}*` });
    }
  }
};
