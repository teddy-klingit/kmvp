import type { ProjectType } from "@/generated/prisma";
import { jsonArray } from "@/lib/utils";

// Rough skill needs per project type — used to score skillset match against
// each StaffMember's free-text `skills` list. Kept as simple keyword overlap
// rather than a real taxonomy, since briefs don't carry structured skill tags.
export const PROJECT_TYPE_SKILL_NEEDS: Record<ProjectType, string[]> = {
  CAMPAIGN: ["Art direction", "Copywriting", "Social formats", "Motion design"],
  SINGLE_ASSET: ["Art direction", "Copywriting"],
  PRESENTATION: ["Presentation design", "Copywriting", "Art direction"],
  MOTION_VIDEO: ["Motion design", "Video editing"],
  DEVELOPMENT: ["Platform admin"],
  BRAND_GUIDELINES: ["Art direction", "Brand voice", "Copywriting"],
  OTHER: ["Art direction", "Copywriting"],
};

type StaffForScoring = {
  id: string;
  title: string;
  skills: unknown;
  brandFitTags: unknown;
  capacityHoursPerWeek: number;
  performanceRating: number;
  user: { name: string };
  teamMemberships: {
    allocatedHours: number;
    team: {
      project: { status: string; clientId: string; client: { name: string }; name: string };
    };
  }[];
};

export type StaffingSuggestion = {
  staffMemberId: string;
  name: string;
  title: string;
  skills: string[];
  allocatedHours: number;
  capacityHoursPerWeek: number;
  availableHours: number;
  utilizationPct: number;
  matchedSkills: string[];
  skillMatchPct: number;
  workedWithClientBefore: boolean;
  pastProjectNames: string[];
  performanceRating: number;
  overallScore: number;
};

const ACTIVE_STATUSES = new Set(["ARCHIVED", "DELIVERED"]);

export function computeStaffingSuggestions(
  staff: StaffForScoring[],
  opts: { projectType: ProjectType; clientId: string }
): StaffingSuggestion[] {
  const neededSkills = PROJECT_TYPE_SKILL_NEEDS[opts.projectType] ?? [];

  return staff
    .map((s) => {
      const activeMemberships = s.teamMemberships.filter((m) => !ACTIVE_STATUSES.has(m.team.project.status));
      const allocatedHours = activeMemberships.reduce((sum, m) => sum + m.allocatedHours, 0);
      const utilizationPct = Math.min(100, Math.round((allocatedHours / s.capacityHoursPerWeek) * 100));
      const availableHours = Math.max(0, s.capacityHoursPerWeek - allocatedHours);

      const skills = jsonArray<string>(s.skills);
      const matchedSkills = neededSkills.filter((need) =>
        skills.some((skill) => skill.toLowerCase().includes(need.toLowerCase()) || need.toLowerCase().includes(skill.toLowerCase()))
      );
      const skillMatchPct = neededSkills.length > 0 ? Math.round((matchedSkills.length / neededSkills.length) * 100) : 60;

      const pastForClient = s.teamMemberships.filter((m) => m.team.project.clientId === opts.clientId);
      const workedWithClientBefore = pastForClient.length > 0;
      const pastProjectNames = pastForClient.map((m) => m.team.project.name);

      const availabilityScore = 100 - utilizationPct;
      const clientHistoryScore = workedWithClientBefore ? 100 : 30;
      const ratingScore = (s.performanceRating / 5) * 100;

      const overallScore = Math.round(
        availabilityScore * 0.3 + skillMatchPct * 0.3 + clientHistoryScore * 0.15 + ratingScore * 0.25
      );

      return {
        staffMemberId: s.id,
        name: s.user.name,
        title: s.title,
        skills,
        allocatedHours,
        capacityHoursPerWeek: s.capacityHoursPerWeek,
        availableHours,
        utilizationPct,
        matchedSkills,
        skillMatchPct,
        workedWithClientBefore,
        pastProjectNames,
        performanceRating: s.performanceRating,
        overallScore,
      };
    })
    .sort((a, b) => b.overallScore - a.overallScore);
}
