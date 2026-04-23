import mongoose from "mongoose";

const TeamMemberSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        availability: { type: String, default: "Unset", trim: true },
        role: { type: String, default: "", trim: true },
        timeZone: { type: String, default: "Unset", trim: true },
        email: { type: String, default: "", trim: true },
        phone: { type: String, default: "", trim: true },
        picture: { type: String, default: "", trim: true },
        discordId: { type: String, default: null, index: true, sparse: true, trim: true },
    },
    {
        collection: "team_members",
        timestamps: true,
    }
);

TeamMemberSchema.index({ name: 1 });

export const TeamMember = mongoose.models.TeamMember || mongoose.model("TeamMember", TeamMemberSchema);
