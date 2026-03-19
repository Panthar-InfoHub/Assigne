import { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } from "discord.js";
import { getProjects, findTeamMembers, createTask, getProjectDetails, getTeamMembers } from "../services/notion.js";
import { askAI } from "../services/ai.js";

export default {
  data: new SlashCommandBuilder()
    .setName("assign-task-ai")
    .setDescription("Use AI to create a task naturally (e.g. Add test task for Shiva in Panthar)")
    .addStringOption(option =>
      option.setName("prompt")
        .setDescription("Type your request in natural language")
        .setRequired(true)
    ),

  async execute(interaction) {
    const logChannelId = process.env.LOG_CHANNEL_ID;
    await interaction.deferReply();

    const userPrompt = interaction.options.getString("prompt");

    try {
      // 1. Prompt AI to extract fields
      const aiPrompt = 
        `You are a structural parser. Extract task details from the sentence below into an accurate JSON format. ` +
        `Return ONLY the raw JSON string, wrapped inside nothing else (NO markdown \`\`\`json wrappers).\n\n` +
        `Sentence: "${userPrompt}"\n\n` +
        `JSON Schema:\n` +
        `{\n` +
        `  "title": "Clean concise task name",\n` +
        `  "project": "Project name found or null",\n` +
        `  "assignees": "Comma separated string of names or null"\n` +
        `}`;

      const aiResponse = await askAI(aiPrompt);

      // Extract JSON (fallback safeguard against markdown)
      let parsed = {};
      try {
         const cleanJson = aiResponse.match(/\{[\s\S]*\}/)?.[0] || aiResponse;
         parsed = JSON.parse(cleanJson);
      } catch (e) {
         throw new Error(`AI returned invalid structure: ${aiResponse}`);
      }

      const { title, project: projectNameInput, assignees } = parsed;

      if (!title) {
         return interaction.editReply({ content: `❌ **Failed to extract a Task Title from your prompt.**\nAI parsed: \`${JSON.stringify(parsed)}\`` });
      }

      let projectId = null;
      let projectLabel = "None";

      // 2. Map Project
      if (projectNameInput) {
        const search = await getProjects(""); 
        const matches = search.filter(p => p.name.toLowerCase().includes(projectNameInput.toLowerCase()));

        if (matches.length > 1) {
          const matchedTitles = matches.map(p => `**${p.name}**`).join(", ");
          return interaction.editReply({ 
            content: `⚠️ **Ambiguous Project choice.** AI parsed \`${projectNameInput}\` which fits multiple projects: ${matchedTitles}.\n\nPlease be more specific!` 
          });
        } else if (matches.length === 1) {
          projectId = matches[0].id;
          const projectPage = await getProjectDetails(projectId);
          projectLabel = projectPage.name;
        } 
        // If 0 matches, fallback to projectId = null (Optional)
      }

      // 3. Map Assignees
      let matchedIds = [];
      let unmatchedNames = [];
      let mentions = "None";

      if (assignees) {
        const result = await findTeamMembers(assignees);
        matchedIds = result.matchedIds || [];
        unmatchedNames = result.unmatchedNames || [];

        if (result.ambiguousNames && result.ambiguousNames.length > 0) {
          const list = result.ambiguousNames.map(a => `\`${a.input}\` fits both: **${a.matches.join(", ")}**`).join("\n");
          return interaction.editReply({ content: `⚠️ **Ambiguous Assignees found by AI:**\n${list}` });
        }

        const allMembers = await getTeamMembers();
        const selectedMembers = allMembers.filter(m => matchedIds.includes(m.id));
        mentions = selectedMembers.map(m => m.discordId ? `<@${m.discordId}>` : `**${m.name}**`).join(", ") || `**${assignees}**`;
      }

      // 4. Create Task in Notion
      await createTask({ title, projectId, assigneeIds: matchedIds });

      const successEmbed = new EmbedBuilder()
        .setDescription(`Project: **${projectLabel}**\nTask: **${title}**\nAssigned To: ${mentions}`)
        .addFields({ name: "🗣️ Your Prompt", value: userPrompt })
        .setColor("#9b59b6");

      if (unmatchedNames.length > 0) {
        successEmbed.setFooter({ text: `⚠️ Unrecognized names: ${unmatchedNames.join(", ")}` });
      }

      const button = new ButtonBuilder()
        .setLabel('View in Notion')
        .setURL('https://brindle-chard-876.notion.site/Panthar-Infohub-b3529a1324168222b18d8144beb474b8')
        .setStyle(ButtonStyle.Link);

      const row = new ActionRowBuilder().addComponents(button);

      if (logChannelId) {
        try {
          const logChannel = await interaction.client.channels.fetch(logChannelId);
          await logChannel.send({ embeds: [successEmbed], components: [row] });
          return interaction.editReply({ content: `✅ **AI Task Logged** (Posted to <#${logChannelId}>)`, embeds: [successEmbed], components: [row] });
        } catch (err) {
           console.error("Failed to forward response to LOG_CHANNEL_ID:", err);
        }
      }

      await interaction.editReply({ content: `✅ **AI Task Logged**`, embeds: [successEmbed], components: [row] });

    } catch (err) {
      console.error("Error creating AI task:", err);
      await interaction.editReply({ content: `❌ **Failed to create task with AI.**\n*Error: ${err.message}*` });
    }
  }
};
