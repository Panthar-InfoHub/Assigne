import { Client } from "@notionhq/client";
import dotenv from "dotenv";

dotenv.config();

// Create Notion client instance if key exists
const notion = process.env.NOTION_KEY 
  ? new Client({ auth: process.env.NOTION_KEY }) 
  : null;

/**
 * Configure column/property names here if your Notion Database uses different names
 */
const PROPERTIES = {
  PROJECT_NAME: "Project Name", // Title property in Projects DB
  TASK_NAME: "Task Name",       // Title property in Tasks DB
  TEAM_NAME: "Member Name",     // Title property in Team Members DB
  RELATION_PROJECT: "Projects",  // Relation property in Tasks DB linking to Project
  RELATION_ASSIGNEE: "Assignee (Team)", // Relation property in Tasks DB linking to Team
  DISCORD_ID: "Discord ID",     // Text property in Team Members DB storing Discord ID
};

const dataSourceCache = {};
const projectNameCache = {}; // Cache map: { [id]: "Project Name" }
let teamMembersCache = [];   // Cache list: [ { name, id, discordId }, ... ]
let lastTeamFetch = 0;

/**
 * Helper to get the first data_source_id from a database_id container.
 * Cached in memory to speed up repeated queries (like Autocompletes).
 */
async function getDataSourceId(databaseId) {
  if (dataSourceCache[databaseId]) {
    return dataSourceCache[databaseId];
  }

  const response = await notion.databases.retrieve({ database_id: databaseId });
  const dsId = response.data_sources?.[0]?.id;
  
  if (!dsId) throw new Error(`No Data Source found for Database: ${databaseId}`);

  dataSourceCache[databaseId] = dsId; // Store in cache
  return dsId;
}

let projectsCache = [];       // Cache list: [ { name, id }, ... ]
let lastProjectsFetch = 0;

/**
 * Queries the Projects database to retrieve names/ids for autocompletes.
 * Cached to ensure Autocomplete suggestions load within milliseconds.
 */
export async function getProjects(query = "") {
  if (!notion) return [];
  const dbId = process.env.NOTION_DB_PROJECTS;
  if (!dbId) {
    console.warn("NOTION_DB_PROJECTS is not set in .env");
    return [];
  }

  const NOW = Date.now();
  if (projectsCache.length > 0 && (NOW - lastProjectsFetch < 5 * 60 * 1000)) {
    // Filter the cached list locally (takes 0ms!)
    return projectsCache.filter(p => 
      p.name.toLowerCase().includes(query.toLowerCase())
    );
  }

  try {
    const dataSourceId = await getDataSourceId(dbId);

    // Fetch top 100 projects to cache once
    const response = await notion.dataSources.query({
      data_source_id: dataSourceId,
      page_size: 100, 
    });

    const results = response.results.map((page) => ({
      name: page.properties[PROPERTIES.PROJECT_NAME]?.title[0]?.plain_text || "Untitled",
      id: page.id,
    }));

    projectsCache = results;
    lastProjectsFetch = NOW;

    // Cache the descriptive Name to avoid fetching details later
    results.forEach(p => {
      projectNameCache[p.id] = p.name;
    });

    return results.filter(p => 
      p.name.toLowerCase().includes(query.toLowerCase())
    );
  } catch (err) {
    console.error("Notion Error getProjects:", err);
    return projectsCache.filter(p => p.name.toLowerCase().includes(query.toLowerCase()));
  }
}

/**
 * Returns all Team Member names and Page IDs for select menus
 */
