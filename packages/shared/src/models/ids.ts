import { v4 as uuidv4, validate, version } from 'uuid';

export function newId(): string {
  return uuidv4();
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && validate(value) && version(value) === 4;
}
