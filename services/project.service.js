import { connectMongo } from "./mongo.js";
import { Project } from "../models/project.model.js";
import { Task } from "../models/task.model.js";

const PROJECT_CACHE_TTL = 5 * 60 * 1000;
const projectCache = {
    items: [],
    fetchedAt: 0,
};

function toStringId(value) {
    return value ? value.toString() : null;
}

function toProjectSummary(project) {
    return {
        name: project.name || "Untitled",
        id: toStringId(project._id),
        status: project.status || "No Status",
    };
}

function toProjectDetails(project) {
    return {
        name: project.name || "Untitled",
        id: toStringId(project._id),
        status: project.status || "No Status",
        timeline: project.timeline || null,
        budget: project.budget ?? "None",
        manager: project.managedBy?.name || project.managedBy?.toString?.() || "Unmanaged",
    };
}

async function loadProjects() {
    await connectMongo();
    const projects = await Project.find({}).sort({ name: 1 }).populate("managedBy", "name").lean();
    projectCache.items = projects.map(toProjectSummary);
    projectCache.fetchedAt = Date.now();
    return projectCache.items;
}

export async function getProjects(query = "") {
    const now = Date.now();

    if (projectCache.items.length > 0 && now - projectCache.fetchedAt < PROJECT_CACHE_TTL) {
        return projectCache.items.filter((project) => project.name.toLowerCase().includes(query.toLowerCase()));
    }

    try {
        const projects = await loadProjects();
        return projects.filter((project) => project.name.toLowerCase().includes(query.toLowerCase()));
    } catch (error) {
        console.error("Mongo Error getProjects:", error);
        return projectCache.items.filter((project) => project.name.toLowerCase().includes(query.toLowerCase()));
    }
}

export async function getProjectDetails(projectId) {
    try {
        await connectMongo();
        const project = await Project.findById(projectId).populate("managedBy", "name").lean();

        if (!project) {
            return { name: "Unknown Project" };
        }

        return toProjectDetails(project);
    } catch (error) {
        console.error("Mongo Error getProjectDetails:", error);
        return { name: "Unknown Project" };
    }
}

export async function getProjectTasks(projectId) {
    try {
        await connectMongo();
        const tasks = await Task.find({ projectId }).sort({ updatedAt: -1 }).lean();

        return tasks.map((task) => ({
            name: task.title || "Untitled",
            id: toStringId(task._id),
            status: task.status || "No Status",
            timeStatus: task.timeStatus || "Unset",
            dueDate: task.dueDate || null,
        }));
    } catch (error) {
        console.error("Mongo Error getProjectTasks:", error);
        return [];
    }
}
