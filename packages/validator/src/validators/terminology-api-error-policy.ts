import { isAxiosError } from 'axios';

export function isTransientTerminologyFailure(error: unknown): boolean {
  const axiosResponse = isAxiosError(error) ? error.response : undefined;
  if (!axiosResponse) return true;
  return axiosResponse.status >= 500;
}
