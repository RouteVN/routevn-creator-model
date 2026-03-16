const createDomainError = ({ name, code, message, details = {} }) => {
  const error = new Error(message);
  error.name = name;
  error.code = code;
  error.details = details;
  return error;
};

export const createPayloadValidationError = (message, details) =>
  createDomainError({
    name: "PayloadValidationError",
    code: "payload_validation_failed",
    message,
    details,
  });

export const createPreconditionValidationError = (message, details) =>
  createDomainError({
    name: "PreconditionValidationError",
    code: "precondition_validation_failed",
    message,
    details,
  });

export const createStateValidationError = (message, details) =>
  createDomainError({
    name: "StateValidationError",
    code: "state_validation_failed",
    message,
    details,
  });

export const createInvariantValidationError = (message, details) =>
  createDomainError({
    name: "InvariantValidationError",
    code: "invariant_validation_failed",
    message,
    details,
  });
