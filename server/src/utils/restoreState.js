let operation = null;

export function beginExclusiveOperation(name) {
  if (operation) return false;
  operation = String(name || "maintenance");
  return true;
}

export function endExclusiveOperation(name) {
  if (!name || operation === name) operation = null;
}

export function currentExclusiveOperation() {
  return operation;
}

export function isMaintenanceInProgress() {
  return Boolean(operation);
}
