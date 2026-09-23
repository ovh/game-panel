export class BufferReader {
    private offset = 0;

    constructor(private readonly buffer: Buffer) {}

    get remaining(): number {
        return this.buffer.length - this.offset;
    }

    private require(bytes: number): void {
        if (this.remaining < bytes) throw new Error('Truncated response');
    }

    uint8(): number {
        this.require(1);
        return this.buffer.readUInt8(this.offset++);
    }

    uint16LE(): number {
        this.require(2);
        const value = this.buffer.readUInt16LE(this.offset);
        this.offset += 2;
        return value;
    }

    int32LE(): number {
        this.require(4);
        const value = this.buffer.readInt32LE(this.offset);
        this.offset += 4;
        return value;
    }

    floatLE(): number {
        this.require(4);
        const value = this.buffer.readFloatLE(this.offset);
        this.offset += 4;
        return value;
    }

    skip(bytes: number): void {
        this.require(bytes);
        this.offset += bytes;
    }

    cstring(): string {
        const end = this.buffer.indexOf(0, this.offset);
        if (end < 0) throw new Error('Unterminated string in response');

        const value = this.buffer.toString('utf8', this.offset, end);
        this.offset = end + 1;
        return value;
    }
}
