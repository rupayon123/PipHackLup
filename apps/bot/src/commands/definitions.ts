import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  SlashCommandUserOption,
} from "discord.js";

const targetUserOption = (option: SlashCommandUserOption) =>
  option.setName("user").setDescription("Discord user").setRequired(true);

export const commandDefinitions = [
  new SlashCommandBuilder()
    .setName("ask")
    .setDescription(
      "Ask PipHackLup a staff-trained question about this hackathon",
    )
    .addStringOption((option) =>
      option
        .setName("question")
        .setDescription("What do you need to know?")
        .setRequired(true)
        .setMaxLength(500),
    )
    .addBooleanOption((option) =>
      option
        .setName("private")
        .setDescription("Only show the answer to you")
        .setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName("train")
    .setDescription(
      "Train PipHackLup with hackathon details and escalation rules",
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("add")
        .setDescription("Add one staff-approved answer")
        .addStringOption((option) =>
          option
            .setName("title")
            .setDescription("Short question or topic")
            .setRequired(true)
            .setMaxLength(120),
        )
        .addStringOption((option) =>
          option
            .setName("answer")
            .setDescription("Answer participants should see")
            .setRequired(true)
            .setMaxLength(1500),
        )
        .addStringOption((option) =>
          option
            .setName("keywords")
            .setDescription(
              "Comma-separated keywords, like schedule, judging, food",
            )
            .setRequired(false)
            .setMaxLength(240),
        )
        .addStringOption((option) =>
          option
            .setName("escalate")
            .setDescription("Ping humans even when this answer matches")
            .setRequired(false)
            .addChoices(
              { name: "No escalation", value: "none" },
              { name: "Mentor", value: "mentor" },
              { name: "Staff", value: "staff" },
            ),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("import")
        .setDescription("Bulk import event details")
        .addStringOption((option) =>
          option
            .setName("details")
            .setDescription(
              "Lines: Topic | Answer | keywords | none/mentor/staff",
            )
            .setRequired(true)
            .setMaxLength(4000),
        )
        .addStringOption((option) =>
          option
            .setName("default_escalation")
            .setDescription("Escalation target for plain lines")
            .setRequired(false)
            .addChoices(
              { name: "No escalation", value: "none" },
              { name: "Mentor", value: "mentor" },
              { name: "Staff", value: "staff" },
            ),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("settings")
        .setDescription(
          "Configure Q&A visibility, confidence, and ping targets",
        )
        .addRoleOption((option) =>
          option
            .setName("staff_role")
            .setDescription("Role to ping when staff must answer")
            .setRequired(false),
        )
        .addRoleOption((option) =>
          option
            .setName("mentor_role")
            .setDescription("Role to ping when mentor help is needed")
            .setRequired(false),
        )
        .addChannelOption((option) =>
          option
            .setName("help_channel")
            .setDescription("Channel where Q&A escalations should be posted")
            .setRequired(false)
            .addChannelTypes(ChannelType.GuildText),
        )
        .addIntegerOption((option) =>
          option
            .setName("confidence")
            .setDescription("Minimum confidence before staff is pinged")
            .setRequired(false)
            .setMinValue(0)
            .setMaxValue(100),
        )
        .addBooleanOption((option) =>
          option
            .setName("public_answers")
            .setDescription("Show /ask answers publicly by default")
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("list").setDescription("List trained answers"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("remove")
        .setDescription("Remove a trained answer")
        .addStringOption((option) =>
          option
            .setName("entry")
            .setDescription("Knowledge entry ID")
            .setRequired(true),
        ),
    ),
  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Configure PipHackLup for a hackathon server")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((option) =>
      option
        .setName("event")
        .setDescription("Event name")
        .setRequired(false)
        .setMaxLength(80),
    )
    .addStringOption((option) =>
      option
        .setName("onboarding")
        .setDescription("Newcomer onboarding mode")
        .setRequired(false)
        .addChoices(
          { name: "Guided", value: "guided" },
          { name: "Gated", value: "gated" },
        ),
    ),
  new SlashCommandBuilder()
    .setName("onboard")
    .setDescription("Newcomer checklist, nickname, roles, and profile helpers")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("checklist")
        .setDescription("Show your onboarding checklist"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("nickname")
        .setDescription("Set your server nickname")
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("Nickname to use in this server")
            .setRequired(true)
            .setMaxLength(32),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("profile")
        .setDescription("Create or update your hacker profile")
        .addStringOption((option) =>
          option
            .setName("skills")
            .setDescription("Comma-separated skills")
            .setRequired(true)
            .setMaxLength(160),
        )
        .addStringOption((option) =>
          option
            .setName("interests")
            .setDescription("Comma-separated interests")
            .setRequired(false)
            .setMaxLength(160),
        )
        .addStringOption((option) =>
          option
            .setName("timezone")
            .setDescription("Timezone or location")
            .setRequired(false)
            .setMaxLength(64),
        ),
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
              { name: "Judging/demo", value: "judging" },
              { name: "Staff follow-up", value: "staff" },
            ),
        )
        .addStringOption((option) =>
          option
            .setName("topic")
            .setDescription("Short topic")
            .setRequired(true)
            .setMaxLength(80),
        )
        .addStringOption((option) =>
          option
            .setName("description")
            .setDescription("What do you need?")
            .setRequired(true)
            .setMaxLength(500),
        )
        .addIntegerOption((option) =>
          option
            .setName("priority")
            .setDescription("0 low, 1 normal, 2 high, 3 urgent")
            .setRequired(false)
            .setMinValue(0)
            .setMaxValue(3),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("claim")
        .setDescription("Claim a queue ticket")
        .addStringOption((option) =>
          option
            .setName("ticket")
            .setDescription("Ticket ID")
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("escalate")
        .setDescription("Escalate a queue ticket")
        .addStringOption((option) =>
          option
            .setName("ticket")
            .setDescription("Ticket ID")
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("close")
        .setDescription("Close a queue ticket")
        .addStringOption((option) =>
          option
            .setName("ticket")
            .setDescription("Ticket ID")
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("status").setDescription("Show open queue status"),
    ),
  new SlashCommandBuilder()
    .setName("team")
    .setDescription("Create teams, recruit members, and run matching")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("create")
        .setDescription("Create a recruiting team")
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("Team name")
            .setRequired(true)
            .setMaxLength(80),
        )
        .addStringOption((option) =>
          option
            .setName("skills")
            .setDescription("Desired skills, comma-separated")
            .setRequired(false)
            .setMaxLength(160),
        )
        .addStringOption((option) =>
          option
            .setName("idea")
            .setDescription("Project idea")
            .setRequired(false)
            .setMaxLength(240),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("profile")
        .setDescription("Mark yourself as looking for a team")
        .addStringOption((option) =>
          option
            .setName("skills")
            .setDescription("Comma-separated skills")
            .setRequired(true)
            .setMaxLength(160),
        )
        .addStringOption((option) =>
          option
            .setName("interests")
            .setDescription("Comma-separated interests")
            .setRequired(false)
            .setMaxLength(160),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("match").setDescription("Suggest team matches"),
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
          option
            .setName("reason")
            .setDescription("What happened?")
            .setRequired(true)
            .setMaxLength(500),
        )
        .addStringOption((option) =>
          option
            .setName("evidence")
            .setDescription("Message URL or context")
            .setRequired(false)
            .setMaxLength(300),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("warn")
        .setDescription("Create a warning case")
        .addUserOption(targetUserOption)
        .addStringOption((option) =>
          option
            .setName("reason")
            .setDescription("Warning reason")
            .setRequired(true)
            .setMaxLength(500),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("timeout")
        .setDescription("Timeout a member and create a case")
        .addUserOption(targetUserOption)
        .addIntegerOption((option) =>
          option
            .setName("minutes")
            .setDescription("Timeout duration in minutes")
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(1440),
        )
        .addStringOption((option) =>
          option
            .setName("reason")
            .setDescription("Timeout reason")
            .setRequired(true)
            .setMaxLength(500),
        ),
    ),
].map((command) => command.toJSON());
