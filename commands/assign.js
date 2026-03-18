import { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } from "discord.js";
import { getProjects, findTeamMembers, createTask, getProjectDetails, getTeamMembers } from "../services/notion.js";

export default {
  data: new SlashCommandBuilder()
    .setName("assign-task")
    .setDescription("Create a task in Notion linked to a project and assignees")
    .addStringOption(option =>
      option.setName("title")
        .setDescription("The title or name of the task")
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName("project")
        .setDescription("The project name or partial name (e.g. Panthar)")
        .setRequired(false) // Optional!
    )
    .addStringOption(option =>
      option.setName("assignees")
        .setDescription("Comma-separated names of team members (e.g., Shiva, Dave)")
        .setRequired(true)
    ),

  async execute(interaction) {
    const logChannelId = process.env.LOG_CHANNEL_ID;
    // Always make command replies visible for transparency
    await interaction.deferReply({ ephemeral: false });

    const title = interaction.options.getString("title");
    const projectNameInput = interaction.options.getString("project");
    const assignees = interaction.options.getString("assignees");

    try {
      let projectId = null;
      let projectLabel = "None"; // Default if not provided

      // 1. Map Project Name (fuzzy matching) - ONLY if provided!
      if (projectNameInput) {
        const search = await getProjects(""); // utilizes local cache, 0ms!
        const matches = search.filter(p => p.name.toLowerCase().includes(projectNameInput.toLowerCase()));

        if (matches.length > 1) {
          const matchedTitles = matches.map(p => `**${p.name}**`).join(", ");
          return interaction.editReply({ 
            content: `⚠️ **Ambiguous Project choice.** Your typing fit multiple projects: ${matchedTitles}.\n\nPlease be more specific!` 
          });
        } else if (matches.length === 1) {
          projectId = matches[0].id;
          // fetch Project Name before creating (for nicer readout display)
          const projectPage = await getProjectDetails(projectId);
          projectLabel = projectPage.name;
        } else {
          return interaction.editReply({ 
            content: `❌ **No projects found matching \`${projectNameInput}\`.** Please ensure the name is correct in Notion!` 
          });
        }
      }

      // 2. Map Multiple Assignees (comma-separated string -> Notion IDs)
      const { matchedIds, unmatchedNames, ambiguousNames } = await findTeamMembers(assignees);

      if (ambiguousNames && ambiguousNames.length > 0) {
        const list = ambiguousNames.map(a => `\`${a.input}\` fits both: **${a.matches.join(", ")}**`).join("\n");
        return interaction.editReply({
          content: `⚠️ **Ambiguous Assignees found:**\n${list}\n\nPlease type a longer name list to specify which one you want!`
        });
      }

      const allMembers = await getTeamMembers(); // cached, 0ms!
      const selectedMembers = allMembers.filter(m => matchedIds.includes(m.id));
      const mentions = selectedMembers.map(m => m.discordId ? `<@${m.discordId}>` : `**${m.name}**`).join(", ") || `**${assignees}**`;

      // 3. Create Task in Notion container
      await createTask({
        title,
        projectId,
        assigneeIds: matchedIds,
      });

      // Lightweight Response inside an Embed frame
      const successEmbed = new EmbedBuilder()
        .setDescription(
          `Project: **${projectLabel}**\n` +
          `Task: **${title}**\n` +
          `Assigned To: ${mentions}`
        )
        .setColor("#9b59b6"); // Purple theme 

      if (unmatchedNames.length > 0) {
        successEmbed.setFooter({ text: `⚠️ Unrecognized names: ${unmatchedNames.join(", ")}` });
      }

      // Button linking to Notion Workspace
      const button = new ButtonBuilder()
        .setLabel('View in Notion')
        .setURL('https://brindle-chard-876.notion.site/Panthar-Infohub-b3529a1324168222b18d8144beb474b8')
        .setStyle(ButtonStyle.Link);

      const row = new ActionRowBuilder().addComponents(button);

      // 4. Send to another Channel if LOG_CHANNEL_ID is configured in .env
      if (logChannelId) {
        try {
          const logChannel = await interaction.client.channels.fetch(logChannelId);
          await logChannel.send({ embeds: [successEmbed], components: [row] });

          const feedbackText = 
            `✅ **Task Logged** (Posted to <#${logChannelId}>)\n` +
            `Project: **${projectLabel}**\n` +
            `Task: **${title}**\n` +
            `Assigned To: ${mentions}`;

          return interaction.editReply({ content: feedbackText, embeds: [], components: [] });
        } catch (err) {
          console.error("Failed to forward response to LOG_CHANNEL_ID:", err);
          // Fallback to replying standardly if ID was invalid 
        }
      }

      const defaultText = 
          `✅ **Task Logged**\n` +
          `Project: **${projectLabel}**\n` +
          `Task: **${title}**\n` +
          `Assigned To: ${mentions}`;

      await interaction.editReply({ content: defaultText, embeds: [successEmbed], components: [row] });

    } catch (err) {
      console.error("Error creating task Option A (No Autocomplete):", err);
      await interaction.editReply({ 
        content: `❌ **Failed to create task.**\nEnsure your \`.env\` file has the correct ID values for Notion integration.\n\n*Error Detail: ${err.message}*`
      });
    }
  }
};
