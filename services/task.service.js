import mongoose from "mongoose";
import { connectMongo } from "./mongo.js";
import { Project } from "../models/project.model.js";
import { Task } from "../models/task.model.js";

function toStringId(value) {
    return value ? value.toString() : null;
}

function toObjectId(value) {
    if (!value || !mongoose.Types.ObjectId.isValid(value)) {
        return null;
    }

    return new mongoose.Types.ObjectId(value);
}

function normalizeStatus(statusName) {
    return statusName || "Not started";
}

function calculateTimeStatus(dueDate, statusName) {
    if (!dueDate) {
        return "Unset";
    }

    const normalizedStatus = normalizeStatus(statusName);
    if (normalizedStatus === "Done" || normalizedStatus === "Cancelled") {
        return "Completed";
    }

    const due = new Date(dueDate);
    const now = new Date();
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);

    return due < endOfToday ? "Overdue" : "On Time";
}

function toTaskSummary(task) {
    return {
        name: task.title || "Untitled",
        id: toStringId(task._id),
        status: task.status || "No Status",
        timeStatus: task.timeStatus || "Unset",
        dueDate: task.dueDate || null,
    };
}

export async function createTask({ title, projectId, assigneeIds, dueDate, notes = "" }) {
    await connectMongo();

    const projectObjectId = toObjectId(projectId);
    const assigneeObjectIds = Array.isArray(assigneeIds)
        ? assigneeIds.map(toObjectId).filter(Boolean)
        : [];
    const dueDateValue = dueDate ? new Date(dueDate) : null;
    const task = await Task.create({
        title,
        status: "Not started",
        projectId: projectObjectId,
        assigneeIds: assigneeObjectIds,
        dueDate: dueDateValue,
        timeStatus: calculateTimeStatus(dueDateValue, "Not started"),
        notes,
    });

    if (projectObjectId) {
        await Project.findByIdAndUpdate(projectObjectId, {
            $addToSet: { taskIds: task._id },
        });
    }

    return task.toObject();
}

export async function getTasks(query = "") {
    try {
        await connectMongo();
        const filter = query
            ? { title: { $regex: query, $options: "i" } }
            : {};

        const tasks = await Task.find(filter).sort({ updatedAt: -1 }).limit(50).lean();
        return tasks.map(toTaskSummary);
    } catch (error) {
        console.error("Mongo Error getTasks:", error);
        return [];
    }
}

export async function getProjectTasks(projectId) {
    try {
        await connectMongo();
        const tasks = await Task.find({ projectId }).sort({ updatedAt: -1 }).lean();
        return tasks.map(toTaskSummary);
    } catch (error) {
        console.error("Mongo Error getProjectTasks (task service):", error);
        return [];
    }
}

export async function getTasksAssignedTo(memberPageId) {
    try {
        await connectMongo();
        const tasks = await Task.find({ assigneeIds: memberPageId }).sort({ updatedAt: -1 }).lean();
        return tasks.map(toTaskSummary);
    } catch (error) {
        console.error("Mongo Error getTasksAssignedTo:", error);
        return [];
    }
}

export async function updateTaskStatus(taskId, statusName) {
    await connectMongo();
    const task = await Task.findById(taskId);

    if (!task) {
        throw new Error("Task not found");
    }

    task.status = normalizeStatus(statusName);
    task.timeStatus = calculateTimeStatus(task.dueDate, task.status);
    task.completedDate = task.status === "Done" ? new Date() : null;

    await task.save();
    return task.toObject();
}
