import { HttpError } from "../../functions/src/utils/errors";
import { requireFirebaseAuth, type AuthenticatedRequest } from "../middleware/auth";

describe("gymai-server — auth middleware (unit)", () => {
  it("rejects requests with no Authorization header", (done) => {
    const req = { header: () => undefined } as unknown as AuthenticatedRequest;
    const res = {} as Parameters<typeof requireFirebaseAuth>[1];
    requireFirebaseAuth(req, res, (err: unknown) => {
      expect(err).toBeInstanceOf(HttpError);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((err as any).code).toBe("unauthenticated");
      done();
    });
  });

  it("rejects requests with a non-Bearer Authorization header", (done) => {
    const req = {
      header: (name: string) =>
        name.toLowerCase() === "authorization" ? "Basic abc" : undefined,
    } as unknown as AuthenticatedRequest;
    const res = {} as Parameters<typeof requireFirebaseAuth>[1];
    requireFirebaseAuth(req, res, (err: unknown) => {
      expect(err).toBeInstanceOf(HttpError);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((err as any).code).toBe("unauthenticated");
      done();
    });
  });

  it("rejects requests with an empty bearer token", (done) => {
    const req = {
      header: () => "Bearer   ",
    } as unknown as AuthenticatedRequest;
    const res = {} as Parameters<typeof requireFirebaseAuth>[1];
    requireFirebaseAuth(req, res, (err: unknown) => {
      expect(err).toBeInstanceOf(HttpError);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((err as any).code).toBe("unauthenticated");
      done();
    });
  });
});
