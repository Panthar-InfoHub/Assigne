import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check bot latency and status"),
  async execute(interaction) {
    try {
      const latency = Date.now() - interaction.createdTimestamp;
      const apiPing = interaction.client.ws.ping > 0 ? `${Math.round(interaction.client.ws.ping)} ms` : "N/A (Webhook)";
      const embed = new EmbedBuilder()
        .setTitle("Pong!")
        .addFields(
          { name: "Latency", value: `${latency} ms`, inline: true },
          { name: "API Latency", value: apiPing, inline: true }
      )
      await interaction.editReply({ content: null, embeds: [embed] });
    } catch (err) {
      console.error("ping command error:", err);
      if (!interaction.replied) await interaction.reply({ content: "Failed to ping.", ephemeral: true });
    }
  }
};
