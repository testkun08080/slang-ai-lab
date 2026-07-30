import type { MeshData } from "@/lib/types";

type ObjIndex = {
  v: number;
  vt: number;
  vn: number;
};

type Bounds = {
  minX: number;
  minY: number;
  minZ: number;
  sizeX: number;
  sizeY: number;
  sizeZ: number;
};

function parseIndex(raw: string, count: number): number {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed === 0) return -1;
  if (parsed > 0) return parsed - 1;
  return count + parsed;
}

function normalizePositionsToUnitBox(positions: number[]): Float32Array {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const maxDimension = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
  const scale = maxDimension > 0 ? 2 / maxDimension : 1;

  return new Float32Array(
    positions.map((value, index) => {
      if (index % 3 === 0) return (value - centerX) * scale;
      if (index % 3 === 1) return (value - centerY) * scale;
      return (value - centerZ) * scale;
    }),
  );
}

function calculateBounds(positions: number[]): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }

  return {
    minX,
    minY,
    minZ,
    sizeX: maxX - minX,
    sizeY: maxY - minY,
    sizeZ: maxZ - minZ,
  };
}

function normalizeUv(value: number, min: number, size: number): number {
  return size > 1e-6 ? (value - min) / size : 0.5;
}

function generatePlanarUv(positions: number[], vertexIndex: number, bounds: Bounds): [number, number] {
  const offset = vertexIndex * 3;
  const x = positions[offset];
  const y = positions[offset + 1];
  const z = positions[offset + 2];

  // Project onto the two widest axes so UV-less OBJ files still preview predictably.
  if (bounds.sizeY <= bounds.sizeX && bounds.sizeY <= bounds.sizeZ) {
    return [
      normalizeUv(x, bounds.minX, bounds.sizeX),
      normalizeUv(z, bounds.minZ, bounds.sizeZ),
    ];
  }
  if (bounds.sizeX <= bounds.sizeY && bounds.sizeX <= bounds.sizeZ) {
    return [
      normalizeUv(z, bounds.minZ, bounds.sizeZ),
      normalizeUv(y, bounds.minY, bounds.sizeY),
    ];
  }
  return [
    normalizeUv(x, bounds.minX, bounds.sizeX),
    normalizeUv(y, bounds.minY, bounds.sizeY),
  ];
}

export function parseObjMesh(objText: string): MeshData {
  const positionsRaw: number[] = [];
  const normalsRaw: number[] = [];
  const texCoordsRaw: number[] = [];
  const faces: ObjIndex[][] = [];

  const lines = objText.split(/\r?\n/);
  for (const lineRaw of lines) {
    const line = lineRaw.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split(/\s+/);
    const head = parts[0];

    if (head === "v" && parts.length >= 4) {
      positionsRaw.push(Number(parts[1]), Number(parts[2]), Number(parts[3]));
      continue;
    }
    if (head === "vt" && parts.length >= 3) {
      texCoordsRaw.push(Number(parts[1]), Number(parts[2]));
      continue;
    }
    if (head === "vn" && parts.length >= 4) {
      normalsRaw.push(Number(parts[1]), Number(parts[2]), Number(parts[3]));
      continue;
    }
    if (head === "f" && parts.length >= 4) {
      const vertices = parts.slice(1).map((item) => {
        const [vRaw, vtRaw, vnRaw] = item.split("/");
        return {
          v: parseIndex(vRaw, positionsRaw.length / 3),
          vt: vtRaw ? parseIndex(vtRaw, texCoordsRaw.length / 2) : -1,
          vn: vnRaw ? parseIndex(vnRaw, normalsRaw.length / 3) : -1,
        };
      });
      faces.push(vertices);
    }
  }

  if (positionsRaw.length === 0) {
    throw new Error("OBJに頂点データ(v)がありません。");
  }

  const outPositions: number[] = [];
  const outNormals: number[] = [];
  const outTexCoords: number[] = [];
  const outIndices: number[] = [];
  const vertexMap = new Map<string, number>();
  const bounds = calculateBounds(positionsRaw);

  const ensureVertex = (idx: ObjIndex): number => {
    if (idx.v < 0 || idx.v * 3 + 2 >= positionsRaw.length) {
      throw new Error("OBJ face が不正です（v index）。");
    }
    const key = `${idx.v}/${idx.vt}/${idx.vn}`;
    const cached = vertexMap.get(key);
    if (cached !== undefined) return cached;

    const posOffset = idx.v * 3;
    outPositions.push(
      positionsRaw[posOffset],
      positionsRaw[posOffset + 1],
      positionsRaw[posOffset + 2],
    );

    if (idx.vt >= 0 && idx.vt * 2 + 1 < texCoordsRaw.length) {
      const uvOffset = idx.vt * 2;
      outTexCoords.push(texCoordsRaw[uvOffset], texCoordsRaw[uvOffset + 1]);
    } else {
      const [u, v] = generatePlanarUv(positionsRaw, idx.v, bounds);
      outTexCoords.push(u, v);
    }

    if (idx.vn >= 0 && idx.vn * 3 + 2 < normalsRaw.length) {
      const nOffset = idx.vn * 3;
      outNormals.push(normalsRaw[nOffset], normalsRaw[nOffset + 1], normalsRaw[nOffset + 2]);
    } else {
      outNormals.push(0, 1, 0);
    }

    const nextIndex = outPositions.length / 3 - 1;
    vertexMap.set(key, nextIndex);
    return nextIndex;
  };

  for (const face of faces) {
    if (face.length < 3) continue;
    const anchor = ensureVertex(face[0]);
    for (let i = 1; i < face.length - 1; i++) {
      const b = ensureVertex(face[i]);
      const c = ensureVertex(face[i + 1]);
      outIndices.push(anchor, b, c);
    }
  }

  if (outIndices.length === 0) {
    throw new Error("描画可能なfaceが見つかりません。");
  }
  if (outIndices.length > 65535) {
    throw new Error("頂点数が多すぎます（現在はUint16 indexのみ対応）。");
  }

  return {
    positions: normalizePositionsToUnitBox(outPositions),
    normals: new Float32Array(outNormals),
    texCoords: new Float32Array(outTexCoords),
    indices: new Uint16Array(outIndices),
  };
}

export function parseObjToMeshData(objText: string): { ok: true; mesh: MeshData } | { ok: false; error: string } {
  try {
    return { ok: true, mesh: parseObjMesh(objText) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "OBJの解析に失敗しました。";
    return { ok: false, error: message };
  }
}
