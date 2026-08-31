import type { ValueSetValidator } from "../../validators/valueset-validator";

export type TerminologyBindingValidationPort = Pick<
  ValueSetValidator,
  "validateBinding"
>;

export type TerminologyCodeSystemValidationPort = Pick<
  ValueSetValidator,
  "validateCodeInCodeSystem" | "validateCodeInLocalCodeSystemOnly"
>;

export type TerminologyValidationPort = Pick<
  ValueSetValidator,
  | "setResolutionConfig"
  | "getResolutionConfig"
  | "clearCache"
  | "resolveCodeMembership"
  | "resolveSubsumption"
> &
  TerminologyBindingValidationPort &
  TerminologyCodeSystemValidationPort;
