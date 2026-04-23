import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { TeamMember } from "../models/teamMember.model.js";
import { connectMongo } from "../services/mongo.js";
import { getTeamMembers, invalidateTeamMembersCache } from "../services/team.service.js";

const availabilityChoices = [
    { name: "Full day", value: "Full day" },
    { name: "Half day", value: "Half day" },
    { name: "Not available", value: "Not available" },
    { name: "On leave", value: "On leave" },
];

export default {
    data: new SlashCommandBuilder()
        .setName("update-team-member")
        .setDescription("Update an existing team member")
        .addStringOption((option) =>
            option
                .setName("member")
                .setDescription("Team member to update")
                .setRequired(true)
                .setAutocomplete(true)
        )
        .addUserOption((option) =>
            option
                .setName("discord_user")
                .setDescription("Replace linked Discord user and profile image")
                .setRequired(false)
        )
        .addStringOption((option) =>
            option
                .setName("name")
                .setDescription("New name")
                .setRequired(false)
        )
        .addStringOption((option) =>
            option
                .setName("role")
                .setDescription("New role")
                .setRequired(false)
        )
        .addStringOption((option) =>
            option
                .setName("availability")
                .setDescription("New availability")
                .setRequired(false)
                .addChoices(...availabilityChoices)
        )
        .addStringOption((option) =>
            option
                .setName("email")
                .setDescription("New email")
                .setRequired(false)
        )
        .addStringOption((option) =>
            option
                .setName("phone")
                .setDescription("New phone")
                .setRequired(false)
        )
        .addBooleanOption((option) =>
            option
                .setName("refresh-image")
                .setDescription("Refresh profile image from linked Discord user")
                .setRequired(false)
        ),

    async autocomplete(interaction) {
        const focused = interaction.options.getFocused(true);
        if (focused.name !== "member") return;

        const members = await getTeamMembers();
        const value = (focused.value || "").toLowerCase();

        const choices = members
            .filter((m) => m.name.toLowerCase().includes(value))
            .map((m) => ({ name: m.name, value: m.id }))
            .slice(0, 25);

        return interaction.respond(choices);
    },

    async execute(interaction) {
        await interaction.deferReply();

        try {
            const memberId = interaction.options.getString("member", true);
            const discordUser = interaction.options.getUser("discord_user");
            const name = interaction.options.getString("name");
            const role = interaction.options.getString("role");
            const availability = interaction.options.getString("availability");
            const email = interaction.options.getString("email");
            const phone = interaction.options.getString("phone");
            const refreshImage = interaction.options.getBoolean("refresh-image") ?? true;

            await connectMongo();

            const member = await TeamMember.findById(memberId);
            if (!member) {
                return interaction.editReply({ content: "**Team member not found.**" });
            }

            if (name !== null) member.name = name;
            if (role !== null) member.role = role;
            if (availability !== null) member.availability = availability;
            if (email !== null) member.email = email;
            if (phone !== null) member.phone = phone;

            if (discordUser) {
                member.discordId = discordUser.id;
                member.picture = discordUser.displayAvatarURL({ size: 256 });
            } else if (refreshImage && member.discordId && interaction.guild) {
                try {
                    const linkedUser = await interaction.client.users.fetch(member.discordId);
                    member.picture = linkedUser.displayAvatarURL({ size: 256 });
                } catch (err) {
                    console.warn("Unable to refresh profile image for team member:", member.discordId, err.message);
                }
            }

            await member.save();
            invalidateTeamMembersCache();

            const discordText = member.discordId ? `<@${member.discordId}>` : "Not linked";

            const embed = new EmbedBuilder()
                .setTitle("Team Member Updated")
                .setColor("#4F46E5")
                .setDescription(`Updated profile for **${member.name}**`)
                .addFields(
                    { name: "Role", value: member.role || "Not set", inline: true },
                    { name: "Availability", value: member.availability || "Not set", inline: true },
                    { name: "Email", value: member.email || "Not set", inline: false },
                    { name: "Phone", value: member.phone || "Not set", inline: true },
                    { name: "Discord", value: discordText, inline: true }
                )
                .setTimestamp();

            if (member.picture) {
                embed.setThumbnail(member.picture);
            }

            return interaction.editReply({ embeds: [embed] });
        } catch (err) {
            console.error("Error updating team member:", err);
            return interaction.editReply({
                content: `**Failed to update team member.**\n*Error: ${err.message}*`,
            });
        }
    },
};
