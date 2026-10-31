export type IssueLevel = "info" | "degraded" | "lossy";
export interface RenderIssue {
  level: IssueLevel;
  message: string;
}
export function reportIssue(
  warnings: string[],
  issues: RenderIssue[] | undefined,
  level: IssueLevel,
  message: string,
) {
  warnings.push(message);
  issues?.push({ level, message });
}
