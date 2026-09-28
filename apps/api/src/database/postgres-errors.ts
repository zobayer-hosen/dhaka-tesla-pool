import { QueryFailedError } from 'typeorm';

// True when Postgres refused a write because of the given unique index
// (error code 23505 = unique_violation). Letting the index decide is race-safe:
// two requests arriving at the same moment can't both pass it.
export function isUniqueViolation(error: unknown, indexName: string): boolean {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }
  const driverError = error.driverError as {
    code?: string;
    constraint?: string;
  };
  return driverError.code === '23505' && driverError.constraint === indexName;
}
