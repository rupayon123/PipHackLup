const clientId = process.env.DISCORD_CLIENT_ID;

if (!clientId) {
  console.error("Set DISCORD_CLIENT_ID first.");
  process.exit(1);
}

const permissions = [
  1n << 1n, // Kick Members
  1n << 2n, // Ban Members
  1n << 4n, // Manage Channels
  1n << 5n, // Manage Guild
  1n << 10n, // View Channel
  1n << 11n, // Send Messages
  1n << 14n, // Embed Links
  1n << 15n, // Attach Files
  1n << 16n, // Read Message History
  1n << 27n, // Manage Nicknames
  1n << 28n, // Manage Roles
  1n << 34n, // Manage Threads
  1n << 40n // Moderate Members
].reduce((total, bit) => total | bit, 0n);

const url = new URL("https://discord.com/oauth2/authorize");
url.searchParams.set("client_id", clientId);
url.searchParams.set("scope", "bot applications.commands");
url.searchParams.set("permissions", permissions.toString());

console.log(url.toString());
