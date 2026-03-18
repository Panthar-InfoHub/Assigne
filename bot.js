import {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  Collection,
} from "discord.js";
import dotenv from "dotenv";
import fs from "fs";
import express from "express";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel],
});

client.commands = new Collection();
client.msgCommands = new Collection();

// === Load event modules ===
const eventsPath = path.join(__dirname, "events");
if (fs.existsSync(eventsPath)) {
  for (const file of fs.readdirSync(eventsPath).filter(f => f.endsWith(".js"))) {
    try {
      const mod = await import(pathToFileURL(path.join(eventsPath, file)).href);
      if (mod && mod.default) mod.default({ client });
    } catch (err) {
      console.error("Failed to load event file:", file, err);
    }
  }
}

// === Load command handlers ===
const commandsPath = path.join(__dirname, "commands");
if (fs.existsSync(commandsPath)) {
  for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith(".js"))) {
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

// === Load message command handlers ===
const msgCommandsPath = path.join(__dirname, "msg_commands");
if (fs.existsSync(msgCommandsPath)) {
  for (const file of fs.readdirSync(msgCommandsPath).filter(f => f.endsWith(".js"))) {
    try {
      const mod = await import(pathToFileURL(path.join(msgCommandsPath, file)).href);
      const cmd = mod.default || mod;
      if (cmd) {
        const name = file.replace(".js", "").toLowerCase();
        client.msgCommands.set(name, cmd);
      }
    } catch (err) {
      console.error("Failed to load message command:", file, err);
    }
  }
}

client.once(Events.ClientReady, () => {
  console.log(`Bot has awakened — logged in as ${client.user.tag}`);
});

const PREFIX = "!";
client.on(Events.MessageCreate, async (message) => {
  try {
    if (message.author.bot) return;

    if (message.content.startsWith(PREFIX)) {
      const [command, ...args] = message.content
        .slice(PREFIX.length)
        .split(" ");

      const cmd = client.msgCommands.get(command.toLowerCase());
      if (cmd) {
        try {
          if (typeof cmd === 'function' && cmd.prototype && cmd.prototype.message) {
            const instance = new cmd();
            await instance.message(message);
          } else if (cmd.message) {
            await cmd.message(message);
          } else if (typeof cmd === 'function') {
            await cmd(message);
          }
        } catch (err) {
          console.error(`Error executing msg command ${command}:`, err);
        }
      }
    }
  } catch (err) {
    console.error("MessageCreate error:", err);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) {
      await interaction.reply({ content: "Unknown command.", ephemeral: true });
      return;
    }

    try {
      await command.execute(interaction, { client });
    } catch (err) {
      console.error("Command execution error:", err);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: "There was an error executing that command.", ephemeral: true });
      } else {
        await interaction.reply({ content: "There was an error executing that command.", ephemeral: true });
      }
    }
    return;
  }

  if (interaction.isAutocomplete()) {
    const command = client.commands.get(interaction.commandName);
    if (!command || !command.autocomplete) return;

    try {
      await command.autocomplete(interaction);
    } catch (err) {
      console.error("Autocomplete error:", err);
    }
    return;
  }
});

const app = express();
app.get("/", (req, res) => res.send(`Bot is online ✨`));
app.listen(process.env.PORT || 3000, async () => {
  console.log("Keep-alive server listening on port", process.env.PORT || 3000);
});

process.on("SIGINT", () => {
  console.log("SIGINT received — exiting...");
  process.exit(0);
});

if (!process.env.DISCORD_TOKEN) {
  console.error("DISCORD_TOKEN missing. Fill it in .env");
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN).catch(err => {
  console.error("Failed to login:", err);
  process.exit(1);
});
