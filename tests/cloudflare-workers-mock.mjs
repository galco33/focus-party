export const env = {};

export class DurableObject {
  constructor(ctx, workerEnv) {
    this.ctx = ctx;
    this.env = workerEnv;
  }
}
