import dotenv from "dotenv";
import fs from "fs";
import express from "express";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { InteractionType, InteractionResponseType, verifyKeyMiddleware } from "discord-interactions";
import { AutocompleteInteraction, Client, Collection, CommandInteraction, GatewayIntentBits, ModalSubmitInteraction } from "discord.js";
import { STANDUP_MODAL_ID, STANDUP_INPUT_ID } from "./commands/submit-daily-report.js";
import { STANDUP_BUTTON_ID } from "./commands/setup-standup-channel.js";
import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BOT_MODE = (process.env.BOT_MODE || (process.env.DISCORD_PUBLIC_KEY ? "webhook" : "gateway")).toLowerCase();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
  ],
});
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

    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: "Error executing command.", ephemeral: true });
      } else if (!interaction.replied) {
        await interaction.editReply({ content: "Error executing command." });
      }
    } catch (_) {
      // Interaction already expired — nothing we can do
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

function flattenCommandOptions(options = []) {
  const result = [];

  for (const option of options) {
    // SUB_COMMAND (1) and SUB_COMMAND_GROUP (2) can contain nested options.
    if ((option.type === 1 || option.type === 2) && Array.isArray(option.options)) {
      result.push(...flattenCommandOptions(option.options));
      continue;
    }

    result.push(option);
  }

  return result;
}

if (!process.env.DISCORD_TOKEN) {
  throw new Error("DISCORD_TOKEN is required.");
}

await client.login(process.env.DISCORD_TOKEN);


// ─── Express App Setup (Always active for Cloud Run Port Binding & Cloud Scheduler) ───

const app = express();
app.use(express.json());
app.set("discordClient", client);

app.get("/", (req, res) => {
  res.send("Assigne bot is active.");
});

// Mount admin API routes (trigger-report, generate-report, edit-past-update)
import adminRoutes from "./routes/admin.routes.js";
app.use(adminRoutes);

// ─── Gateway mode ─────────────────────────────────────────────────────────

if (BOT_MODE === "gateway") {
  client.once("ready", async () => {
    console.log(`Gateway bot ready as ${client.user.tag}`);
  });

  client.on("interactionCreate", async (interaction) => {
    if (interaction.isAutocomplete()) {
      return executeAutocomplete(interaction);
    }

    if (interaction.isChatInputCommand()) {
      return executeCommand(interaction);
    }

    // ── Button click → open the standup modal ─────────────────────────────
    if (interaction.isButton() && interaction.customId === STANDUP_BUTTON_ID) {
      const modal = new ModalBuilder()
        .setCustomId(STANDUP_MODAL_ID)
        .setTitle("Daily Standup");

      const input = new TextInputBuilder()
        .setCustomId(STANDUP_INPUT_ID)
        .setLabel("What did you work on today?")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(4000);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    // Route modal submissions back to the originating command's handleModal()
    if (interaction.isModalSubmit()) {
      if (interaction.customId === STANDUP_MODAL_ID) {
        const standupCmd = client.commands.get("submit-daily-report");
        if (standupCmd?.handleModal) {
          try {
            await standupCmd.handleModal(interaction);
          } catch (err) {
            console.error("[standup modal] Error:", err);
            if (!interaction.replied && !interaction.deferred) {
              await interaction.reply({ content: "❌ Failed to save standup.", ephemeral: true });
            }
          }
        }
      }
      return;
    }
  });

} else {
  // ─── Webhook mode ─────────────────────────────────────────────────────────
  const PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;

  app.post("/interactions", verifyKeyMiddleware(PUBLIC_KEY), async (req, res) => {
    try {
      const rawInteraction = req.body;

      if (rawInteraction.type === InteractionType.PING) {
        return res.send({ type: InteractionResponseType.PONG });
      }

      // ── Button interaction → open the standup modal ───────────────────────
      if (rawInteraction.type === InteractionType.MESSAGE_COMPONENT) {
        const customId = rawInteraction.data?.custom_id;

        if (customId === STANDUP_BUTTON_ID) {
          const modal = new ModalBuilder()
            .setCustomId(STANDUP_MODAL_ID)
            .setTitle("Daily Standup");

          const input = new TextInputBuilder()
            .setCustomId(STANDUP_INPUT_ID)
            .setLabel("What did you work on today?")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(4000);

          modal.addComponents(new ActionRowBuilder().addComponents(input));

          return res.send({
            type: 9, // InteractionResponseType.MODAL
            data: modal.toJSON(),
          });
        }

        return res.status(400).send("Unknown component interaction");
      }

      if (rawInteraction.type === InteractionType.APPLICATION_COMMAND) {
        const isModalCommand = rawInteraction.data?.name === "submit-daily-report";
        const interaction = new CommandInteraction(client, rawInteraction);

        if (isModalCommand) {
          // Do not send deferred response immediately!
          // We will mock showModal to respond to the HTTP request directly
          interaction.showModal = async (modal) => {
            res.send({
              type: 9, // InteractionResponseType.MODAL
              data: modal.toJSON()
            });
          };
        } else {
          // Defer immediately for other commands
          res.send({
            type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
          });

          interaction.deferred = true;
          interaction.deferReply = async () => {
            interaction.deferred = true;
            return;
          };

          interaction.reply = async (options) => {
            return await interaction.editReply(options);
          };
        }

        if (rawInteraction.guild_id) {
          try {
            const guild = await client.guilds.fetch(rawInteraction.guild_id);
            Object.defineProperty(interaction, "guild", {
              get: () => guild,
              configurable: true,
              enumerable: true
            });
            if (rawInteraction.member && guild) {
              const member = await guild.members.fetch(rawInteraction.member.user.id);
              Object.defineProperty(interaction, "member", {
                get: () => member,
                configurable: true,
                enumerable: true
              });
            }
          } catch (err) {
            console.warn("Failed to fetch guild or member:", err.message);
          }
        }

        const optionsData = flattenCommandOptions(rawInteraction.data?.options || []);
        const userCache = {};
        const resolvedUsers = rawInteraction.data?.resolved?.users || {};

        for (const option of optionsData) {
          if ((option.type === 6 || option.type === 9) && option.value) {
            const userId = option.value;
            const resolved = resolvedUsers[userId];
            if (resolved) {
              userCache[userId] = {
                id: resolved.id,
                username: resolved.username,
                displayAvatarURL: ({ size = 256 } = {}) => {
                  return resolved.avatar
                    ? `https://cdn.discordapp.com/avatars/${resolved.id}/${resolved.avatar}.png?size=${size}`
                    : `https://cdn.discordapp.com/embed/avatars/${parseInt(resolved.discriminator || 0) % 5}.png`;
                },
              };
              continue;
            }

            try {
              const user = await client.users.fetch(userId);
              userCache[userId] = user;
            } catch (err) {
              console.warn(`Failed to fetch user ${userId}:`, err.message);
              userCache[userId] = { id: userId, displayAvatarURL: () => null };
            }
          }
        }

        interaction.options = {
          getString: (name, required = false) => {
            const value = optionsData.find(opt => opt.name === name)?.value;
            if (required && (value === undefined || value === null)) {
              throw new Error(`Missing required option: ${name}`);
            }
            return value;
          },
          getUser: (name) => {
            const userId = optionsData.find(opt => opt.name === name)?.value;
            return userId ? userCache[userId] || null : null;
          },
          getInteger: (name) => optionsData.find(opt => opt.name === name)?.value,
          getBoolean: (name) => optionsData.find(opt => opt.name === name)?.value,
          getNumber: (name) => optionsData.find(opt => opt.name === name)?.value,
          getMentionable: (name) => optionsData.find(opt => opt.name === name)?.value,
          getChannel: (name) => optionsData.find(opt => opt.name === name)?.value,
          getRole: (name) => optionsData.find(opt => opt.name === name)?.value,
          getAttachment: (name) => optionsData.find(opt => opt.name === name)?.value,
        };

        return executeCommand(interaction);
      }

      if (rawInteraction.type === InteractionType.APPLICATION_COMMAND_AUTOCOMPLETE) {
        const interaction = new AutocompleteInteraction(client, rawInteraction);
        return executeAutocomplete(interaction);
      }

      if (rawInteraction.type === 5) { // InteractionType.MODAL_SUBMIT (5)
        // Send deferred response immediately
        res.send({
          type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
          data: { flags: 64 } // Ephemeral flag (MessageFlags.Ephemeral = 64)
        });

        const interaction = new ModalSubmitInteraction(client, rawInteraction);

        if (rawInteraction.guild_id) {
          try {
            const guild = await client.guilds.fetch(rawInteraction.guild_id);
            Object.defineProperty(interaction, "guild", {
              get: () => guild,
              configurable: true,
              enumerable: true
            });
            if (rawInteraction.member && guild) {
              const member = await guild.members.fetch(rawInteraction.member.user.id);
              Object.defineProperty(interaction, "member", {
                get: () => member,
                configurable: true,
                enumerable: true
              });
            }
          } catch (err) {
            console.warn("Failed to fetch guild or member:", err.message);
          }
        }

        interaction.deferred = true;
        interaction.deferReply = async () => {
          interaction.deferred = true;
          return;
        };

        interaction.reply = async (options) => {
          return await interaction.editReply(options);
        };

        if (rawInteraction.data?.custom_id === STANDUP_MODAL_ID) {
          const standupCmd = client.commands.get("submit-daily-report");
          if (standupCmd?.handleModal) {
            try {
              await standupCmd.handleModal(interaction);
            } catch (err) {
              console.error("[standup modal] Error in webhook:", err);
              if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: "❌ Failed to save standup.", ephemeral: true });
              }
            }
          }
        }
        return;
      }

      return res.status(400).send("Unsupported interaction type");

    } catch (error) {
      console.error("Interaction Error:", error);
      return res.status(500).send("Internal Server Error");
    }
  });
}

// Always bind to the port (required for Google Cloud Run)
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Web server listening on port ${PORT}`);
});