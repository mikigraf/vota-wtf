const VERSION = 6;
const SIZE = 21 + (VERSION - 1) * 4;
const DATA_CODEWORDS = 136;
const BLOCK_DATA_CODEWORDS = 68;
const ECC_CODEWORDS = 18;
const ALIGNMENT_POSITIONS = [6, 34];

type Matrix = boolean[][];

function makeMatrix(fill = false): Matrix {
  return Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => fill));
}

function setModule(matrix: Matrix, reserved: Matrix, x: number, y: number, dark: boolean, reserve = true) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
  matrix[y][x] = dark;
  if (reserve) reserved[y][x] = true;
}

function drawFinder(matrix: Matrix, reserved: Matrix, x: number, y: number) {
  for (let dy = -1; dy <= 7; dy += 1) {
    for (let dx = -1; dx <= 7; dx += 1) {
      const xx = x + dx;
      const yy = y + dy;
      const inCore = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6;
      const dark = inCore && (dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4));
      setModule(matrix, reserved, xx, yy, dark);
    }
  }
}

function drawAlignment(matrix: Matrix, reserved: Matrix, centerX: number, centerY: number) {
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      const distance = Math.max(Math.abs(dx), Math.abs(dy));
      setModule(matrix, reserved, centerX + dx, centerY + dy, distance !== 1);
    }
  }
}

function drawFunctionPatterns(matrix: Matrix, reserved: Matrix) {
  drawFinder(matrix, reserved, 0, 0);
  drawFinder(matrix, reserved, SIZE - 7, 0);
  drawFinder(matrix, reserved, 0, SIZE - 7);
  for (let i = 8; i < SIZE - 8; i += 1) {
    setModule(matrix, reserved, i, 6, i % 2 === 0);
    setModule(matrix, reserved, 6, i, i % 2 === 0);
  }
  for (const x of ALIGNMENT_POSITIONS) {
    for (const y of ALIGNMENT_POSITIONS) {
      const overlapsFinder = (x === 6 && y === 6) || (x === 6 && y === SIZE - 7) || (x === SIZE - 7 && y === 6);
      if (!overlapsFinder) drawAlignment(matrix, reserved, x, y);
    }
  }
  for (let i = 0; i < 9; i += 1) {
    setModule(matrix, reserved, 8, i, false);
    setModule(matrix, reserved, i, 8, false);
  }
  for (let i = 0; i < 8; i += 1) {
    setModule(matrix, reserved, SIZE - 1 - i, 8, false);
    setModule(matrix, reserved, 8, SIZE - 1 - i, false);
  }
  setModule(matrix, reserved, 8, SIZE - 8, true);
}

function gfMultiply(a: number, b: number) {
  let result = 0;
  for (let i = 0; i < 8; i += 1) {
    if ((b & 1) !== 0) result ^= a;
    const carry = (a & 0x80) !== 0;
    a = (a << 1) & 0xff;
    if (carry) a ^= 0x1d;
    b >>>= 1;
  }
  return result;
}

function gfPow(power: number) {
  let result = 1;
  for (let i = 0; i < power; i += 1) result = gfMultiply(result, 2);
  return result;
}

function reedSolomonGenerator(degree: number) {
  let result = [1];
  for (let i = 0; i < degree; i += 1) {
    const root = gfPow(i);
    const next = Array.from({ length: result.length + 1 }, () => 0);
    for (let j = 0; j < result.length; j += 1) {
      next[j] ^= gfMultiply(result[j], root);
      next[j + 1] ^= result[j];
    }
    result = next;
  }
  return result.slice(1);
}

function reedSolomonRemainder(data: number[]) {
  const generator = reedSolomonGenerator(ECC_CODEWORDS);
  const result = Array.from({ length: ECC_CODEWORDS }, () => 0);
  for (const value of data) {
    const factor = value ^ result.shift()!;
    result.push(0);
    for (let i = 0; i < generator.length; i += 1) {
      result[i] ^= gfMultiply(generator[i], factor);
    }
  }
  return result;
}

function pushBits(bits: number[], value: number, length: number) {
  for (let i = length - 1; i >= 0; i -= 1) bits.push((value >>> i) & 1);
}

