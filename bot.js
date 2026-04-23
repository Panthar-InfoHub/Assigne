import dotenv from "dotenv";
import fs from "fs";
import express from "express";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { InteractionType, InteractionResponseType, verifyKeyMiddleware } from "discord-interactions";
import { AutocompleteInteraction, Client, Collection, CommandInteraction, GatewayIntentBits } from "discord.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BOT_MODE = (process.env.BOT_MODE || (process.env.DISCORD_PUBLIC_KEY ? "webhook" : "gateway")).toLowerCase();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();

const commandsPath = path.join(__dirname, "commands");
if (fs.existsSync(commandsPath)) {
  const files = fs.readdirSync(commandsPath).filter((file) => file.endsWith(".js"));
  for (const file of files) {
    try {
      const cmd = await import(pathToFileURL(path.join(commandsPath, file)).href);
      if (cmd?.default?.data) {
        client.commands.set(cmd.default.data.name, cmd.default);
      }
    } catch (err) {
      console.error("Failed to load command:", file, err);
    }
  }
}

async function executeCommand(interaction) {
  const command = client.commands.get(interaction.commandName);

  if (!command) {
    return;
  }

  try {
    await command.execute(interaction, { client });
  } catch (err) {
    console.error("Command Error:", err);

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "Error executing command.", ephemeral: true });
    } else if (!interaction.replied) {
      await interaction.editReply({ content: "Error executing command." });
    }
  }
}

async function executeAutocomplete(interaction) {
  const command = client.commands.get(interaction.commandName);

  if (!command?.autocomplete) {
    return;
  }

  try {
    await command.autocomplete(interaction, { client });
  } catch (err) {
    console.error("Autocomplete Error:", err);
  }
}

if (BOT_MODE === "gateway") {
  client.once("ready", () => {
    console.log(`Gateway bot ready as ${client.user.tag}`);
  });

  client.on("interactionCreate", async (interaction) => {
    if (interaction.isAutocomplete()) {
      return executeAutocomplete(interaction);
    }

    if (interaction.isChatInputCommand()) {
      return executeCommand(interaction);
    }
  });

  if (!process.env.DISCORD_TOKEN) {
    throw new Error("DISCORD_TOKEN is required for gateway mode.");
  }

  await client.login(process.env.DISCORD_TOKEN);
} else {
  const app = express();
  const PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;

  app.post("/interactions", verifyKeyMiddleware(PUBLIC_KEY), async (req, res) => {
    try {

      const rawInteraction = req.body;

      if (rawInteraction.type === InteractionType.PING) {
        return res.send({ type: InteractionResponseType.PONG });
      }

      if (rawInteraction.type === InteractionType.APPLICATION_COMMAND) {

        res.send({
          type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
        });

        const interaction = new CommandInteraction(client, rawInteraction);

        interaction.deferReply = async () => {
          interaction.deferred = true;
          return;
        };

        interaction.reply = async (options) => {
          return await interaction.editReply(options);
        };
        return executeCommand(interaction);
      }

      if (rawInteraction.type === InteractionType.APPLICATION_COMMAND_AUTOCOMPLETE) {
        const interaction = new AutocompleteInteraction(client, rawInteraction);
        return executeAutocomplete(interaction);
      }

      return res.status(400).send("Unsupported interaction type");

    } catch (error) {
      console.error("Interaction Error:", error);
      return res.status(500).send("Internal Server Error");
    }
  });

  const PORT = process.env.PORT || 8080;
  app.listen(PORT, () => {
    console.log(`Webhook server listening on ${PORT}`);
  });
}