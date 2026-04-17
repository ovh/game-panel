import { serverRepository } from '../database/index.js';
import { ensureSftpUser, ensureChrootPermissions, writeSshdMatchFile } from './sftpAccounts.js';

export async function provisionSftpForServer(serverId: number): Promise<void> {
    const { username } = await ensureSftpUser(serverId);

    await ensureChrootPermissions(serverId, username);

    await serverRepository.updateSftp(serverId, username, false);

    const rows = await serverRepository.listServersWithSftpUser();
    const ids = rows.map((r: { id: number }) => r.id);
    await writeSshdMatchFile(ids);
}
