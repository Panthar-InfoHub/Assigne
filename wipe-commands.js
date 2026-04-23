import dotenv from "dotenv";
import { REST, Routes } from "discord.js";

dotenv.config();

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        if (!process.env.DISCORD_TOKEN || !process.env.DISCORD_CLIENT_ID) {
            console.error("DISCORD_TOKEN and DISCORD_CLIENT_ID must be set in environment.");
            process.exit(1);
        }

        console.log("Wiping Global commands listing...");
        await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID), { body: [] });
        console.log("Global commands wiped.");

        if (process.env.GUILD_ID) {
            console.log("Wiping Guild commands listing...");
            await rest.put(
                Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.GUILD_ID),
                { body: [] }
            );
            console.log(`Guild commands wiped for ${process.env.GUILD_ID}.`);
        }

        console.log("All configured command scopes wiped successfully.");
    } catch (err) {
        console.error("Failed to wipe commands:", err);
    }
})();
