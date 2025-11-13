// src/workers/createPostHandler.ts
import { logger } from "../utils/logger.js";
import { runCreatePostPipeline } from "./createPost.pipeline.js";

type CreatePostPayload = {
  channel_target?: "IG" | "FB" | "BOTH";
  source?: string;
};

type CreatePostJob = {
  id: string;
  type: "CREATE_POST";
  payload: CreatePostPayload;
};

export async function createPostHandler(job: CreatePostJob) {
  try {
    logger.info({ jobId: job.id, payload: job.payload }, "[CREATE_POST_HANDLER] start");
    await runCreatePostPipeline(job);
    logger.info({ jobId: job.id }, "[CREATE_POST_HANDLER] done");
  } catch (err) {
    logger.error({ jobId: job.id, err }, "[CREATE_POST_HANDLER] failed");
    throw err;
  }
}

export default createPostHandler;
