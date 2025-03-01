import { Logestic } from "logestic";
import { Elysia } from "elysia";
import {
  InternalServerErrorException,
  ServiceUnavailableException,
  MethodNotAllowedException,
  NotImplementedException,
  UnauthorizedException,
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  ImATeapotException,
  ConflictException,
  NotFoundException,
} from "./exceptions";

export * from "./exceptions";

/**
 * 400 - Bad Request
 * BadRequestException
 *
 * 401 - Unauthorized
 * UnauthorizedException
 *
 * 403 - Forbidden
 * ForbiddenException
 *
 * 404 - Not Found
 * NotFoundException
 *
 * 405 - Method Not Allowed
 * MethodNotAllowedException
 *
 * 409 - Conflict
 * ConflictException
 *
 * 418 - I'm a teapot
 * ImATeapotException
 *
 * 500 - Internal Server Error
 * InternalServerErrorException
 *
 * 501 - Not Implemented
 * NotImplementedException
 *
 * 502 - Bad Gateway
 * BadGatewayException
 *
 * 503 - Service Unavailable
 * ServiceUnavailableException
 */

export const error = new Elysia()
  .use(Logestic.preset("fancy"))
  .error({
    BadGatewayException,
    BadRequestException,
    ConflictException,
    ForbiddenException,
    ImATeapotException,
    InternalServerErrorException,
    MethodNotAllowedException,
    NotFoundException,
    NotImplementedException,
    ServiceUnavailableException,
    UnauthorizedException,
  })
  .onError({ as: "global" }, ({ code, error, logestic }) => {
    switch (code) {
      case "NOT_FOUND":
        logestic.error(`${code} : ${error}`);
        return new NotFoundException();
      case "INTERNAL_SERVER_ERROR":
        logestic.error(`${code} : ${error}`);
        return new InternalServerErrorException();
      default:
        logestic.error(`${code} : ${error}`);
        return error;
    }
  });
