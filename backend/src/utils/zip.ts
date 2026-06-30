import { createWriteStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import yauzl from 'yauzl';

function openZip(zipPath: string): Promise<yauzl.ZipFile> {
    return new Promise((resolve, reject) => {
        yauzl.open(zipPath, { lazyEntries: true }, (error, zipfile) => {
            if (error) return reject(error);
            if (!zipfile) return reject(new Error('Failed to open zip file'));
            resolve(zipfile);
        });
    });
}

function openReadStream(zipfile: yauzl.ZipFile, entry: yauzl.Entry): Promise<NodeJS.ReadableStream> {
    return new Promise((resolve, reject) => {
        zipfile.openReadStream(entry, (error, stream) => {
            if (error) return reject(error);
            if (!stream) return reject(new Error(`Failed to read zip entry: ${entry.fileName}`));
            resolve(stream);
        });
    });
}

function pipeToFile(stream: NodeJS.ReadableStream, destination: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const output = createWriteStream(destination, { mode: 0o600 });
        stream.on('error', reject);
        output.on('error', reject);
        output.on('finish', resolve);
        stream.pipe(output);
    });
}

function resolveZipEntry(destinationDir: string, fileName: string): string {
    const normalizedName = fileName.replace(/\\/g, '/');
    if (!normalizedName || normalizedName.startsWith('/') || /^[A-Za-z]:\//.test(normalizedName)) {
        throw new Error(`Refusing unsafe zip entry: ${fileName}`);
    }

    const destRoot = path.resolve(destinationDir);
    const resolved = path.resolve(destinationDir, normalizedName);
    if (resolved !== destRoot && !resolved.startsWith(destRoot + path.sep)) {
        throw new Error(`Refusing zip entry outside destination: ${fileName}`);
    }

    return resolved;
}

export async function extractZip(zipPath: string, destinationDir: string): Promise<void> {
    await fs.mkdir(destinationDir, { recursive: true });
    const zipfile = await openZip(zipPath);

    await new Promise<void>((resolve, reject) => {
        zipfile.readEntry();

        zipfile.on('entry', async (entry) => {
            try {
                const resolved = resolveZipEntry(destinationDir, entry.fileName);
                const isDirectory = /\/$/.test(entry.fileName);

                if (isDirectory) {
                    await fs.mkdir(resolved, { recursive: true });
                    zipfile.readEntry();
                    return;
                }

                await fs.mkdir(path.dirname(resolved), { recursive: true });
                const stream = await openReadStream(zipfile, entry);
                await pipeToFile(stream, resolved);
                zipfile.readEntry();
            } catch (error) {
                zipfile.close();
                reject(error);
            }
        });

        zipfile.on('end', resolve);
        zipfile.on('error', reject);
    });
}

export async function extractSingleZipEntry(zipPath: string, entryName: string, destinationDir: string): Promise<string> {
    await fs.mkdir(destinationDir, { recursive: true });
    const zipfile = await openZip(zipPath);

    return new Promise<string>((resolve, reject) => {
        zipfile.readEntry();

        zipfile.on('entry', async (entry) => {
            try {
                if (entry.fileName !== entryName) {
                    zipfile.readEntry();
                    return;
                }

                const destination = resolveZipEntry(destinationDir, path.basename(entry.fileName));
                const stream = await openReadStream(zipfile, entry);
                await pipeToFile(stream, destination);
                zipfile.close();
                resolve(destination);
            } catch (error) {
                zipfile.close();
                reject(error);
            }
        });

        zipfile.on('end', () => reject(new Error(`Zip entry not found: ${entryName}`)));
        zipfile.on('error', reject);
    });
}
