function parseRoleIds(roleIds) {
    if (!roleIds) return [];

    if (Array.isArray(roleIds)) {
        return roleIds.map((id) => String(id).trim()).filter(Boolean);
    }

    if (typeof roleIds === "string") {
        return roleIds
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean);
    }

    return [];
}

function getRoleSetFromInteraction(interaction) {
    const roles = interaction.member?.roles;

    if (!roles) {
        return new Set();
    }

    if (Array.isArray(roles)) {
        return new Set(roles.map((id) => String(id)));
    }

    if (roles.cache) {
        return new Set(Array.from(roles.cache.keys()));
    }

    return new Set();
}

async function replyPermissionDenied(interaction) {
    const denyEmbed = {
        title: "Access Denied",
        description:
            "Gotcha!!, you are not authorized for this command. If you think this is a mistake, ping an admin.",
        color: "#920000",
    };

    if (interaction.deferred && !interaction.replied) {
        await interaction.editReply({ content: null, embeds: [denyEmbed] });
        return;
    }

    if (!interaction.replied) {
        await interaction.reply({ embeds: [denyEmbed], ephemeral: true });
    }
}

export async function requireRoles(interaction, roleIds, mode = "any") {

    const requiredRoles = parseRoleIds(roleIds);
    if (requiredRoles.length === 0) {
        return true;
    }

    let memberRoleSet = getRoleSetFromInteraction(interaction);

    // special edge case when member role set is zero (could be due to missing intents or other issues), try fetching member roles directly from the guild as a fallback
    if (memberRoleSet.size === 0 && interaction.guild && interaction.user?.id) {
        try {
            const member = await interaction.guild.members.fetch(interaction.user.id);
            memberRoleSet = new Set(Array.from(member.roles.cache.keys()));
        } catch (error) {
            console.error("Permission check failed to fetch guild member:", error);
        }
    }

    const hasPermission =
        mode === "all"
            ? requiredRoles.every((roleId) => memberRoleSet.has(roleId))
            : requiredRoles.some((roleId) => memberRoleSet.has(roleId));

    if (!hasPermission) {
        await replyPermissionDenied(interaction);
    }

    return hasPermission;
}
