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
      option.setName("assignees")
        .setDescription("Team members (e.g., Shiva, Dave) - supports autocomplete list")
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption(option =>
      option.setName("project")
        .setDescription("The project name or partial name (e.g. Panthar)")
        .setRequired(false)
        .setAutocomplete(true)
    )
    .addStringOption(option =>
      option.setName("due-date")
        .setDescription("Task deadline (YYYY-MM-DD, today, tomorrow)")
        .setRequired(false)
    ),

  async autocomplete(interaction) {
    const focusedOption = interaction.options.getFocused(true);
    const value = focusedOption.value;

    if (focusedOption.name === "project") {
      const projects = await getProjects(""); // Uses local cache static list
      const choices = projects.map(p => ({ name: p.name, value: p.id }));
      const filtered = choices.filter(choice => choice.name.toLowerCase().includes(value.toLowerCase()));
      return interaction.respond(filtered.slice(0, 25));
    }

    if (focusedOption.name === "assignees") {
      const members = await getTeamMembers();
      
      // Chained Autocomplete logic for multiples
      const items = value.split(",");
      const currentTyped = items[items.length - 1].trim().toLowerCase();
      const prefix = items.slice(0, items.length - 1).join(", ").trim();

      const filtered = members.filter(m => m.name.toLowerCase().includes(currentTyped));

      const choices = filtered.map(m => {
        const fullString = prefix ? `${prefix}, ${m.name}` : m.name;
        // Discord Limits: Name 100 characters, Value 100 characters
        return {
          name: fullString.length > 100 ? fullString.substring(0, 97) + "..." : fullString,
          value: fullString.length > 100 ? fullString.substring(0, 100) : fullString
        };
      });

      return interaction.respond(choices.slice(0, 25));
    }
  },

  async execute(interaction) {
    const logChannelId = process.env.LOG_CHANNEL_ID;
    await interaction.deferReply();

    const title = interaction.options.getString("title");
    const projectNameInput = interaction.options.getString("project");
    const assigneesInput = interaction.options.getString("assignees");
    const dueDateInput = interaction.options.getString("due-date");

    try {
      let projectId = null;
      let projectLabel = "None";

      // 1. Map Project Name (fuzzy matching) - ONLY if provided!
      if (projectNameInput) {
        const isUuid = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i.test(projectNameInput);

        if (isUuid) {
          projectId = projectNameInput;
          const projectPage = await getProjectDetails(projectId);
          projectLabel = projectPage.name;
        } else {
          const search = await getProjects(""); 
          const matches = search.filter(p => p.name.toLowerCase().includes(projectNameInput.toLowerCase()));

          if (matches.length > 1) {
            const matchedTitles = matches.map(p => `**${p.name}**`).join(", ");
            return interaction.editReply({ 
              content: `⚠️ **Ambiguous Project choice.** Your typing fit multiple projects: ${matchedTitles}.\n\nPlease be more specific!` 
            });
          } else if (matches.length === 1) {
            projectId = matches[0].id;
            const projectPage = await getProjectDetails(projectId);
            projectLabel = projectPage.name;
          } else {
            return interaction.editReply({ 
              content: `❌ **No projects found matching \`${projectNameInput}\`.**` 
            });
          }
        }
      }

      // 2. Map Assignees
      const { matchedIds, unmatchedNames, ambiguousNames } = await findTeamMembers(assigneesInput);

      if (unmatchedNames.length > 0) {
        return interaction.editReply({ 
          content: `❌ **No team members found matching: \`${unmatchedNames.join(", ")}\`.**` 
        });
      }

      if (ambiguousNames && ambiguousNames.length > 0) {
        const list = ambiguousNames.map(a => `\`${a.input}\` fits both: **${a.matches.join(", ")}**`).join("\n");
        return interaction.editReply({
          content: `⚠️ **Ambiguous Assignees found:**\n${list}\n\nPlease help solve duplicates!`
        });
      }

      const allMembers = await getTeamMembers();
      const selectedMembers = allMembers.filter(m => matchedIds.includes(m.id));
      const mentions = selectedMembers.map(m => m.discordId ? `<@${m.discordId}>` : `**${m.name}**`).join(", ") || `**${assigneesInput}**`;

      let dueDate = null;
      if (dueDateInput) {
        if (dueDateInput.toLowerCase() === "today") {
          dueDate = new Date().toISOString().split("T")[0];
        } else if (dueDateInput.toLowerCase() === "tomorrow") {
          const d = new Date();
          d.setDate(d.getDate() + 1);
          dueDate = d.toISOString().split("T")[0];
        } else {
          const isDate = /^\d{4}-\d{2}-\d{2}$/.test(dueDateInput);
          if (!isDate) {
            return interaction.editReply({ 
              content: `❌ **Invalid date format \`${dueDateInput}\`.** Please use \`YYYY-MM-DD\` (e.g. \`2024-12-31\`) or simple phrases: \`today\`, \`tomorrow\`.` 
            });
          }
          dueDate = dueDateInput;
        }
      }

      // 3. Create Task
      await createTask({ title, projectId, assigneeIds: matchedIds, dueDate });

      const successEmbed = new EmbedBuilder()
        .setDescription(`Project: **${projectLabel}**\nTask: **${title}**\nAssigned To: ${mentions}`)
        .setColor("#9b59b6");

      if (dueDate) {
        successEmbed.addFields({ name: "📅 Due Date", value: `\`${dueDate}\``, inline: true });
      }

      // Enforced match, no footer needed

      const button = new ButtonBuilder()
        .setLabel('View in Notion')
        .setURL('https://brindle-chard-876.notion.site/Panthar-Infohub-b3529a1324168222b18d8144beb474b8')
        .setStyle(ButtonStyle.Link);

      const row = new ActionRowBuilder().addComponents(button);

      // 4. Send to another Channel
      if (logChannelId) {
        try {
          const logChannel = await interaction.client.channels.fetch(logChannelId);
          await logChannel.send({ embeds: [successEmbed], components: [row] });

          return interaction.editReply({ 
            content: `✅ **Task Logged** (Posted to <#${logChannelId}>)`, 
            embeds: [successEmbed], 
            components: [row] 
          });
        } catch (err) {
          console.error("Failed to forward response to LOG_CHANNEL_ID:", err);
        }
      }

      await interaction.editReply({ 
        content: `✅ **Task Logged**`, 
        embeds: [successEmbed], 
        components: [row] 
      });

    } catch (err) {
      console.error("Error creating task:", err);
      await interaction.editReply({ content: `❌ **Failed to create task.**\n*Error: ${err.message}*` });
    }
  }
};
