import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { REST, Routes } from "discord.js";
import { fileURLToPath, pathToFileURL } from "url";

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const commands = [];
const commandsPath = path.join(__dirname, "commands");
if (fs.existsSync(commandsPath)) {
  for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith(".js"))) {
    try {
      const cmd = await import(pathToFileURL(path.join(commandsPath, file)).href);
      if (cmd && cmd.default && cmd.default.data) {
        commands.push(cmd.default.data.toJSON());
      }
    } catch (err) {
      console.error("Failed to import command for registration:", file, err);
    }
  }
}

if (!process.env.DISCORD_TOKEN || !process.env.DISCORD_CLIENT_ID) {
  console.error("DISCORD_TOKEN and CLIENT_ID must be set in environment.");
  process.exit(1);
}

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log(`Registering ${commands.length} commands.`);
    if (process.env.GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.GUILD_ID), { body: commands });
      console.log("Registered commands to guild:", process.env.GUILD_ID);
    } else {
      await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID), { body: commands });
      console.log("Registered commands globally.");
    }
  } catch (err) {
    console.error("Failed to register commands:");
    console.dir(err, { depth: null });
  }
})();
