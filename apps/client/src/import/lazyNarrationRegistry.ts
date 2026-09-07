/**
 * Keep the import job reference with the private book so later chapters can
 * be narrated after reopening the app. The server still checks ownership and
 * job availability; storing the reference does not extend local jobs' TTL.
 */
import { persistence } from '../platform/persistence';
import { privateImportJobKey } from './privateKeys';

export async function registerImportJob(bookId: string, jobId: string): Promise<void> {
  await persistence.setItem(privateImportJobKey(bookId), jobId);
}

export async function getImportJobId(bookId: string): Promise<string | undefined> {
  return (await persistence.getItem(privateImportJobKey(bookId))) ?? undefined;
}
