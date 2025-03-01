import { NotFoundError } from "elysia";

export class NotFoundException extends NotFoundError {
  constructor(message?: string) {
    super(message ?? "The requested resource was not found.");
    this.name = "NOT_FOUND";
  }
}
