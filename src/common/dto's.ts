import { t, type Static } from "elysia";

export const CommonTokenDTO = t.Object({ token: t.String({ minLength: 1 }) });

export type TCommonTokenDTO = Static<typeof CommonTokenDTO>;

export const IdBasedTokenDTO = t.Object({ id: t.String({ minLength: 1 }) });

export type TIdBasedTokenDTO = Static<typeof IdBasedTokenDTO>;

export const CommonPathBasedToken = t.Object({ path: t.String({ minLength: 1 }) });

export const CommonFileBasedResponse = t.Object({ 200: t.File() });

export const InlineQueryDTO = t.Object({ inline: t.Boolean({ default: false }) });

export const FileUploadDTO = t.Object({ file: t.File(), path: t.String({ minLength: 1 }) });
