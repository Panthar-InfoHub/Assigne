import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getTeamMembers } from "../services/team.service.js";

export default {
  data: new SlashCommandBuilder()
    .setName("team-list")
    .setDescription("View current team members (availability, email, Discord, and profile image)"),

  async execute(interaction) {
    // await interaction.deferReply();

    try {
      const members = await getTeamMembers(); // uses cache, 0ms!

      if (members.length === 0) {
        return interaction.editReply({ content: "**No team members found in the workspace.**" });
      }

      const displayMembers = members.slice(0, 10);
      const embeds = displayMembers.map((m, index) => {
        const email = m.email?.trim() ? m.email : "Not set";
        const discordUser = m.discordId ? `<@${m.discordId}>` : "Not linked";
        const role = m.role?.trim() ? m.role : "Not set";

        const embed = new EmbedBuilder()
          .setColor("#4204b4")
          .setTitle(index === 0 ? "Team Members" : " ")
          .setDescription(`**${m.name}**\nRole: ${role}\nAvailability: \`${m.availability}\`\nEmail: ${email}\nDiscord: ${discordUser}`)
          .setTimestamp();

        if (m.picture) {
          embed.setThumbnail(m.picture);
        }

        return embed;
      });

      if (members.length > 10) {
        embeds.push(
          new EmbedBuilder()
            .setColor("#4204b4")
            .setDescription(`Showing first 10 members out of ${members.length}.`)
        );
      }

      await interaction.editReply({ embeds });

    } catch (err) {
      console.error("Error running team-list:", err);
      await interaction.editReply({ content: `**Failed to fetch team list.**\n*Error: ${err.message}*` });
    }
  }
};
