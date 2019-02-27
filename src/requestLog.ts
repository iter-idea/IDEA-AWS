/**
 * The interface to insert the log of a request, in IDEA's format.
 */
export interface RequestLog {
  /**
   * The key to identify the log stream; in a team-centric scenario could be equal to the `teamId`.
   */
  key: string;
  /**
   * Timestamp (epoch, in ms) in which the log was captured, concatenated to _UUID;
   * in this way, if two requests are executed in the exact same time in the same log stream,
   * they will be both stored.
   */
  at: string;
  /**
   * TTL of the record (in seconds); it's usually a month after the insertion.
   */
  expiresAt: number;
  /**
   * User id linked to the log.
   */
  userId: string;
  /**
   * The resource involved in the log; e.g. `/orders` or `/orders/{orderId}/items`.
   */
  resource: string;
  /**
   * The identifier of a specific element of the resource (`proxy`).
   */
  resourceId: string;
  /**
   * Enum: HTTP method (POST, GET, etc.).
   */
  method: string;
  /**
   * Action detail; valid (mostly) for PATCH requests.
   */
  action: string;
  /**
   * If true, the request succeeded.
   */
  requestSucceeded: boolean;
  /**
   * For complex logs, it contains extra information.
   */
  description?: string;
}
