import mongoose from "mongoose";

const DailyUpdateSchema = new mongoose.Schema(
    {
        discordId:   { type: String, required: true, trim: true },
        username:    { type: String, required: true, trim: true },
        displayName: { type: String, default: "", trim: true },
        content:     { type: String, required: true },
        // Date string "YYYY-MM-DD" in IST — used for grouping
        dateKey:     { type: String, required: true, index: true },
        messageId:   { type: String, required: true, unique: true },
    },
    {
        collection: "daily_updates",
        timestamps: true,
    }
);

export const DailyUpdate =
    mongoose.models.DailyUpdate ||
    mongoose.model("DailyUpdate", DailyUpdateSchema);
