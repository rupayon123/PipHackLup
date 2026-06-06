import { createId } from "./ids.js";
import type { MemberProfile, Snowflake, TeamProfile } from "./types.js";

export interface CreateTeamInput {
  guildId: Snowflake;
  owner: MemberProfile;
  name: string;
  desiredSkills?: string[];
  projectIdea?: string;
  maxSize?: number;
  now?: string;
}

export interface MatchResult {
  teamId: string;
  addedMemberIds: Snowflake[];
  missingSkills: string[];
  score: number;
}

export function createTeam(input: CreateTeamInput): TeamProfile {
  const now = input.now ?? new Date().toISOString();
  const team: TeamProfile = {
    id: createId("team"),
    guildId: input.guildId,
    name: input.name.trim(),
    status: "recruiting",
    ownerId: input.owner.userId,
    memberIds: [input.owner.userId],
    desiredSkills: normalizeTags(input.desiredSkills ?? []),
    maxSize: input.maxSize ?? 4,
    createdAt: now,
    updatedAt: now
  };
  if (input.projectIdea) team.projectIdea = input.projectIdea.trim();
  return team;
}

export function addMemberToTeam(
  team: TeamProfile,
  memberId: Snowflake,
  now = new Date().toISOString()
): TeamProfile {
  if (team.memberIds.includes(memberId)) return team;
  if (team.memberIds.length >= team.maxSize) {
    throw new Error(`Team ${team.name} is already full`);
  }

  const memberIds = [...team.memberIds, memberId];
  return {
    ...team,
    memberIds,
    status: memberIds.length >= team.maxSize ? "full" : "recruiting",
    updatedAt: now
  };
}

export function scoreMemberForTeam(member: MemberProfile, team: TeamProfile): number {
  const skills = new Set(normalizeTags(member.skills));
  const interests = new Set(normalizeTags(member.interests));
  const desired = normalizeTags(team.desiredSkills);
  const skillMatches = desired.filter((skill) => skills.has(skill)).length;
  const ideaTokens = normalizeTags(team.projectIdea?.split(/\W+/) ?? []);
  const interestMatches = ideaTokens.filter((token) => interests.has(token)).length;
  const beginnerBonus = member.beginnerFriendly ? 1 : 0;

  return skillMatches * 4 + interestMatches * 2 + beginnerBonus;
}

export function suggestTeamMatches(
  members: MemberProfile[],
  teams: TeamProfile[],
  maxSuggestions = 6
): MatchResult[] {
  const lookingMembers = members.filter((member) => member.lookingForTeam);
  const recruitingTeams = teams.filter((team) => team.status === "recruiting");

  return recruitingTeams
    .flatMap((team) => {
      const slots = Math.max(team.maxSize - team.memberIds.length, 0);
      if (slots === 0) return [];

      const ranked = lookingMembers
        .filter((member) => !team.memberIds.includes(member.userId))
        .map((member) => ({ member, score: scoreMemberForTeam(member, team) }))
        .toSorted((left, right) => right.score - left.score || left.member.updatedAt.localeCompare(right.member.updatedAt))
        .slice(0, slots);

      const addedMemberIds = ranked.map(({ member }) => member.userId);
      const covered = new Set(
        ranked.flatMap(({ member }) => normalizeTags(member.skills)).concat(team.desiredSkills)
      );
      const missingSkills = normalizeTags(team.desiredSkills).filter((skill) => !covered.has(skill));
      const score = ranked.reduce((total, item) => total + item.score, 0);
      return [{ teamId: team.id, addedMemberIds, missingSkills, score }];
    })
    .filter((match) => match.addedMemberIds.length > 0)
    .toSorted((left, right) => right.score - left.score)
    .slice(0, maxSuggestions);
}

export function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))];
}