export async function getTeamMembers() {
  if (!notion) return [];
  const dbId = process.env.NOTION_DB_TEAM_MEMBERS;
  if (!dbId) {
    console.warn("NOTION_DB_TEAM_MEMBERS is not set in .env");
    return [];
  }

  const NOW = Date.now();
  // Return cached members if fetched less than 5 minutes ago to keep interaction instant 
  if (teamMembersCache.length > 0 && (NOW - lastTeamFetch < 5 * 60 * 1000)) {
    return teamMembersCache;
  }

  try {
    const dataSourceId = await getDataSourceId(dbId);

    const response = await notion.dataSources.query({
      data_source_id: dataSourceId,
    });

    teamMembersCache = response.results.map((page) => ({
      name: page.properties[PROPERTIES.TEAM_NAME]?.title[0]?.plain_text || "Unknown",
      id: page.id,
      discordId: page.properties[PROPERTIES.DISCORD_ID]?.rich_text?.[0]?.plain_text?.trim() || null,
    }));
    lastTeamFetch = NOW;

    return teamMembersCache;
  } catch (err) {
    console.error("Notion Error getTeamMembers:", err);
    return teamMembersCache; // Fallback to stale cache on network failure
  }
}

/**
 * Finds Team Member Page IDs based on a comma-separated string of names
 */
export async function findTeamMembers(namesString) {
  if (!notion) return [];
  const dbId = process.env.NOTION_DB_TEAM_MEMBERS;
  if (!dbId) {
    console.warn("NOTION_DB_TEAM_MEMBERS is not set in .env");
    return [];
  }

  const namesToFind = namesString
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter((n) => n.length > 0);

  if (namesToFind.length === 0) return { matchedIds: [], unmatchedNames: [] };

  try {
    const dataSourceId = await getDataSourceId(dbId);

    const response = await notion.dataSources.query({
      data_source_id: dataSourceId,
    });

    const members = response.results.map((page) => ({
      name: page.properties[PROPERTIES.TEAM_NAME]?.title[0]?.plain_text || "Unknown",
      id: page.id,
    }));

    const matchedIds = [];
    const unmatchedNames = [];
    const ambiguousNames = [];

    for (const needle of namesToFind) {
      const matches = members.filter((m) => m.name.toLowerCase().includes(needle));

      if (matches.length > 1) {
        ambiguousNames.push({
          input: needle,
          matches: matches.map(m => m.name),
        });
      } else if (matches.length === 1) {
        matchedIds.push(matches[0].id);
      } else {
        unmatchedNames.push(needle);
      }
    }

    return { matchedIds, unmatchedNames, ambiguousNames };
  } catch (err) {
    console.error("Notion Error findTeamMembers:", err);
    return { matchedIds: [], unmatchedNames: namesToFind, ambiguousNames: [] };
  }
}

/**
 * Retrieves specific project details (like Name) from a Page ID
 */
export async function getProjectDetails(projectId) {
  if (projectNameCache[projectId]) {
    return { name: projectNameCache[projectId], id: projectId };
  }

  if (!notion) return { name: "Unknown Project" };
  try {
    const page = await notion.pages.retrieve({ page_id: projectId });
    return {
      name: page.properties[PROPERTIES.PROJECT_NAME]?.title[0]?.plain_text || "Untitled",
      id: page.id,
    };
  } catch (err) {
    console.error("Notion Error getProjectDetails:", err);
    return { name: "Unknown Project" };
  }
}

/**
 * Creates a new task and links it to critical relations
 */
export async function createTask({ title, projectId, assigneeIds }) {
  if (!notion) throw new Error("Notion client not initialized. Add NOTION_KEY to .env");
  const dbId = process.env.NOTION_DB_TASKS;
  if (!dbId) throw new Error("NOTION_DB_TASKS not configured in .env");

  const properties = {
    [PROPERTIES.TASK_NAME]: {
      title: [{ text: { content: title } }],
    },
  };

  if (projectId) {
    properties[PROPERTIES.RELATION_PROJECT] = {
      relation: [{ id: projectId }],
    };
  }

  if (assigneeIds && assigneeIds.length > 0) {
    properties[PROPERTIES.RELATION_ASSIGNEE] = {
      relation: assigneeIds.map((id) => ({ id })),
    };
  }

  try {
    const response = await notion.pages.create({
      parent: { database_id: dbId },
      properties,
    });
    return response;
  } catch (err) {
    console.error("Notion Error createTask:", err);
    throw err;
  }
}
