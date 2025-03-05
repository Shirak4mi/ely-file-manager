// file-worker.ts
import { isMainThread } from "worker_threads";

if (!isMainThread) {
  self.onmessage = async (e) => {
    try {
      const { path, workerId, taskId } = e.data;

      // Use Bun's ultra-fast file API to check if file exists
      const exists = await Bun.file(path).exists();

      if (exists) {
        self.postMessage({ path, workerId, taskId });
      } else {
        self.postMessage({
          error: "File does not exist: " + path,
          workerId,
          taskId,
        });
      }
    } catch (err) {
      self.postMessage({
        error: (err as Error).message || "Unknown error",
        workerId: e.data.workerId,
        taskId: e.data.taskId,
      });
    }
  };
}
