import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { Project } from "../models/project.model.js";
import { connectMongo } from "../services/mongo.js";
import { getTeamMembers } from "../services/team.service.js";
import { requireRoles } from "../services/permissions.service.js";

function parseDateInput(input) {
    if (!input) return null;

    const lower = input.toLowerCase();
    if (lower === "today") {
        return new Date().toISOString().split("T")[0];
    }

    if (lower === "tomorrow") {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        return d.toISOString().split("T")[0];
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) {
        return "INVALID";
    }

    return input;
}

function resolveSingleMember(members, input) {
    if (!input) {
        return { member: null, error: null };
    }

    const direct = members.find((m) => m.id === input);
    if (direct) {
        return { member: direct, error: null };
    }

    const matches = members.filter((m) => m.name.toLowerCase().includes(input.toLowerCase()));
    if (matches.length === 1) {
        return { member: matches[0], error: null };
    }

    if (matches.length > 1) {
        return {
            member: null,
            error: `Ambiguous manager input. Matches: ${matches.map((m) => m.name).join(", ")}`,
        };
    }

    return { member: null, error: `No team member found for "${input}".` };
}

function resolveMultipleMembers(members, input) {
    if (!input) {
        return { matched: [], unmatched: [], ambiguous: [] };
    }

    const chunks = input
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);

    const matched = [];
    const unmatched = [];
    const ambiguous = [];

    for (const chunk of chunks) {
        const direct = members.find((m) => m.id === chunk);
        if (direct) {
            matched.push(direct);
            continue;
        }

        const hits = members.filter((m) => m.name.toLowerCase().includes(chunk.toLowerCase()));
        if (hits.length === 1) {
            matched.push(hits[0]);
        } else if (hits.length > 1) {
            ambiguous.push({ input: chunk, matches: hits.map((m) => m.name) });
        } else {
            unmatched.push(chunk);
        }
    }

    const unique = [];
    const seen = new Set();
    for (const member of matched) {
        if (!seen.has(member.id)) {
            seen.add(member.id);
            unique.push(member);
        }
    }

    return { matched: unique, unmatched, ambiguous };
}

