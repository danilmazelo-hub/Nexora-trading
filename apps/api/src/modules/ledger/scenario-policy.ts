import { Injectable } from '@nestjs/common';

/**
 * Demo scenarios that change how operations behave for one session (D06).
 * Until D06 introduces scenarios, operations never fail on purpose.
 */
@Injectable()
export class DemoScenarioPolicy {
  async operationsFail(_sessionId: string): Promise<boolean> {
    return false;
  }
}
