import { logger } from '../logger';
import { getMaxRemoteCodeSystemValidations } from './terminology-api-remote-policy';
import type { TerminologyResolutionConfig } from './valueset-types';

export class RemoteCodeSystemValidationBudget {
  private validationCount = 0;
  private exhaustionWarningLogged = false;

  reset(): void {
    this.validationCount = 0;
    this.exhaustionWarningLogged = false;
  }

  reserve(serverUrl: string, config: TerminologyResolutionConfig): boolean {
    const maxValidations = getMaxRemoteCodeSystemValidations(config);
    if (this.validationCount >= maxValidations) {
      if (!this.exhaustionWarningLogged) {
        logger.warn(
          `[TerminologyApiClient] Remote CodeSystem validation budget exhausted ` +
          `(${this.validationCount}/${maxValidations}) for ${serverUrl}; ` +
          `failing open for further direct CodeSystem checks`,
        );
        this.exhaustionWarningLogged = true;
      }
      return false;
    }

    this.validationCount++;
    return true;
  }
}