export default {
    data: new SlashCommandBuilder()
        .setName("create-project")
        .setDescription("Create a new project")
        .addStringOption((option) =>
            option.setName("name").setDescription("Project name").setRequired(true)
        )
        .addStringOption((option) =>
            option
                .setName("status")
                .setDescription("Project status")
                .setRequired(false)
                .addChoices(
                    { name: "Not started", value: "Not started" },
                    { name: "Started", value: "Started" },
                    { name: "In progress", value: "In progress" },
                    { name: "On hold", value: "On hold" },
                    { name: "Maintenance", value: "Maintenance" },
                    { name: "Completed", value: "Completed" }
                )
        )
        .addStringOption((option) =>
            option
                .setName("managed-by")
                .setDescription("Manager from team members")
                .setRequired(false)
                .setAutocomplete(true)
        )
        .addStringOption((option) =>
            option
                .setName("team-members")
                .setDescription("Comma separated team members")
                .setRequired(false)
                .setAutocomplete(true)
        )
        .addStringOption((option) =>
            option.setName("budget").setDescription("Budget text or number").setRequired(false)
        )
        .addStringOption((option) =>
            option
                .setName("deadline")
                .setDescription("Deadline (YYYY-MM-DD, today, tomorrow)")
                .setRequired(false)
        )
        .addStringOption((option) =>
            option
                .setName("timeline-start")
                .setDescription("Timeline start (YYYY-MM-DD)")
                .setRequired(false)
        )
        .addStringOption((option) =>
            option
                .setName("timeline-end")
                .setDescription("Timeline end (YYYY-MM-DD)")
                .setRequired(false)
        ),

    async autocomplete(interaction) {
        const focusedOption = interaction.options.getFocused(true);
        const value = focusedOption.value || "";
        const members = await getTeamMembers();

        if (focusedOption.name === "managed-by") {
            const choices = members
                .filter((m) => m.name.toLowerCase().includes(value.toLowerCase()))
                .map((m) => ({ name: m.name, value: m.id }))
                .slice(0, 25);
            return interaction.respond(choices);
        }

        if (focusedOption.name === "team-members") {
            const items = value.split(",");
            const currentTyped = items[items.length - 1].trim().toLowerCase();
            const prefix = items.slice(0, items.length - 1).join(", ").trim();

            const choices = members
                .filter((m) => m.name.toLowerCase().includes(currentTyped))
                .map((m) => {
                    const full = prefix ? `${prefix}, ${m.name}` : m.name;
                    return {
                        name: full.length > 100 ? `${full.slice(0, 97)}...` : full,
                        value: full.length > 100 ? full.slice(0, 100) : full,
                    };
                })
                .slice(0, 25);

            return interaction.respond(choices);
        }
    },

    async execute(interaction) {
        // await interaction.deferReply();

        try {
            const allowedRoleIds = process.env.PROJECT_CREATE_ROLE_IDS;
            const canCreateProject = await requireRoles(interaction, allowedRoleIds, "any");

            if (!canCreateProject) {
                return;
            }

            const name = interaction.options.getString("name");
            const status = interaction.options.getString("status") || "Not started";
            const managerInput = interaction.options.getString("managed-by");
            const teamInput = interaction.options.getString("team-members");
            const budgetInput = interaction.options.getString("budget");
            const deadlineInput = interaction.options.getString("deadline");
            const timelineStartInput = interaction.options.getString("timeline-start");
            const timelineEndInput = interaction.options.getString("timeline-end");

            const members = await getTeamMembers();
            const managerResolution = resolveSingleMember(members, managerInput);
            if (managerResolution.error) {
                return interaction.editReply({ content: `**${managerResolution.error}**` });
            }

            const teamResolution = resolveMultipleMembers(members, teamInput || "");
            if (teamResolution.unmatched.length > 0) {
                return interaction.editReply({
                    content: `**No team member found for:** ${teamResolution.unmatched.join(", ")}`,
                });
            }

            if (teamResolution.ambiguous.length > 0) {
                const message = teamResolution.ambiguous
                    .map((x) => `${x.input}: ${x.matches.join(", ")}`)
                    .join("\n");
                return interaction.editReply({
                    content: `**Ambiguous team member inputs:**\n${message}`,
                });
            }

            const deadline = parseDateInput(deadlineInput);
            if (deadline === "INVALID") {
                return interaction.editReply({ content: "**Invalid deadline format. Use YYYY-MM-DD, today, or tomorrow.**" });
            }

            const timelineStart = parseDateInput(timelineStartInput);
            const timelineEnd = parseDateInput(timelineEndInput);
            if (timelineStart === "INVALID" || timelineEnd === "INVALID") {
                return interaction.editReply({ content: "**Invalid timeline date format. Use YYYY-MM-DD.**" });
            }

            await connectMongo();

            const project = await Project.create({
                name,
                status,
                managedBy: managerResolution.member?.id || null,
                budget: budgetInput || null,
                deadline: deadline ? new Date(deadline) : null,
                timeline:
                    timelineStart || timelineEnd
                        ? {
                            start: timelineStart ? new Date(timelineStart) : null,
                            end: timelineEnd ? new Date(timelineEnd) : null,
                        }
                        : null,
                teamList: teamResolution.matched.map((m) => m.id),
            });

            const managerText = managerResolution.member
                ? managerResolution.member.discordId
                    ? `<@${managerResolution.member.discordId}>`
                    : managerResolution.member.name
                : "Not set";

            const teamText = teamResolution.matched.length
                ? teamResolution.matched
                    .map((m) => (m.discordId ? `<@${m.discordId}>` : m.name))
                    .join(", ")
                : "Not set";

            const embed = new EmbedBuilder()
                .setTitle("Project Created")
                .setColor("#3209ad")
                .addFields(
                    { name: "Name", value: project.name, inline: true },
                    { name: "Status", value: project.status, inline: true },
                    { name: "Managed By", value: managerText, inline: false },
                    { name: "Team", value: teamText, inline: false },
                    { name: "Budget", value: budgetInput || "Not set", inline: true },
                    { name: "Deadline", value: deadline || "Not set", inline: true }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } catch (err) {
            console.error("Error creating project:", err);
            await interaction.editReply({
                content: `**Failed to create project.**\n*Error: ${err.message}*`,
            });
        }
    },
};
