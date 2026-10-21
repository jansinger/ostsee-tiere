import type { UploadedFileInfo } from '#lib/types/index.ts';
import { deleteFileDirect } from '#lib/utils/uploadUtils.ts';

/**
 * Deletes multiple files from server
 */
export async function deleteMultipleFiles(uploadedFiles: UploadedFileInfo[]): Promise<void> {
	const deletePromises = uploadedFiles.map((fileInfo) => deleteFileDirect(fileInfo.filePath));

	await Promise.allSettled(deletePromises);
}
