import { ErrorResponse } from "@/common/response";
import { filterMessage } from "@/utils/functions";

import type { Elysia } from "elysia";

export default function useErrorMiddleware(app: Elysia) {
  return app.onError(async ({ code, error, request, set }): Promise<ErrorResponse> => {
    const status = set.status ?? (error as Error).message ?? 500;
    const message = filterMessage((error as Error).message);
    const timeStamp = new Date().toISOString();
    const path = request.url;
    const data = null;
    return {
      timeStamp,
      message,
      status,
      path,
      data,
      code,
    };
  });
}
