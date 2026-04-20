import { ArgumentsHost, Catch, ExceptionFilter } from "@nestjs/common";
import { GqlValidationFilter } from "./gql-validation.filter";
import { HttpExceptionFilter } from "./http-exception.filter";

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly gqlFilter = new GqlValidationFilter();
  private readonly httpFilter = new HttpExceptionFilter();

  catch(exception: unknown, host: ArgumentsHost) {
    // ─────────────────────────────────────────────
    // GRAPHQL CONTEXT (delegates only)
    // ─────────────────────────────────────────────
    if (this.isGraphQL(host)) {
      return this.gqlFilter.catch(exception as any, host);
    }

    // ─────────────────────────────────────────────
    // HTTP CONTEXT (delegates only)
    // ─────────────────────────────────────────────
    const type = host.getType<"http" | "ws" | "rpc">();

    if (type === "http") {
      return this.httpFilter.catch(exception, host);
    }

    // ─────────────────────────────────────────────
    // WS CONTEXT
    // ─────────────────────────────────────────────
    if (type === "ws") {
      const client = host.switchToWs().getClient();

      client.emit("error", {
        message:
          exception instanceof Error
            ? exception.message
            : "Internal server error",
      });
    }
  }

  // ✅ Correct GraphQL detection (no TS error)
  private isGraphQL(host: ArgumentsHost): boolean {
    return host.getType<any>() === "graphql";
  }
}
