import {
  PermissionFlagsBits,
  SlashCommandBuilder,
  SlashCommandUserOption
} from "discord.js";

const targetUserOption = (option: SlashCommandUserOption) =>
  option.setName("user").setDescription("Discord user").setRequired(true);

export const commandDefinitions = [
  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Configure PipHackLup for a hackathon server")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((option) =>
      option.setName("event").setDescription("Event name").setRequired(false).setMaxLength(80)
    )
    .addStringOption((option) =>
      option
        .setName("onboarding")
        .setDescription("Newcomer onboarding mode")
        .setRequired(false)
        .addChoices({ name: "Guided", value: "guided" }, { name: "Gated", value: "gated" })
    ),
  new SlashCommandBuilder()
    .setName("onboard")
    .setDescription("Newcomer checklist, nickname, roles, and profile helpers")
    .addSubcommand((subcommand) => subcommand.setName("checklist").setDescription("Show your onboarding checklist"))
    .addSubcommand((subcommand) =>
      subcommand
        .setName("nickname")
        .setDescription("Set your server nickname")
        .addStringOption((option) =>
          option.setName("name").setDescription("Nickname to use in this server").setRequired(true).setMaxLength(32)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("profile")
        .setDescription("Create or update your hacker profile")
        .addStringOption((option) =>
          option.setName("skills").setDescription("Comma-separated skills").setRequired(true).setMaxLength(160)
        )
        .addStringOption((option) =>
          option.setName("interests").setDescription("Comma-separated interests").setRequired(false).setMaxLength(160)
        )
        .addStringOption((option) =>
          option.setName("timezone").setDescription("Timezone or location").setRequired(false).setMaxLength(64)
        )
    ),
  new SlashCommandBuilder()
    .setName("queue")
    .setDescription("Open and manage mentor, tech, and judging queues")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("open")
        .setDescription("Open a help request")
        .addStringOption((option) =>
          option
            .setName("kind")
            .setDescription("Queue type")
            .setRequired(true)
            .addChoices(
              { name: "Mentor", value: "mentor" },
              { name: "Tech help", value: "tech" },
              { name: "Judging/demo", value: "judging" }
            )
        )
        .addStringOption((option) =>
          option.setName("topic").setDescription("Short topic").setRequired(true).setMaxLength(80)
        )
        .addStringOption((option) =>
          option.setName("description").setDescription("What do you need?").setRequired(true).setMaxLength(500)
        )
        .addIntegerOption((option) =>
          option
            .setName("priority")
            .setDescription("0 low, 1 normal, 2 high, 3 urgent")
            .setRequired(false)
            .setMinValue(0)
            .setMaxValue(3)
        )
      )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("claim")
        .setDescription("Claim a queue ticket")
        .addStringOption((option) => option.setName("ticket").setDescription("Ticket ID").setRequired(true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("escalate")
        .setDescription("Escalate a queue ticket")
        .addStringOption((option) => option.setName("ticket").setDescription("Ticket ID").setRequired(true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("close")
        .setDescription("Close a queue ticket")
        .addStringOption((option) => option.setName("ticket").setDescription("Ticket ID").setRequired(true))
    )
    .addSubcommand((subcommand) => subcommand.setName("status").setDescription("Show open queue status")),
  new SlashCommandBuilder()
    .setName("team")
    .setDescription("Create teams, recruit members, and run matching")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("create")
        .setDescription("Create a recruiting team")
        .addStringOption((option) => option.setName("name").setDescription("Team name").setRequired(true).setMaxLength(80))
        .addStringOption((option) =>
          option.setName("skills").setDescription("Desired skills, comma-separated").setRequired(false).setMaxLength(160)
        )
        .addStringOption((option) =>
          option.setName("idea").setDescription("Project idea").setRequired(false).setMaxLength(240)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("profile")
        .setDescription("Mark yourself as looking for a team")
        .addStringOption((option) =>
          option.setName("skills").setDescription("Comma-separated skills").setRequired(true).setMaxLength(160)
        )
        .addStringOption((option) =>
          option.setName("interests").setDescription("Comma-separated interests").setRequired(false).setMaxLength(160)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("match")
        .setDescription("Suggest team matches")
    ),
  new SlashCommandBuilder()
    .setName("mod")
    .setDescription("Reports, moderation cases, and staff actions")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("report")
        .setDescription("Report a safety or conduct issue")
        .addUserOption(targetUserOption)
        .addStringOption((option) =>
          option.setName("reason").setDescription("What happened?").setRequired(true).setMaxLength(500)
        )
        .addStringOption((option) =>
          option.setName("evidence").setDescription("Message URL or context").setRequired(false).setMaxLength(300)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("warn")
        .setDescription("Create a warning case")
        .addUserOption(targetUserOption)
        .addStringOption((option) =>
          option.setName("reason").setDescription("Warning reason").setRequired(true).setMaxLength(500)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("timeout")
        .setDescription("Timeout a member and create a case")
        .addUserOption(targetUserOption)
        .addIntegerOption((option) =>
          option.setName("minutes").setDescription("Timeout duration in minutes").setRequired(true).setMinValue(1).setMaxValue(1440)
        )
        .addStringOption((option) =>
          option.setName("reason").setDescription("Timeout reason").setRequired(true).setMaxLength(500)
        )
    )
].map((command) => command.toJSON());
