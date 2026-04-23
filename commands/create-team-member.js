import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { TeamMember } from "../models/teamMember.model.js";
import { connectMongo } from "../services/mongo.js";
import { invalidateTeamMembersCache } from "../services/team.service.js";

export default {
    data: new SlashCommandBuilder()
        .setName("create-team-member")
        .setDescription("Create a new team member in the database")
        .addStringOption((option) =>
            option
                .setName("name")
                .setDescription("Full name of the team member")
                .setRequired(true)
        )
        .addStringOption((option) =>
            option
                .setName("role")
                .setDescription("Role or position (e.g., Developer, Designer, Manager)")
                .setRequired(true)
        )
        .addStringOption((option) =>
            option
                .setName("email")
                .setDescription("Email address")
                .setRequired(true)
        )
        .addStringOption((option) =>
            option
                .setName("phone")
                .setDescription("Phone number")
                .setRequired(true)
        )
        .addUserOption((option) =>
            option
                .setName("discord_user")
                .setDescription("Select the Discord user for this team member")
                .setRequired(true)
        )
        .addStringOption((option) =>
            option
                .setName("availability")
                .setDescription("Availability status (default: Full day)")
                .setRequired(false)
                .addChoices(
                    { name: "Full day", value: "Full day" },
                    { name: "Half day", value: "Half day" },
                    { name: "Not available", value: "Not available" },
                    { name: "On leave", value: "On leave" }
                )
        ),

    async execute(interaction) {
        await interaction.deferReply();

        try {
            const name = interaction.options.getString("name");
            const role = interaction.options.getString("role");
            const email = interaction.options.getString("email");
            const phone = interaction.options.getString("phone");
            const discordUser = interaction.options.getUser("discord_user");
            const availability = interaction.options.getString("availability") || "Full day";

            if (!discordUser) {
                return interaction.editReply({
                    content: "**Failed to create team member.**\n*Error: Missing or invalid Discord user option.*",
                });
            }

            const discordId = discordUser.id;
            const picture = discordUser.displayAvatarURL?.({ size: 256 }) || null;

            await connectMongo();

            // Check if team member already exists with this Discord ID
            const existingMember = await TeamMember.findOne({ discordId });
            if (existingMember) {
                return interaction.editReply({
                    content: `**A team member with Discord ID ${discordId} already exists.**\nMember: **${existingMember.name}**`,
                });
            }

            // Create new team member
            const teamMember = new TeamMember({
                name,
                role,
                email,
                phone,
                discordId,
                picture,
                availability,
                timeZone: "IST",
            });

            await teamMember.save();
            invalidateTeamMembersCache();

            const embed = new EmbedBuilder()
                .setTitle("Success!!! Team Member Created")
                .setDescription(`Successfully added **${name}** to the team.`)
                .addFields(
                    { name: "Name", value: name, inline: true },
                    { name: "Role", value: role, inline: true },
                    { name: "Email", value: email, inline: false },
                    { name: "Phone", value: phone, inline: true },
                    { name: "Availability", value: availability, inline: true },
                    { name: "Timezone", value: "IST", inline: true },
                    { name: "Discord User", value: `<@${discordId}>`, inline: false }
                )
                .setColor("#602ecc")
                .setTimestamp();

            if (picture) {
                embed.setThumbnail(picture);
            }

            await interaction.editReply({ embeds: [embed] });
        } catch (err) {
            console.error("Error creating team member:", err);
            await interaction.editReply({
                content: `**Failed to create team member.**\n*Error: ${err.message}*`,
            });
        }
    },
};
