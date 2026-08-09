import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDirectory = join(repositoryRoot, "packages/db/drizzle");
const metadataDirectory = join(migrationsDirectory, "meta");
const journalPath = join(metadataDirectory, "_journal.json");

const journal = JSON.parse(await readFile(journalPath, "utf8"));
if (!Array.isArray(journal.entries) || journal.entries.length === 0) {
  throw new Error("The Drizzle migration journal has no entries.");
}

const journalTags = journal.entries.map((entry, index) => {
  if (entry.idx !== index) {
    throw new Error(
      `Migration journal index ${entry.idx} is out of sequence; expected ${index}.`,
    );
  }
  if (typeof entry.tag !== "string" || !/^\d{4}_[a-z0-9_]+$/u.test(entry.tag)) {
    throw new Error(`Migration journal entry ${index} has an invalid tag.`);
  }
  return entry.tag;
});
const journalIndexes = journal.entries.map((entry) =>
  String(entry.idx).padStart(4, "0"),
);

const sqlTags = (await readdir(migrationsDirectory))
  .filter((name) => name.endsWith(".sql"))
  .map((name) => name.slice(0, -4))
  .sort();
const snapshotTags = (await readdir(metadataDirectory))
  .filter((name) => name.endsWith("_snapshot.json"))
  .map((name) => name.slice(0, -"_snapshot.json".length))
  .sort();
const expectedTags = [...journalTags].sort();
const expectedIndexes = [...journalIndexes].sort();

assertSameTags("SQL migration", expectedTags, sqlTags);
assertSameTags("migration snapshot", expectedIndexes, snapshotTags);

console.log(`Verified ${journalTags.length} migration journal entries.`);

function assertSameTags(label, expected, actual) {
  if (
    expected.length !== actual.length ||
    expected.some((tag, index) => tag !== actual[index])
  ) {
    throw new Error(
      `${label} files do not match the journal. Expected ${expected.join(", ")}; found ${actual.join(", ")}.`,
    );
  }
}
