/** A value that can be a string, number, boolean, or a nested object with MetaValue properties */
export type MetaValue = string | number | boolean | { [key: string]: MetaValue };

/** An object with string keys and MetaValue values, allowing nested structures */
export type Meta = { [key: string]: MetaValue };

/** The log level indicating severity */
export type LogLevel = "INFO" | "ERROR" | "DEBUG" | "WARN";
