import { queries } from "../db/queries";
import { processCaptionJob } from "../modules/caption.engine";
import { processImageStyleJob } from "../modules/image.styler";

export async function startWorker() {
  console.log("[worker] started");
  // loop simple; en producción puedes usar setInterval o un scheduler
  setInterval(async () => {
    try {
      const job = await queries.getAndClaimJob();
      if (!job) return;

      if (job.type === "CAPTION") await processCaptionJob(job as any);
      else if (job.type === "IMAGE_STYLE") await processImageStyleJob(job as any);
      else await queries.setJobFailed(job.id, `unknown job type: ${job.type}`);
    } catch (e: any) {
      console.error("[worker] error", e.message);
    }
  }, 2000);
}
