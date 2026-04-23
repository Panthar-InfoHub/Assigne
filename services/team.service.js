import { connectMongo } from "./mongo.js";
import { TeamMember } from "../models/teamMember.model.js";

const TEAM_CACHE_TTL = 5 * 60 * 1000;
const teamCache = {
    items: [],
    fetchedAt: 0,
};

export function invalidateTeamMembersCache() {
    teamCache.items = [];
    teamCache.fetchedAt = 0;
}

function toStringId(value) {
    return value ? value.toString() : null;
}

function toTeamMemberSummary(member) {
    return {
        name: member.name || "Unknown",
        id: toStringId(member._id),
        discordId: member.discordId || null,
        availability: member.availability || "Unset",
        timezone: member.timeZone || "Unset",
        role: member.role || "",
        email: member.email || "",
        phone: member.phone || "",
        picture: member.picture || "",
    };
}

async function loadTeamMembers() {
    await connectMongo();
    const members = await TeamMember.find({}).sort({ name: 1 }).lean();
    teamCache.items = members.map(toTeamMemberSummary);
    teamCache.fetchedAt = Date.now();
    return teamCache.items;
}

export async function getTeamMembers() {
    const now = Date.now();

    if (teamCache.items.length > 0 && now - teamCache.fetchedAt < TEAM_CACHE_TTL) {
        return teamCache.items;
    }

    try {
        return await loadTeamMembers();
    } catch (error) {
        console.error("Mongo Error getTeamMembers:", error);
        return teamCache.items;
    }
}

export async function refreshTeamMembersCache() {
    invalidateTeamMembersCache();
    return getTeamMembers();
}

export async function findTeamMembers(namesString) {
    const namesToFind = namesString
        .split(",")
        .map((name) => name.trim().toLowerCase())
        .filter((name) => name.length > 0);

    if (namesToFind.length === 0) {
        return { matchedIds: [], unmatchedNames: [], ambiguousNames: [] };
    }

    try {
        const members = await getTeamMembers();
        const matchedIds = [];
        const unmatchedNames = [];
        const ambiguousNames = [];

        for (const needle of namesToFind) {
            const matches = members.filter((member) => member.name.toLowerCase().includes(needle));

            if (matches.length > 1) {
                ambiguousNames.push({
                    input: needle,
                    matches: matches.map((match) => match.name),
                });
            } else if (matches.length === 1) {
                matchedIds.push(matches[0].id);
            } else {
                unmatchedNames.push(needle);
            }
        }

        return { matchedIds, unmatchedNames, ambiguousNames };
    } catch (error) {
        console.error("Mongo Error findTeamMembers:", error);
        return { matchedIds: [], unmatchedNames: namesToFind, ambiguousNames: [] };
    }
}
