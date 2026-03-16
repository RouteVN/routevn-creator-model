import {
  processCommand as processCommandResult,
  validateAgainstState as validateAgainstStateResult,
  validatePayload as validatePayloadResult,
  validateState as validateStateResult,
} from "../../src/index.js";

const ERROR_NAME_BY_KIND = {
  payload: "PayloadValidationError",
  precondition: "PreconditionValidationError",
  state: "StateValidationError",
  invariant: "InvariantValidationError",
};

const unwrapValidationResult = (result) => {
  if (result.valid) {
    return;
  }

  const error = new Error(result.error.message);
  error.name = ERROR_NAME_BY_KIND[result.error.kind] ?? "DomainValidationError";
  error.code = result.error.code;
  error.details = result.error.details ?? {};
  throw error;
};

export const validateState = (args) => {
  unwrapValidationResult(validateStateResult(args));
};

export const validatePayload = (args) => {
  unwrapValidationResult(validatePayloadResult(args));
};

export const validateAgainstState = (args) => {
  unwrapValidationResult(validateAgainstStateResult(args));
};

export const processCommand = (args) => {
  const result = processCommandResult(args);
  unwrapValidationResult(result);
  return {
    state: result.state,
  };
};
