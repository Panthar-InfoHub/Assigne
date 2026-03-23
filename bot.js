import dotenv from "dotenv";
import fs from "fs";
import express from "express";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { InteractionType, InteractionResponseType, verifyKeyMiddleware } from "discord-interactions";
import { Client, Collection, CommandInteraction, GatewayIntentBits } from "discord.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const _dirname = path.dirname(_filename);

/** * Even though we aren't "logging in" via WebSocket, 
 * discord.js needs a Client instance to initialize the Interaction classes properly.
 */
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();

// === Load command handlers (Your existing logic) ===
const commandsPath = path.join(__dirname, "commands");
if (fs.existsSync(commandsPath)) {
  const files = fs.readdirSync(commandsPath).filter(f => f.endsWith(".js"));
  for (const file of files) {
    try {
      const cmd = await import(pathToFileURL(path.join(commandsPath, file)).href);
      if (cmd && cmd.default && cmd.default.data) {
        client.commands.set(cmd.default.data.name, cmd.default);
      }
    } catch (err) {
      console.error("Failed to load command:", file, err);
    }
  }
}

const app = express();
const PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;

// === The Webhook Endpoint ===
app.post("/interactions", verifyKeyMiddleware(PUBLIC_KEY), async (req, res) => {
  const rawInteraction = req.body;

  // 1. Mandatory PING check for Discord
  if (rawInteraction.type === InteractionType.PING) {
    return res.send({ type: InteractionResponseType.PONG });
  }

  // 2. Handle Slash Commands
  if (rawInteraction.type === InteractionType.APPLICATION_COMMAND) {
    const command = client.commands.get(rawInteraction.data.name);

    if (!command) return res.status(404).send("Unknown Command");

    /**
     * CORE FIX: Create a real discord.js CommandInteraction object 
     * from the raw JSON so .reply() and .editReply() work.
     */
    const interaction = new CommandInteraction(client, rawInteraction);

    try {
      // Execute your existing command logic
      await command.execute(interaction, { client });
    } catch (err) {
      console.error("Command Error:", err);
      // Fallback if the command fails
      if (!interaction.replied) {
        await interaction.reply({ content: "Error executing command.", ephemeral: true });
      }
    }
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log("Webhook server listening on " + PORT);
});