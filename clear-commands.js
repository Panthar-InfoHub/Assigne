import dotenv from "dotenv";
import { REST, Routes } from "discord.js";

dotenv.config();

if (!process.env.DISCORD_TOKEN || !process.env.DISCORD_CLIENT_ID) {
  console.error("DISCORD_TOKEN and DISCORD_CLIENT_ID must be set in environment.");
  process.exit(1);
}

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID), { body: [] });
    console.log("Cleared all global commands.");
  } catch (err) {
    console.error("Failed to clear commands:");
    console.dir(err, { depth: null });
  }
})();
