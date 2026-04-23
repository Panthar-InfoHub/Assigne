import mongoose from "mongoose";

const TaskSchema = new mongoose.Schema(
    {
        title: { type: String, required: true, trim: true },
        status: { type: String, default: "Not started", trim: true },
        projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Project", default: null, index: true },
        assigneeIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "TeamMember" }],
        dueDate: { type: Date, default: null },
        timeStatus: { type: String, default: "Unset", trim: true },
        notes: { type: String, default: "", trim: true },
        completedDate: { type: Date, default: null },
    },
    {
        collection: "tasks",
        timestamps: true,
    }
);

TaskSchema.index({ title: 1 });
TaskSchema.index({ status: 1 });

export const Task = mongoose.models.Task || mongoose.model("Task", TaskSchema);