function encodeData(value: string) {
  const bytes = Array.from(new TextEncoder().encode(value));
  const maxPayloadBytes = DATA_CODEWORDS - 2;
  if (bytes.length > maxPayloadBytes) {
    throw new Error(`QR payload is too long. Maximum ${maxPayloadBytes} bytes.`);
  }
  const bits: number[] = [];
  pushBits(bits, 0b0100, 4);
  pushBits(bits, bytes.length, 8);
  for (const byte of bytes) pushBits(bits, byte, 8);
  const capacityBits = DATA_CODEWORDS * 8;
  pushBits(bits, 0, Math.min(4, capacityBits - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    data.push(bits.slice(i, i + 8).reduce((sum, bit) => (sum << 1) | bit, 0));
  }
  for (let pad = 0; data.length < DATA_CODEWORDS; pad += 1) data.push(pad % 2 === 0 ? 0xec : 0x11);
  return data;
}

function interleaveBlocks(data: number[]) {
  const blocks = [
    data.slice(0, BLOCK_DATA_CODEWORDS),
    data.slice(BLOCK_DATA_CODEWORDS, BLOCK_DATA_CODEWORDS * 2)
  ];
  const eccBlocks = blocks.map(reedSolomonRemainder);
  const result: number[] = [];
  for (let i = 0; i < BLOCK_DATA_CODEWORDS; i += 1) {
    for (const block of blocks) result.push(block[i]);
  }
  for (let i = 0; i < ECC_CODEWORDS; i += 1) {
    for (const block of eccBlocks) result.push(block[i]);
  }
  return result;
}

function maskBit(mask: number, x: number, y: number) {
  if (mask === 0) return (x + y) % 2 === 0;
  if (mask === 1) return y % 2 === 0;
  if (mask === 2) return x % 3 === 0;
  if (mask === 3) return (x + y) % 3 === 0;
  if (mask === 4) return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
  if (mask === 5) return ((x * y) % 2) + ((x * y) % 3) === 0;
  if (mask === 6) return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
  return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
}

function placeData(matrix: Matrix, reserved: Matrix, codewords: number[]) {
  const bits = codewords.flatMap((byte) => Array.from({ length: 8 }, (_, index) => (byte >>> (7 - index)) & 1));
  let bitIndex = 0;
  let upward = true;
  for (let right = SIZE - 1; right >= 1; right -= 2) {
    if (right === 6) right -= 1;
    for (let vertical = 0; vertical < SIZE; vertical += 1) {
      const y = upward ? SIZE - 1 - vertical : vertical;
      for (let dx = 0; dx < 2; dx += 1) {
        const x = right - dx;
        if (!reserved[y][x]) {
          matrix[y][x] = (bits[bitIndex] || 0) === 1;
          bitIndex += 1;
        }
      }
    }
    upward = !upward;
  }
}

export function formatBits(mask: number) {
  let value = (0b01 << 3) | mask;
  let bits = value << 10;
  const generator = 0x537;
  for (let i = 14; i >= 10; i -= 1) {
    if (((bits >>> i) & 1) !== 0) bits ^= generator << (i - 10);
  }
  return (((value << 10) | bits) ^ 0x5412) & 0x7fff;
}

function drawFormatBits(matrix: Matrix, mask: number) {
  const bits = formatBits(mask);
  const bit = (index: number) => ((bits >>> index) & 1) !== 0;
  for (let i = 0; i <= 5; i += 1) matrix[i][8] = bit(i);
  matrix[7][8] = bit(6);
  matrix[8][8] = bit(7);
  matrix[8][7] = bit(8);
  for (let i = 9; i < 15; i += 1) matrix[8][14 - i] = bit(i);
  for (let i = 0; i < 8; i += 1) matrix[8][SIZE - 1 - i] = bit(i);
  for (let i = 8; i < 15; i += 1) matrix[SIZE - 15 + i][8] = bit(i);
  matrix[SIZE - 8][8] = true;
}

function applyMask(base: Matrix, reserved: Matrix, mask: number) {
  const matrix = base.map((row) => row.slice());
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      if (!reserved[y][x] && maskBit(mask, x, y)) matrix[y][x] = !matrix[y][x];
    }
  }
  drawFormatBits(matrix, mask);
  return matrix;
}

function runPenalty(line: boolean[]) {
  let penalty = 0;
  let runColor = line[0];
  let runLength = 1;
  for (let i = 1; i < line.length; i += 1) {
    if (line[i] === runColor) runLength += 1;
    else {
      if (runLength >= 5) penalty += 3 + runLength - 5;
      runColor = line[i];
      runLength = 1;
    }
  }
  if (runLength >= 5) penalty += 3 + runLength - 5;
  return penalty;
}

function penaltyScore(matrix: Matrix) {
  let penalty = 0;
  for (let y = 0; y < SIZE; y += 1) penalty += runPenalty(matrix[y]);
  for (let x = 0; x < SIZE; x += 1) penalty += runPenalty(matrix.map((row) => row[x]));
  for (let y = 0; y < SIZE - 1; y += 1) {
    for (let x = 0; x < SIZE - 1; x += 1) {
      const color = matrix[y][x];
      if (matrix[y][x + 1] === color && matrix[y + 1][x] === color && matrix[y + 1][x + 1] === color) penalty += 3;
    }
  }
  const dark = matrix.flat().filter(Boolean).length;
  penalty += Math.floor(Math.abs((dark * 20) / (SIZE * SIZE) - 10)) * 10;
  return penalty;
}

export function createQrCode(value: string) {
  const matrix = makeMatrix();
  const reserved = makeMatrix();
  drawFunctionPatterns(matrix, reserved);
  placeData(matrix, reserved, interleaveBlocks(encodeData(value)));
  const candidates = Array.from({ length: 8 }, (_, mask) => ({
    mask,
    matrix: applyMask(matrix, reserved, mask)
  }));
  return candidates.reduce((best, current) => (penaltyScore(current.matrix) < penaltyScore(best.matrix) ? current : best), candidates[0]);
}

export function createQrMatrix(value: string) {
  return createQrCode(value).matrix;
}

export function QrCode({ value, title = "QR code", className = "aspect-square w-full max-w-[280px] bg-white" }: { value: string; title?: string; className?: string }) {
  let matrix: Matrix | undefined;
  let error = "";
  try {
    matrix = createQrMatrix(value);
  } catch (err) {
    error = err instanceof Error ? err.message : "QR code could not be generated.";
  }
  if (!matrix) {
    return (
      <div className={`${className} flex flex-col items-center justify-center gap-3 p-4 text-center text-sm font-bold text-ink`}>
        <span>{error}</span>
        <span className="break-all text-xs text-muted">{value}</span>
      </div>
    );
  }
  const cells = matrix.flatMap((row, y) =>
    row.map((dark, x) => (dark ? <rect key={`${x}-${y}`} x={x + 4} y={y + 4} width="1" height="1" /> : null))
  );
  return (
    <svg
      viewBox={`0 0 ${SIZE + 8} ${SIZE + 8}`}
      role="img"
      aria-label={title}
      shapeRendering="crispEdges"
      className={className}
    >
      <title>{title}</title>
      <rect width={SIZE + 8} height={SIZE + 8} fill="white" />
      <g fill="#0B0B0C">{cells}</g>
    </svg>
  );
}
