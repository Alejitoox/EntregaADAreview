import {
  generateLevelZeroSchedules,
  type CourseRequirement,
  type LevelZeroResult,
} from "../../domain/scheduling/level-zero.ts";

export type UserCoursePlan = {
  userId: string;
  courses: readonly CourseRequirement[];
};

export type UserScheduleResult = LevelZeroResult & {
  userId: string;
};

/** Generates an independent level-zero result for every selected user. */
export function generateSchedulesForUsers(
  plans: readonly UserCoursePlan[],
  maxSchedulesPerUser = 100,
): UserScheduleResult[] {
  const userIds = new Set<string>();

  return plans.map(({ userId, courses }) => {
    if (!userId.trim()) throw new RangeError("Each plan must have a user ID");
    if (userIds.has(userId)) throw new RangeError(`Duplicate user plan: ${userId}`);
    userIds.add(userId);

    return {
      userId,
      ...generateLevelZeroSchedules(courses, maxSchedulesPerUser),
    };
  });
}
