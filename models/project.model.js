import mongoose from "mongoose";

const TimelineSchema = new mongoose.Schema(
    {
        start: { type: Date, default: null },
        end: { type: Date, default: null },
    },
    { _id: false }
);

const ProjectSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        status: { type: String, default: "Not started", trim: true },
        managedBy: { type: mongoose.Schema.Types.ObjectId, ref: "TeamMember", default: null },
        budget: { type: mongoose.Schema.Types.Mixed, default: null },
        completedDate: { type: Date, default: null },
        createdTime: { type: Date, default: Date.now },
        deadline: { type: Date, default: null },
        teamList: [{ type: mongoose.Schema.Types.ObjectId, ref: "TeamMember" }],
        timeline: { type: TimelineSchema, default: null },
        meetingIds: [{ type: mongoose.Schema.Types.ObjectId, default: null }],
        taskIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Task" }],
    },
    {
        collection: "projects",
        timestamps: true,
    }
);

ProjectSchema.index({ name: 1 });

export const Project = mongoose.models.Project || mongoose.model("Project", ProjectSchema);
