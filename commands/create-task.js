import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getProjects } from "../services/project.service.js";
import { createTask } from "../services/task.service.js";
import { findTeamMembers, getTeamMembers } from "../services/team.service.js";

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

export default {
    data: new SlashCommandBuilder()
        .setName("create-task")
        .setDescription("Create a new task")
        .addStringOption((option) =>
            option.setName("title").setDescription("Task title").setRequired(true)
        )
        .addStringOption((option) =>
            option
                .setName("assignees")
                .setDescription("Assignees (comma separated)")
                .setRequired(true)
                .setAutocomplete(true)
        )
        .addStringOption((option) =>
            option
                .setName("project")
                .setDescription("Project name")
                .setRequired(false)
                .setAutocomplete(true)
        )
        .addStringOption((option) =>
            option
                .setName("due-date")
                .setDescription("Due date (YYYY-MM-DD, today, tomorrow)")
                .setRequired(false)
        )
        .addStringOption((option) =>
            option
                .setName("notes")
                .setDescription("Task notes")
                .setRequired(false)
        ),

    async autocomplete(interaction) {
        const focusedOption = interaction.options.getFocused(true);
        const value = focusedOption.value;

        if (focusedOption.name === "project") {
            const projects = await getProjects("");
            const choices = projects
                .filter((p) => p.name.toLowerCase().includes(value.toLowerCase()))
                .map((p) => ({ name: p.name, value: p.id }))
                .slice(0, 25);
            return interaction.respond(choices);
        }

        if (focusedOption.name === "assignees") {
            const members = await getTeamMembers();
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
        const logChannelId = process.env.LOG_CHANNEL_ID;
        await interaction.deferReply();

        try {
            const title = interaction.options.getString("title");
            const projectInput = interaction.options.getString("project");
            const assigneesInput = interaction.options.getString("assignees");
            const dueDateInput = interaction.options.getString("due-date");
            const notes = interaction.options.getString("notes") || "";

            let projectId = null;
            let projectLabel = "None";

            if (projectInput) {
                const projects = await getProjects("");
                const direct = projects.find((p) => p.id === projectInput);

                if (direct) {
                    projectId = direct.id;
                    projectLabel = direct.name;
                } else {
                    const matches = projects.filter((p) =>
                        p.name.toLowerCase().includes(projectInput.toLowerCase())
                    );

                    if (matches.length > 1) {
                        return interaction.editReply({
                            content: `**Ambiguous project input. Matches:** ${matches.map((m) => m.name).join(", ")}`,
                        });
                    }

                    if (matches.length === 0) {
                        return interaction.editReply({
                            content: `**No project found matching:** ${projectInput}`,
                        });
                    }

                    projectId = matches[0].id;
                    projectLabel = matches[0].name;
                }
            }

            const dueDate = parseDateInput(dueDateInput);
            if (dueDate === "INVALID") {
                return interaction.editReply({
                    content: "**Invalid due date format. Use YYYY-MM-DD, today, or tomorrow.**",
                });
            }

            const { matchedIds, unmatchedNames, ambiguousNames } = await findTeamMembers(assigneesInput);

            if (unmatchedNames.length > 0) {
                return interaction.editReply({
                    content: `**No team members found for:** ${unmatchedNames.join(", ")}`,
                });
            }

            if (ambiguousNames.length > 0) {
                const lines = ambiguousNames
                    .map((a) => `${a.input}: ${a.matches.join(", ")}`)
                    .join("\n");
                return interaction.editReply({
                    content: `**Ambiguous assignee input:**\n${lines}`,
                });
            }

            const savedTask = await createTask({
                title,
                projectId,
                assigneeIds: matchedIds,
                dueDate,
                notes,
            });

            const members = await getTeamMembers();
            const assigneeText = members
                .filter((m) => matchedIds.includes(m.id))
                .map((m) => (m.discordId ? `<@${m.discordId}>` : m.name))
                .join(", ");

            const embed = new EmbedBuilder()
                .setTitle("Task Created")
                .setColor("#3209ad")
                .addFields(
                    { name: "Title", value: title, inline: true },
                    { name: "Status", value: savedTask.status || "Not started", inline: true },
                    { name: "Project", value: projectLabel, inline: false },
                    { name: "Due Date", value: dueDate || "Not set", inline: true },
                    { name: "Assignees", value: assigneeText || "Not set", inline: false },
                    { name: "Notes", value: notes || "Not set", inline: false }
                )
                .setTimestamp();

            if (logChannelId) {
                try {
                    const logChannel = await interaction.client.channels.fetch(logChannelId);
                    await logChannel.send({ embeds: [embed] });

                    return interaction.editReply({
                        content: `Task logged (posted to <#${logChannelId}>)`,
                        embeds: [embed],
                    });
                } catch (err) {
                    console.error("Failed to forward response to LOG_CHANNEL_ID:", err);
                }
            }

            await interaction.editReply({
                content: "Task logged",
                embeds: [embed],
            });
        } catch (err) {
            console.error("Error creating task:", err);
            await interaction.editReply({
                content: `**Failed to create task.**\n*Error: ${err.message}*`,
            });
        }
    },
};
