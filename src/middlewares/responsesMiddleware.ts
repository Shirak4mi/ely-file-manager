import { ErrorResponse, SuccessResponse } from "@/common/response.ts";
import { filterMessage } from "@/utils/functions";

import type { Elysia } from "elysia";

export function successResponseMiddleware(app: Elysia) {
  return app.onAfterHandle(async ({ set, request, response }): Promise<SuccessResponse> => {
    const timeStamp = new Date().toISOString();
    const status = set.status ?? 200;
    const message = "success";
    const path = request.url;
    const data = response;
    return {
      timeStamp,
      message,
      status,
      path,
      data,
    };
  });
}

export function errorMiddleware(app: Elysia) {
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
