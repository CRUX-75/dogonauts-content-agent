// src/modules/job-creator.ts
export type JobPayload = Record<string, unknown>;

export interface CreatedJob {
  id?: string | number;
  type?: string;
  payload?: JobPayload;
}

export async function createJobsFromRequest(
  payload: JobPayload
): Promise<CreatedJob[]> {
  return [
    {
      id: Date.now(),
      type: "generic",
      payload,
    },
  ];
}
