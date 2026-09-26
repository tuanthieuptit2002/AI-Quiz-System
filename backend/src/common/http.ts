import { ObjectId } from 'mongodb';

export function httpError(status: number, message: string): never {
  throw Object.assign(new Error(message), { status });
}
export function objectId(value: unknown) {
  if (typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value))
    httpError(400, 'ID không hợp lệ.');
  return new ObjectId(value);
}

export const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
