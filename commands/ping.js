import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check bot latency and status"),
  async execute(interaction) {
    try {
      // const sent = await interaction.reply({ content: 'Pinging...', fetchReply: true });
      const latency = Date.now() - interaction.createdTimestamp;
      const embed = new EmbedBuilder()
        .setTitle("Pong!")
        .addFields(
          { name: "Latency", value: `${latency} ms`, inline: true },
          { name: "API Latency", value: `${Math.round(interaction.client.ws.ping)} ms`, inline: true }
        )
        .setFooter({ text: "Assigne — Pick Me Up Infinite Gacha" });
      await interaction.editReply({ content: null, embeds: [embed] });
    } catch (err) {
      console.error("ping command error:", err);
      if (!interaction.replied) await interaction.reply({ content: "Failed to ping.", ephemeral: true });
    }
  }
};
