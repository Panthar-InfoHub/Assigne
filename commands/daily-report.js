import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getTasks } from "../services/notion.js";
import { askAI } from "../services/ai.js";

export default {
  data: new SlashCommandBuilder()
    .setName("daily-report")
    .setDescription("Generates an AI-powered morning summary digest of all active tasks"),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      // 1. Fetch live tasks from Notion
      const tasks = await getTasks(""); 

      if (tasks.length === 0) {
        return interaction.editReply({ content: "🗂️ **No active tasks found in Notion to report on right now.**" });
      }

      // 2. Format a clean Task List string for the AI to read
      const taskListString = tasks
        .map(t => `- [${t.status}] **${t.name}**`)
        .join("\n");

      // 3. Construct the Prompt
      const prompt = 
        `Below is a list of open tasks from our Team Workspace in Notion. ` +
        `Please write a friendly, concise (2-3 short paragraphs max), and motivating "Daily Digest" for the group. ` +
        `Summarize the priorities, nudge standard blockers, and keep the tone professional but warm. ` +
        `Do not use lists of same exact items if they look exactly identical, consolidate them into a smart narrative.\n\n` +
        `📋 **Tasks List:**\n${taskListString}`;

      // 4. Generate AI response
      const aiResponse = await askAI(prompt);

      const embed = new EmbedBuilder()
        .setTitle(`🤖 Daily Report Digest`)
        .setDescription(aiResponse)
        .setColor("#9b59b6") // Purple to match outputs 
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error("Error executing daily-report:", err);
      await interaction.editReply({ 
        content: `❌ **Failed to generate report.**\nEnsure your OpenRouter API keys are authorized.\n\n*Error: ${err.message}*` 
      });
    }
  }
};
