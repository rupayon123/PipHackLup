export type SecurityFindingSeverity = "medium" | "high";

export interface SecurityFinding {
  code: string;
  severity: SecurityFindingSeverity;
  message: string;
}

export class KnowledgeSafetyError extends Error {
  findings: SecurityFinding[];

  constructor(findings: SecurityFinding[]) {
    super("Training content matched prompt-injection safety filters.");
    this.name = "KnowledgeSafetyError";
    this.findings = findings;
  }
}

interface PromptInjectionRule {
  code: string;
  severity: SecurityFindingSeverity;
  pattern: RegExp;
  message: string;
}

const promptInjectionRules: PromptInjectionRule[] = [
  {
    code: "instruction_override",
    severity: "high",
    pattern:
      /\b(ignore|disregard|forget|override|bypass)\b.{0,80}\b(previous|prior|above|system|developer|instructions?|rules?|policy|safety)\b/i,
    message: "Attempts to override higher-priority instructions.",
  },
  {
    code: "hidden_prompt_exfiltration",
    severity: "high",
    pattern:
      /\b(show|reveal|print|leak|dump|repeat)\b.{0,80}\b(system prompt|developer message|hidden instructions?|internal prompt|secrets?|tokens?|api keys?)\b/i,
    message: "Requests hidden prompts, tokens, or private instructions.",
  },
  {
    code: "role_impersonation",
    severity: "high",
    pattern:
      /\b(act as|pretend to be|you are now|developer mode|jailbreak|dan mode)\b/i,
    message: "Attempts to force the assistant into a different role.",
  },
  {
    code: "tool_or_secret_abuse",
    severity: "high",
    pattern:
      /\b(exfiltrate|send|post|upload|copy)\b.{0,80}\b(secret|token|api key|private key|client secret|database url|database_url)\b/i,
    message: "Attempts to move secrets or private credentials.",
  },
  {
    code: "safety_disable",
    severity: "medium",
    pattern:
      /\b(disable|turn off|remove)\b.{0,80}\b(moderation|guardrails?|filters?|rate limits?|safety checks?)\b/i,
    message: "Attempts to disable safety controls.",
  },
];

export function analyzePromptInjectionRisk(text: string): SecurityFinding[] {
  const value = text.trim();
  if (!value) return [];

  const findings: SecurityFinding[] = [];
  for (const rule of promptInjectionRules) {
    if (!rule.pattern.test(value)) continue;
    findings.push({
      code: rule.code,
      severity: rule.severity,
      message: rule.message,
    });
  }

  return findings;
}

export function hasHighRiskPromptInjection(text: string): boolean {
  return analyzePromptInjectionRisk(text).some(
    (finding) => finding.severity === "high",
  );
}

export function assertKnowledgeTrainingIsSafe(input: {
  title: string;
  answer: string;
}): void {
  const findings = analyzePromptInjectionRisk(
    `${input.title.trim()}\n${input.answer.trim()}`,
  ).filter((finding) => finding.severity === "high");

  if (findings.length > 0) {
    throw new KnowledgeSafetyError(findings);
  }
}
