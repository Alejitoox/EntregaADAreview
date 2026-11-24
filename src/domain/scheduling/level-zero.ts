/** A class meeting uses a canonical day key and minutes since midnight. */
export type ScheduledMeeting = {
  day: string;
  startMinute: number;
  endMinute: number;
};

/** A section is one selectable group for a course. */
export type CourseSection = {
  id: string;
  meetings: ScheduledMeeting[];
};

export type CourseRequirement = {
  courseId: string;
  sections: CourseSection[];
};

export type LevelZeroResult = {
  schedules: CourseSection[][];
  /** True only when an additional valid schedule exists beyond the requested limit. */
  truncated: boolean;
};

/**
 * Returns a witness pair when two meetings occupy the same day and overlap.
 * Intervals are half-open: a class ending at 10:00 does not overlap one starting
 * at 10:00.
 */
export function findMeetingConflict(
  meetings: readonly ScheduledMeeting[],
): [ScheduledMeeting, ScheduledMeeting] | null {
  const ordered = [...meetings].sort(
    (left, right) =>
      left.day.localeCompare(right.day) ||
      left.startMinute - right.startMinute ||
      left.endMinute - right.endMinute,
  );

  let latestEnding: ScheduledMeeting | undefined;
  for (const meeting of ordered) {
    validateMeeting(meeting);

    if (latestEnding?.day === meeting.day && meeting.startMinute < latestEnding.endMinute) {
      return [latestEnding, meeting];
    }

    if (!latestEnding || latestEnding.day !== meeting.day || meeting.endMinute > latestEnding.endMinute) {
      latestEnding = meeting;
    }
  }

  return null;
}

/**
 * Enumerates course-section assignments while keeping the level-zero hard
 * constraint active at every choice. The default cap prevents accidental
 * generation of an unbounded result set; `truncated` reports whether more
 * valid schedules actually exist.
 */
export function generateLevelZeroSchedules(
  courses: readonly CourseRequirement[],
  maxSchedules = 100,
): LevelZeroResult {
  if (!Number.isInteger(maxSchedules) || maxSchedules < 1) {
    throw new RangeError("maxSchedules must be a positive integer");
  }

  const nodes: { courseIndex: number; section: CourseSection }[] = [];
  const nodesByCourse = courses.map((course, courseIndex) =>
    course.sections.flatMap((section) => {
      for (const meeting of section.meetings) validateMeeting(meeting);
      if (findMeetingConflict(section.meetings)) return [];

      const nodeId = nodes.length;
      nodes.push({ courseIndex, section });
      return [nodeId];
    }),
  );
  const conflictGraph = nodes.map(() => new Set<number>());

  for (let leftCourse = 0; leftCourse < nodesByCourse.length; leftCourse += 1) {
    for (let rightCourse = leftCourse + 1; rightCourse < nodesByCourse.length; rightCourse += 1) {
      for (const leftNode of nodesByCourse[leftCourse]) {
        for (const rightNode of nodesByCourse[rightCourse]) {
          if (!sectionsConflict(nodes[leftNode].section, nodes[rightNode].section)) continue;
          conflictGraph[leftNode].add(rightNode);
          conflictGraph[rightNode].add(leftNode);
        }
      }
    }
  }

  const courseDegrees = nodesByCourse.map((nodeIds, courseIndex) =>
    new Set(
      nodeIds.flatMap((nodeId) =>
        [...conflictGraph[nodeId]]
          .map((neighborId) => nodes[neighborId].courseIndex)
          .filter((neighborCourse) => neighborCourse !== courseIndex),
      ),
    ).size,
  );
  const schedules: CourseSection[][] = [];
  const selectedByCourse = new Map<number, number>();
  let truncated = false;

  function search(): void {
    if (truncated) return;

    if (selectedByCourse.size === courses.length) {
      if (schedules.length === maxSchedules) {
        truncated = true;
      } else {
        schedules.push(
          courses.map((_, courseIndex) => nodes[selectedByCourse.get(courseIndex)!].section),
        );
      }
      return;
    }

    const domains = courses.flatMap((_, courseIndex) => {
      if (selectedByCourse.has(courseIndex)) return [];
      const available = nodesByCourse[courseIndex].filter(
        (nodeId) =>
          ![...selectedByCourse.values()].some((selectedNode) =>
            conflictGraph[nodeId].has(selectedNode),
          ),
      );
      return [{ courseIndex, available }];
    });

    if (domains.some(({ available }) => available.length === 0)) return;

    domains.sort(
      (left, right) =>
        left.available.length - right.available.length ||
        courseDegrees[right.courseIndex] - courseDegrees[left.courseIndex] ||
        left.courseIndex - right.courseIndex,
    );
    const { courseIndex, available } = domains[0];
    const remainingNodeIds = domains
      .filter((domain) => domain.courseIndex !== courseIndex)
      .flatMap((domain) => domain.available);
    available.sort(
      (left, right) =>
        countBlockedOptions(left, remainingNodeIds, conflictGraph) -
          countBlockedOptions(right, remainingNodeIds, conflictGraph) ||
        left - right,
    );

    for (const nodeId of available) {
      selectedByCourse.set(courseIndex, nodeId);
      search();
      selectedByCourse.delete(courseIndex);
      if (truncated) return;
    }
  }

  search();
  return { schedules, truncated };
}

function sectionsConflict(left: CourseSection, right: CourseSection): boolean {
  return findMeetingConflict([...left.meetings, ...right.meetings]) !== null;
}

function countBlockedOptions(
  nodeId: number,
  remainingNodeIds: readonly number[],
  conflictGraph: readonly Set<number>[],
): number {
  return remainingNodeIds.reduce(
    (blocked, otherNodeId) => blocked + Number(conflictGraph[nodeId].has(otherNodeId)),
    0,
  );
}

function validateMeeting(meeting: ScheduledMeeting): void {
  if (!meeting.day.trim()) {
    throw new RangeError("Each meeting must have a non-empty canonical day");
  }
  if (
    !Number.isInteger(meeting.startMinute) ||
    !Number.isInteger(meeting.endMinute) ||
    meeting.startMinute < 0 ||
    meeting.endMinute > 24 * 60 ||
    meeting.startMinute >= meeting.endMinute
  ) {
    throw new RangeError("Meeting times must be valid minute offsets with start before end");
  }
}
