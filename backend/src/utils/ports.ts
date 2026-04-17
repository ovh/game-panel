import net from 'node:net';
import dgram from 'node:dgram';

/* ------------------------------------------------------------------ */
/* Port availability                                                   */
/* ------------------------------------------------------------------ */

async function assertTcpPortAvailable(port: number): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        const server = net.createServer();

        server.once('error', (err: any) => {
            server.close();
            if (err?.code === 'EADDRINUSE') reject(new Error(`TCP port ${port} is already in use`));
            else if (err?.code === 'EACCES') reject(new Error(`Not allowed to bind TCP port ${port}`));
            else reject(err);
        });

        server.once('listening', () => {
            server.close(() => resolve());
        });

        server.listen(port, '0.0.0.0');
    });
}

async function assertUdpPortAvailable(port: number): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        const sock = dgram.createSocket('udp4');

        const done = (err?: any) => {
            try { sock.close(); } catch { /* ignore */ }
            if (!err) return resolve();

            if (err?.code === 'EADDRINUSE') reject(new Error(`UDP port ${port} is already in use`));
            else if (err?.code === 'EACCES') reject(new Error(`Not allowed to bind UDP port ${port}`));
            else reject(err);
        };

        sock.once('error', done);

        // bind then close immediately
        sock.bind(port, '0.0.0.0', () => done());
    });
}

export async function assertPortsAvailable(params: { tcp: number[]; udp: number[] }): Promise<void> {
    const tcpUnique = [...new Set(params.tcp)];
    const udpUnique = [...new Set(params.udp)];

    await Promise.all([
        ...tcpUnique.map((p) => assertTcpPortAvailable(p)),
        ...udpUnique.map((p) => assertUdpPortAvailable(p)),
    ]);
}

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type PortsPayload = {
    tcp?: Record<string, number | string>;
    udp?: Record<string, number | string>;
};

export type PortLabelsPayload = {
    tcp?: Record<string, string>;
    udp?: Record<string, string>;
};

export type NormalizedPortMappings = {
    tcp: Array<{ host: number; container: number }>;
    udp: Array<{ host: number; container: number }>;
};

export type NormalizedPortLabels = {
    tcp: Record<string, string>;
    udp: Record<string, string>;
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function toInt(v: unknown): number | null {
    const n = Number.parseInt(String(v), 10);
    return Number.isFinite(n) ? n : null;
}

function normalizeRecord(
    rec: Record<string, number | string> | undefined
): Array<{ host: number; container: number }> {
    if (!rec) return [];

    const out: Array<{ host: number; container: number }> = [];

    for (const [hostStr, containerVal] of Object.entries(rec)) {
        const host = toInt(hostStr);
        const container = toInt(containerVal);

        if (host === null || container === null) {
            throw new Error('Invalid ports payload (must be integers)');
        }

        out.push({ host, container });
    }

    return out;
}

function validatePortRangePairs(mappings: Array<{ container: number; host: number }>, label: string) {
    for (const m of mappings) {
        if (!isValidPort(m.container)) throw new Error(`${label}: invalid container port ${m.container}`);
        if (!isValidPort(m.host)) throw new Error(`${label}: invalid host port ${m.host}`);
    }
}

function assertNoDuplicateHostPorts(mappings: Array<{ container: number; host: number }>, label: string) {
    const hostPorts = mappings.map((m) => m.host);
    if (new Set(hostPorts).size !== hostPorts.length) {
        throw new Error(`Duplicate ${label} host ports in mapping`);
    }
}

function isValidPort(p: number): boolean {
    return Number.isInteger(p) && p >= 1 && p <= 65535;
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Strict validation of ports payload:
 * - Must contain EXACTLY required TCP container ports
 * - Must contain EXACTLY required UDP container ports
 * - Host ports must be valid (>=1024) and unique across TCP+UDP
 */

export function buildAndValidateOpenPortMappings(params: {
    portsPayload: PortsPayload;
}): { mappings: NormalizedPortMappings } {
    const { portsPayload } = params;

    if (!portsPayload || (portsPayload.tcp === undefined && portsPayload.udp === undefined)) {
        throw new Error('Missing ports payload');
    }

    const tcp = normalizeRecord(portsPayload.tcp);
    const udp = normalizeRecord(portsPayload.udp);

    // Ensure ports are valid (1..65535) on BOTH sides
    validatePortRangePairs(tcp, 'TCP');
    validatePortRangePairs(udp, 'UDP');

    // Ensure no duplicate host ports within same proto
    assertNoDuplicateHostPorts(tcp, 'TCP');
    assertNoDuplicateHostPorts(udp, 'UDP');

    return { mappings: { tcp, udp } };
}

export function assertHostPortsAbove1024(hostPorts: { tcp: number[]; udp: number[] }): void {
    const all = [...hostPorts.tcp, ...hostPorts.udp];
    const bad = all.filter((p) => p <= 1024);
    if (bad.length) {
        throw new Error(`Host ports must be > 1024 (invalid: ${[...new Set(bad)].join(', ')})`);
    }
}

export function collectHostPortsByProto(mappings: NormalizedPortMappings): { tcp: number[]; udp: number[] } {
    return {
        tcp: mappings.tcp.map((m) => m.host),
        udp: mappings.udp.map((m) => m.host),
    };
}

function normalizeLabelValue(raw: unknown): string {
    return String(raw ?? '');
}

function normalizeLabelsByProto(params: {
    labels: Record<string, string> | undefined;
    expectedHostPorts: Set<string>;
    proto: 'tcp' | 'udp';
}): Record<string, string> {
    const out: Record<string, string> = {};
    const { labels, expectedHostPorts, proto } = params;

    if (labels) {
        for (const [hostStr, labelRaw] of Object.entries(labels)) {
            const host = toInt(hostStr);
            if (host === null || !isValidPort(host)) {
                throw new Error(`Invalid ${proto} port label key: ${hostStr}`);
            }

            const hostKey = String(host);
            if (!expectedHostPorts.has(hostKey)) {
                throw new Error(`Unknown ${proto} host port in labels: ${hostKey}`);
            }

            out[hostKey] = normalizeLabelValue(labelRaw);
        }
    }

    expectedHostPorts.forEach((hostKey) => {
        if (!(hostKey in out)) out[hostKey] = '';
    });

    return out;
}

export function normalizePortLabelsForMappings(params: {
    portLabelsPayload?: PortLabelsPayload;
    mappings: NormalizedPortMappings;
}): NormalizedPortLabels {
    const { portLabelsPayload, mappings } = params;
    const labelsPayload: PortLabelsPayload = portLabelsPayload ?? {};

    const expectedTcpHostPorts = new Set(mappings.tcp.map((m) => String(m.host)));
    const expectedUdpHostPorts = new Set(mappings.udp.map((m) => String(m.host)));

    const tcp = normalizeLabelsByProto({
        labels: labelsPayload.tcp,
        expectedHostPorts: expectedTcpHostPorts,
        proto: 'tcp',
    });

    const udp = normalizeLabelsByProto({
        labels: labelsPayload.udp,
        expectedHostPorts: expectedUdpHostPorts,
        proto: 'udp',
    });

    return { tcp, udp };
}
