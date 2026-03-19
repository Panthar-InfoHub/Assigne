import dotenv from "dotenv";
import { REST, Routes } from "discord.js";

dotenv.config();

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log("Wiping Global commands listing to remove duplicates...");
        
        await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID), { body: [] });

        console.log("✅ Global commands successfully wiped!");
    } catch (err) {
        console.error("Failed to wipe Global commands:", err);
    }
})();
